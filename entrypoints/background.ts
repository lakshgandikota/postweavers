import { getSettings, updateSettings, resetSettings, getCaptureSettings, getAiDrafterSettings, updateAiDrafterSettings, getContextBasket } from '../src/lib/storage';
import { onMessage, sendMessageToTab } from '../src/lib/messaging';
import type { ExtensionMessage } from '../src/types/messages';
import {
  deleteTweetsBefore,
  deleteProfilesBefore,
  deleteProfileHistoryBefore,
  upsertTweet,
  upsertProfile,
  addProfileSnapshot,
  getVoiceExampleTweets,
  getRecentOwnTweets,
  getProfileByHandle,
  getTweetsByAuthor,
} from '../src/lib/db';
import { buildPrompt, buildVoiceLearningPrompt, streamDraft, completeText } from '../src/lib/ai-drafter';
import {
  pullDrafterSettings,
  pushDrafterSettings,
  schedulePush,
  syncTopics,
  scheduleTopicsPush,
  linkWithGoogle,
  getSyncAccountEmail,
  getRedirectUri,
  getAuth as getFirebaseAuth,
  getBillingStatus,
} from '../src/lib/firebase';
import { getAllTopics, TOPICS_STORAGE_KEY } from '../src/lib/topics';
import type { AiDrafterSettings } from '../src/types/ai-drafter';

/**
 * Resolve LLM credentials per the key mode: managed mode needs a Firebase
 * ID token; BYO needs the local API key. Returns an error string when the
 * mode's prerequisite is missing.
 */
async function resolveLlmAccess(
  settings: AiDrafterSettings
): Promise<{ managed: { idToken: string } | null } | { error: string }> {
  if (settings.keyMode === 'managed') {
    const auth = await getFirebaseAuth();
    if (!auth) {
      return { error: 'PostWeaver Cloud needs a connection. Sign in (or retry) in AI Reply settings.' };
    }
    return { managed: { idToken: auth.idToken } };
  }
  if (!settings.apiKey) {
    return { error: 'No API key configured. Add one in AI Reply settings, or switch to PostWeaver Cloud.' };
  }
  return { managed: null };
}
import type { ResolvedContext, TopicContext } from '../src/lib/ai-drafter';
import type { DraftPortMessage, DraftPortRequest, DraftRequest } from '../src/types/ai-drafter';
import { DRAFT_PORT_NAME } from '../src/types/ai-drafter';

/**
 * X.com domain patterns for tab queries
 */
const X_DOMAINS = [
  '*://twitter.com/*',
  '*://x.com/*',
  '*://pro.twitter.com/*',
  '*://pro.x.com/*',
];

/**
 * Check if a URL is an X.com domain
 */
function isXDomain(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return ['twitter.com', 'x.com', 'pro.twitter.com', 'pro.x.com'].some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * Update side panel availability for a specific tab
 * Enabled for X.com tabs, disabled for all others
 */
async function updateSidePanelForTab(tabId: number, url: string | undefined): Promise<void> {
  const isXSite = isXDomain(url);
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: isXSite,
    });
    if (isXSite) {
      console.log(`[Postweaver] Side panel enabled for tab ${tabId}`);
    }
  } catch (error) {
    // Ignore errors for tabs that don't support side panel (e.g., chrome:// pages)
  }
}

/**
 * Broadcast settings change to all X.com tabs
 */
async function broadcastSettingsChange(): Promise<void> {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ url: X_DOMAINS });

  for (const tab of tabs) {
    if (tab.id !== undefined) {
      try {
        await sendMessageToTab(tab.id, {
          type: 'SETTINGS_CHANGED',
          settings,
        });
      } catch {
        // Tab might not have content script loaded yet, ignore
      }
    }
  }
}

/**
 * Alarm name for retention cleanup
 */
const RETENTION_ALARM = 'postweaver-retention-cleanup';

/** Periodic cross-device sync (topics + drafter brain) */
const SYNC_ALARM = 'postweaver-sync';
const SYNC_PERIOD_MINUTES = 30;

/** Full pull/push round trip; best-effort, safe to call often */
async function syncEverything(): Promise<void> {
  await Promise.all([pullDrafterSettings(), syncTopics()]);
}

/**
 * Perform retention cleanup - delete data older than configured days
 */
