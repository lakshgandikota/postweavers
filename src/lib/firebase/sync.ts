/**
 * Firestore sync for the AI drafter "brain"
 *
 * Syncs the settings that make drafts sound like the user — persona, learned
 * voice profile, custom instructions/strategy, defaults — to
 * users/{uid}/settings/drafter so the iOS/Android apps share them.
 *
 * The LLM API key is NEVER synced: each device holds its own copy locally.
 *
 * Strategy: last-write-wins on a syncedAt timestamp; push on local change
 * (debounced), pull on background startup. Best-effort — the extension is
 * fully functional offline.
 */

import type { AiDrafterSettings } from '../../types/ai-drafter';
import { getAiDrafterSettings, updateAiDrafterSettings } from '../storage';
import { getAuth } from './auth';
import { FIRESTORE_URL } from './config';

/** Fields of AiDrafterSettings that sync across devices (never the apiKey) */
const SYNCED_FIELDS = [
  'persona',
  'voiceProfile',
  'voiceLearnedAt',
  'voiceSourceCount',
  'customInstructions',
  'customStrategy',
  'defaultStrategy',
  'contextDefaults',
  'maxTokens',
] as const;

type SyncedSettings = Pick<AiDrafterSettings, (typeof SYNCED_FIELDS)[number]>;

const LAST_SYNC_KEY = 'postweaver_drafter_synced_at';

function docUrl(uid: string): string {
  return `${FIRESTORE_URL}/users/${uid}/settings/drafter`;
}

/**
 * Push local drafter settings to Firestore. Debounce at the call site.
 */
export async function pushDrafterSettings(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;

  const settings = await getAiDrafterSettings();
  const synced: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS) {
    synced[field] = settings[field];
  }
  const syncedAt = Date.now();

  try {
    const response = await fetch(docUrl(auth.uid), {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${auth.idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          data: { stringValue: JSON.stringify(synced) },
          syncedAt: { integerValue: String(syncedAt) },
          source: { stringValue: 'extension' },
        },
      }),
    });
    if (!response.ok) {
      console.warn('[Postweaver] Settings push failed:', response.status);
      return false;
    }
    await chrome.storage.local.set({ [LAST_SYNC_KEY]: syncedAt });
    console.log('[Postweaver] Drafter settings pushed to Firestore');
    return true;
  } catch (error) {
    console.warn('[Postweaver] Settings push unreachable:', error);
    return false;
  }
}

/**
 * Pull remote settings and apply them if newer than our last sync.
 * Called on background startup.
 */
export async function pullDrafterSettings(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;

  try {
    const response = await fetch(docUrl(auth.uid), {
      headers: { authorization: `Bearer ${auth.idToken}` },
    });
    if (response.status === 404) return false; // Never synced from anywhere
    if (!response.ok) return false;

    const doc = await response.json();
    const remoteSyncedAt = Number(doc.fields?.syncedAt?.integerValue ?? 0);
    const dataJson = doc.fields?.data?.stringValue;
    if (!dataJson || !remoteSyncedAt) return false;

    const stored = await chrome.storage.local.get(LAST_SYNC_KEY);
    const localSyncedAt = Number(stored[LAST_SYNC_KEY] ?? 0);
    if (remoteSyncedAt <= localSyncedAt) return false; // We're current

    const remote = JSON.parse(dataJson) as Partial<SyncedSettings>;
    applyingRemote = true;
    try {
      await updateAiDrafterSettings(remote);
    } finally {
      // Give the storage.onChanged listener a tick to observe the flag
      setTimeout(() => {
        applyingRemote = false;
      }, 500);
    }
    await chrome.storage.local.set({ [LAST_SYNC_KEY]: remoteSyncedAt });
    console.log('[Postweaver] Drafter settings pulled from Firestore');
    return true;
  } catch (error) {
    console.warn('[Postweaver] Settings pull unreachable:', error);
    return false;
  }
}

/** True while a pulled remote change is being written to local storage */
let applyingRemote = false;

/** Debounced push scheduler for settings-change subscriptions */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePush(delayMs = 3000): void {
  if (applyingRemote) return; // Change originated remotely; don't echo it back
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushDrafterSettings();
  }, delayMs);
}