async function performRetentionCleanup(): Promise<void> {
  try {
    const settings = await getCaptureSettings();
    const retentionDays = settings.retentionDays || 365;

    // Calculate cutoff timestamp
    const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    console.log(`[Postweaver] Running retention cleanup (${retentionDays} days, cutoff: ${new Date(cutoffTimestamp).toISOString()})`);

    // Delete old data from all stores
    const [ownTweets, otherTweets, profiles, history] = await Promise.all([
      deleteTweetsBefore(cutoffTimestamp, true),
      deleteTweetsBefore(cutoffTimestamp, false),
      deleteProfilesBefore(cutoffTimestamp),
      deleteProfileHistoryBefore(cutoffTimestamp),
    ]);

    const total = ownTweets + otherTweets + profiles + history;
    console.log(`[Postweaver] Retention cleanup complete: deleted ${total} records (${ownTweets} own tweets, ${otherTweets} other tweets, ${profiles} profiles, ${history} snapshots)`);
  } catch (error) {
    console.error('[Postweaver] Retention cleanup failed:', error);
  }
}

/**
 * Resolve the semi-static context blocks for a draft request.
 * Voice examples and author bio come from the local capture DB; both are
 * best-effort — a draft still works with neither.
 */
async function resolveDraftContext(request: DraftRequest): Promise<ResolvedContext> {
  const settings = await getAiDrafterSettings();

  let voiceExamples: ResolvedContext['voiceExamples'] = [];
  if (request.context.voice && settings.voiceExampleCount > 0) {
    try {
      const tweets = await getVoiceExampleTweets(settings.voiceExampleCount);
      voiceExamples = tweets.map((t) => ({ text: t.text }));
    } catch (error) {
      console.warn('[Postweaver] Voice example lookup failed:', error);
    }
  }

  let authorBio = '';
  let authorRecentPosts: string[] = [];
  if (request.context.authorBio && request.target?.authorHandle) {
    try {
      const profile = await getProfileByHandle(request.target.authorHandle);
      authorBio = profile?.bio ?? '';
      if (profile) {
        const authorTweets = await getTweetsByAuthor(profile.id);
        authorRecentPosts = authorTweets
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 3)
          .map((t) => t.text);
      }
    } catch (error) {
      console.warn('[Postweaver] Author profile lookup failed:', error);
    }
  }

  // Hand-picked posts from the ⊕ button — included whenever present (the
  // user curated them deliberately)
  let gatheredContext: Array<{ authorHandle: string; text: string }> = [];
  try {
    gatheredContext = (await getContextBasket()).map((s) => ({
      authorHandle: s.authorHandle,
      text: s.text,
    }));
  } catch {
    // Basket unavailable; draft without it
  }

  // Topic pools: the ones the panel selected plus every pinned topic
  let topics: TopicContext[] = [];
  try {
    const wanted = new Set(request.topicIds ?? []);
    topics = (await getAllTopics())
      .filter((t) => !t.deletedAt && (t.pinned || wanted.has(t.id)))
      .map((t) => ({
        name: t.name,
        stance: t.stance,
        entries: t.entries.map((e) => ({
          kind: e.kind,
          text: e.text,
          ...(e.authorHandle ? { authorHandle: e.authorHandle } : {}),
        })),
      }));
  } catch (error) {
    console.warn('[Postweaver] Topic lookup failed:', error);
  }

  return {
    persona: request.context.aboutMe ? settings.persona : '',
    voiceExamples,
    authorBio,
    authorRecentPosts,
    gatheredContext,
    topics,
    customInstructions: settings.customInstructions,
    customStrategy: settings.customStrategy,
    voiceProfile: request.context.voice ? settings.voiceProfile : '',
  };
}

/** How many recent posts to analyze when learning the voice profile */
const VOICE_LEARNING_SAMPLE = 40;
/** Minimum posts needed to produce a meaningful profile */
const VOICE_LEARNING_MIN = 5;

/**
 * Learn a reusable voice profile from the user's captured posts and persist
 * it. One LLM call, run on demand — not per draft.
 */
async function learnVoiceProfile(): Promise<{
  success: boolean;
  profile?: string;
  sourceCount?: number;
  error?: string;
}> {
  const settings = await getAiDrafterSettings();
  const access = await resolveLlmAccess(settings);
  if ('error' in access) {
    return { success: false, error: access.error };
  }

  let tweets;
  try {
    tweets = await getRecentOwnTweets(VOICE_LEARNING_SAMPLE);
  } catch (error) {
    return { success: false, error: `Could not read captured posts: ${String(error)}` };
  }

  if (tweets.length < VOICE_LEARNING_MIN) {
    return {
      success: false,
      error: `Only ${tweets.length} of your posts are captured. Browse your own profile/timeline so Postweaver can capture more, then try again.`,
    };
  }

  try {
    const prompt = buildVoiceLearningPrompt(tweets.map((t) => t.text));
    const profile = (
      await completeText({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        maxTokens: 500,
        prompt,
        managed: access.managed,
      })
    ).trim();

    if (!profile) {
      return { success: false, error: 'The model returned an empty profile. Try again.' };
    }

    await updateAiDrafterSettings({
      voiceProfile: profile,
      voiceLearnedAt: Date.now(),
      voiceSourceCount: tweets.length,
    });

    return { success: true, profile, sourceCount: tweets.length };
  } catch (error) {
    return { success: false, error: (error as Error)?.message ?? String(error) };
  }
}

/**
 * Handle a streaming draft request over a long-lived port.
 * The LLM call runs here (host_permissions cover the provider APIs); chunks
 * stream back to the side panel. Disconnecting the port aborts the fetch.
 */
function handleDraftPort(port: chrome.runtime.Port): void {
  const abortController = new AbortController();

  // MV3 service workers idle out ~30s after the last extension API call;
  // a slow model or long generation can cross that line mid-stream. Any
  // extension API call resets the idle timer, so tick one while connected.
  const keepalive = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20_000);

  port.onDisconnect.addListener(() => {
    clearInterval(keepalive);
    abortController.abort();
  });

  port.onMessage.addListener(async (message: DraftPortRequest) => {
    if (message.type !== 'DRAFT') return;

    const post = (msg: DraftPortMessage) => {
      try {
        port.postMessage(msg);
      } catch {
        // Port closed mid-stream; abort handles cleanup
      }
    };

    try {
      const settings = await getAiDrafterSettings();
      const access = await resolveLlmAccess(settings);
      if ('error' in access) {
        post({ type: 'ERROR', error: access.error });
        return;
      }

      const resolved = await resolveDraftContext(message.request);
      const prompt = buildPrompt(message.request, resolved);

      const metrics = await streamDraft(
        {
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          maxTokens: settings.maxTokens,
          prompt,
          managed: access.managed,
        },
        (text) => post({ type: 'CHUNK', text }),
        abortController.signal
      );

      post({
        type: 'DONE',
        ttftMs: metrics.ttftMs,
        totalMs: metrics.totalMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
      });
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('[Postweaver] Draft failed:', error);
        post({ type: 'ERROR', error: (error as Error)?.message ?? String(error) });
      }
    }
  });
}

export default defineBackground(() => {
  console.log('[Postweaver] Background service worker loaded');

  // Firestore sync: pull the drafter brain and topics on startup, push
  // (debounced) when they change locally. Best-effort — everything works
  // offline.
  void syncEverything();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if ('postweaver_ai_drafter' in changes) schedulePush();
    if (TOPICS_STORAGE_KEY in changes) scheduleTopicsPush();
  });
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });

  // Streaming AI draft connections from the side panel
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === DRAFT_PORT_NAME) {
      console.log('[Postweaver] Draft port connected');
      handleDraftPort(port);
    }
  });

  // Configure side panel behavior: clicking extension icon opens side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Set global default: side panel disabled for all tabs (will enable only for X.com)
  chrome.sidePanel.setOptions({
    enabled: false,
  });

  // Handle extension installation and updates
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      // Set default settings on first install
      await resetSettings();
      console.log('[Postweaver] Installed - default settings initialized');
    } else if (details.reason === 'update') {
      const version = chrome.runtime.getManifest().version;
      console.log(`[Postweaver] Updated to version ${version}`);
    }

    // Enable side panel for all existing X.com tabs after install/update
    const tabs = await chrome.tabs.query({ url: X_DOMAINS });
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        await updateSidePanelForTab(tab.id, tab.url);
      }
    }

    // Create alarm for daily retention cleanup
    chrome.alarms.create(RETENTION_ALARM, {
      periodInMinutes: 60 * 24, // Every 24 hours
      delayInMinutes: 60, // Start first cleanup after 1 hour
    });
    console.log('[Postweaver] Retention cleanup alarm created');
  });

  // Update side panel availability when tab navigates (enable for X.com, disable for others)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only act on completed navigation
    if (changeInfo.status === 'complete' && tab.url) {
      await updateSidePanelForTab(tabId, tab.url);
    }
  });

  // Handle keyboard commands
  chrome.commands.onCommand.addListener(async (command) => {
    console.log(`[Postweaver] Command received: ${command}`);

    if (command === 'toggle-sidebar') {
      // chrome.sidePanel.open() must be called within the command's user
      // gesture. Every await before it consumes the gesture, so keep this to
      // a SINGLE await (get the focused window) and open immediately —
      // enabling per-tab options is done afterward, off the gesture path.
      try {
        const win = await chrome.windows.getLastFocused();
        if (win.id !== undefined) {
          await chrome.sidePanel.open({ windowId: win.id });
          console.log('[Postweaver] Side panel opened via keyboard shortcut');
        }
      } catch (error) {
        console.error('[Postweaver] Failed to open side panel:', error);
      }
    } else if (command === 'toggle-enabled') {
      const settings = await getSettings();
      const newEnabled = !settings.enabled;
      await updateSettings({ enabled: newEnabled });
      console.log(`[Postweaver] Extension ${newEnabled ? 'enabled' : 'disabled'}`);
    }
  });

  // Listen for storage changes to broadcast to tabs
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const settingsKey = 'postweaver_settings';
    if (settingsKey in changes) {
      const change = changes[settingsKey];
      if (change?.newValue) {
        broadcastSettingsChange();
      }
    }
  });

  // Handle retention cleanup alarm
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RETENTION_ALARM) {
      await performRetentionCleanup();
    } else if (alarm.name === SYNC_ALARM) {
      await syncEverything();
    }
  });

  // Handle messages from other extension contexts
  onMessage(async (message: ExtensionMessage, sender) => {
    console.log('[Postweaver] Message received:', message.type, 'from:', sender.tab?.url || 'extension');

    switch (message.type) {
      case 'GET_SETTINGS': {
        return await getSettings();
      }

      case 'UPDATE_SETTINGS': {
        await updateSettings(message.settings);
        return { success: true };
      }

      case 'TOGGLE_ENABLED': {
        const settings = await getSettings();
        const newEnabled = !settings.enabled;
        await updateSettings({ enabled: newEnabled });
        return { enabled: newEnabled };
      }

      case 'OPEN_SIDEBAR': {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          try {
            await updateSidePanelForTab(tabId, sender.tab?.url);
            await chrome.sidePanel.open({ tabId });
            console.log('[Postweaver] Side panel opened');
            return { success: true };
          } catch (error) {
            console.error('[Postweaver] Failed to open side panel:', error);
            return { success: false, error: String(error) };
          }
        }
        // Fallback to active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id !== undefined) {
          try {
            await updateSidePanelForTab(tab.id, tab.url);
            await chrome.sidePanel.open({ tabId: tab.id });
            return { success: true };
          } catch (error) {
            console.error('[Postweaver] Failed to open side panel:', error);
            return { success: false, error: String(error) };
          }
        }
        return { success: false, error: 'No valid tab found' };
      }

      case 'STORE_TWEET': {
        try {
          await upsertTweet(message.tweet, message.isOwnTweet);
          return { success: true };
        } catch (error) {
          console.error('[Postweaver] Failed to store tweet:', error);
          return { success: false, error: String(error) };
        }
      }

      case 'STORE_PROFILE': {
        try {
          await upsertProfile(message.profile);
          return { success: true };
        } catch (error) {
          console.error('[Postweaver] Failed to store profile:', error);
          return { success: false, error: String(error) };
        }
      }

      case 'STORE_PROFILE_SNAPSHOT': {
        try {
          await addProfileSnapshot(message.snapshot);
          return { success: true };
        } catch (error) {
          console.error('[Postweaver] Failed to store profile snapshot:', error);
          return { success: false, error: String(error) };
        }
      }

      case 'OPEN_TWEET_TAB': {
        try {
          await chrome.tabs.create({ url: message.url });
          return { success: true };
        } catch (error) {
          console.error('[Postweaver] Failed to open tweet tab:', error);
          return { success: false, error: String(error) };
        }
      }

      case 'LEARN_VOICE': {
        return await learnVoiceProfile();
      }

      case 'LINK_GOOGLE': {
        const result = await linkWithGoogle();
        if (result.ok) {
          // Populate (or refresh) the signed-in account's subtree with local
          // settings — critical on the switched-account path where the uid
          // changed and the new subtree may be empty.
          await pushDrafterSettings();
          await pullDrafterSettings();
          await syncTopics();
          // Resolve the plan now so comped accounts show Cloud Pro at once
          void getBillingStatus();
          return { success: true, email: result.email, linked: result.linked };
        }
        return { success: false, error: result.error };
      }

      case 'GET_SYNC_STATUS': {
        return { email: await getSyncAccountEmail(), redirectUri: getRedirectUri() };
      }

      case 'GET_BILLING': {
        return await getBillingStatus();
      }

      case 'SYNC_NOW': {
        await syncEverything();
        return { ok: true, email: await getSyncAccountEmail(), syncedAt: Date.now() };
      }

      default:
        return { success: false };
    }
  });
});
