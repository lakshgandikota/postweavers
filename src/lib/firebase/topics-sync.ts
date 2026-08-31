/**
 * Firestore sync for topics (users/{uid}/topics/{topicId})
 *
 * One document per topic so devices editing different topics never
 * collide. Each doc carries the topic as a JSON string plus its updatedAt;
 * merge is last-write-wins per topic with a rescue for entries saved
 * locally since the last push (see mergeTopic). Deletions travel as
 * tombstones and are purged after TOPIC_TOMBSTONE_TTL_MS.
 *
 * Best-effort like the settings sync: everything works offline, and a
 * failed push simply retries on the next change or pull.
 */

import type { Topic } from '../../types/topics';
import { TOPIC_TOMBSTONE_TTL_MS } from '../../types/topics';
import { getAllTopics, setAllTopics } from '../topics/storage';
import { mergeTopic, normalizeTopic } from '../topics/topic-utils';
import { getAuth } from './auth';
import { FIRESTORE_URL } from './config';

const SYNC_META_KEY = 'postweaver_topics_sync';

interface TopicsSyncMeta {
  /** topicId -> updatedAt we last pushed successfully */
  pushed: Record<string, number>;
  /** Epoch ms of the last successful pull (0 = never) */
  lastPullAt: number;
  /** Epoch ms of the last successful push (0 = never) */
  lastPushAt: number;
}

async function readMeta(): Promise<TopicsSyncMeta> {
  const result = await chrome.storage.local.get(SYNC_META_KEY);
  const raw = result[SYNC_META_KEY] as Partial<TopicsSyncMeta> | undefined;
  return {
    pushed: raw?.pushed ?? {},
    lastPullAt: raw?.lastPullAt ?? 0,
    lastPushAt: raw?.lastPushAt ?? 0,
  };
}

async function writeMeta(meta: TopicsSyncMeta): Promise<void> {
  await chrome.storage.local.set({ [SYNC_META_KEY]: meta });
}

export async function getTopicsSyncStatus(): Promise<{ lastPullAt: number; lastPushAt: number; pending: number }> {
  const [meta, topics] = await Promise.all([readMeta(), getAllTopics()]);
  const pending = topics.filter((t) => meta.pushed[t.id] !== t.updatedAt).length;
  return { lastPullAt: meta.lastPullAt, lastPushAt: meta.lastPushAt, pending };
}

function collectionUrl(uid: string): string {
  return `${FIRESTORE_URL}/users/${uid}/topics`;
}

function docUrl(uid: string, topicId: string): string {
  return `${collectionUrl(uid)}/${encodeURIComponent(topicId)}`;
}

function toFields(topic: Topic): Record<string, unknown> {
  return {
    data: { stringValue: JSON.stringify(topic) },
    updatedAt: { integerValue: String(topic.updatedAt) },
    deleted: { booleanValue: !!topic.deletedAt },
    source: { stringValue: 'extension' },
  };
}

function fromDoc(doc: { name?: string; fields?: Record<string, { stringValue?: string; integerValue?: string }> }): Topic | null {
  const json = doc.fields?.data?.stringValue;
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<Topic> & { id?: string };
    const idFromName = doc.name?.split('/').pop();
    const id = parsed.id ?? idFromName;
    if (!id) return null;
    const topic = normalizeTopic({ ...parsed, id });
    const updatedAt = Number(doc.fields?.updatedAt?.integerValue ?? topic.updatedAt);
    return { ...topic, updatedAt: Math.max(updatedAt, topic.updatedAt) };
  } catch {
    return null;
  }
}

/**
 * Push every topic whose updatedAt differs from what we last pushed.
 * Expired tombstones are deleted remotely and dropped locally.
 */
export async function pushTopics(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;

  const [meta, topics] = await Promise.all([readMeta(), getAllTopics()]);
  const headers = {
    authorization: `Bearer ${auth.idToken}`,
    'content-type': 'application/json',
  };
  const now = Date.now();
  let ok = true;
  let localChanged = false;
  const keep: Topic[] = [];

  for (const topic of topics) {
    const expiredTombstone = !!topic.deletedAt && now - topic.deletedAt > TOPIC_TOMBSTONE_TTL_MS;
    if (expiredTombstone) {
      try {
        const response = await fetch(docUrl(auth.uid, topic.id), { method: 'DELETE', headers });
        if (response.ok || response.status === 404) {
          delete meta.pushed[topic.id];
          localChanged = true;
          continue; // dropped
        }
      } catch {
        // Leave it for next time
      }
      keep.push(topic);
      continue;
    }

    keep.push(topic);
    if (meta.pushed[topic.id] === topic.updatedAt) continue;
    try {
      const response = await fetch(docUrl(auth.uid, topic.id), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: toFields(topic) }),
      });
      if (!response.ok) {
        console.warn('[Postweaver] Topic push failed:', topic.name, response.status);
        ok = false;
        continue;
      }
      meta.pushed[topic.id] = topic.updatedAt;
      meta.lastPushAt = Date.now();
    } catch (error) {
      console.warn('[Postweaver] Topic push unreachable:', error);
      ok = false;
    }
  }

  if (localChanged) await setAllTopics(keep);
  await writeMeta(meta);
  return ok;
}

/**
 * Pull the remote collection and merge it into local storage. Topics that
 * merged with rescued local entries are pushed right back.
 */
export async function pullTopics(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;

  const remote: Topic[] = [];
  try {
    let pageToken: string | undefined;
    do {
      const url = new URL(collectionUrl(auth.uid));
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url.toString(), {
        headers: { authorization: `Bearer ${auth.idToken}` },
      });
      if (!response.ok) {
        console.warn('[Postweaver] Topics pull failed:', response.status);
        return false;
      }
      const body = await response.json();
      for (const doc of body.documents ?? []) {
        const topic = fromDoc(doc);
        if (topic) remote.push(topic);
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
  } catch (error) {
    console.warn('[Postweaver] Topics pull unreachable:', error);
    return false;
  }

  const [meta, local] = await Promise.all([readMeta(), getAllTopics()]);
  const byId = new Map(local.map((t) => [t.id, t]));
  let changed = false;
  let needsPush = false;

  for (const r of remote) {
    const l = byId.get(r.id) ?? null;
    const result = mergeTopic(l, r, meta.pushed[r.id] ?? 0);
    if (result.changedLocally) {
      byId.set(r.id, result.merged);
      changed = true;
    }
    if (result.needsPush) {
      needsPush = true;
    } else if (result.changedLocally) {
      // We now hold exactly the remote copy; no echo push needed
      meta.pushed[r.id] = result.merged.updatedAt;
    }
  }

  // Topics we have that the remote doesn't will be pushed by pushTopics
  const remoteIds = new Set(remote.map((t) => t.id));
  if (local.some((t) => !remoteIds.has(t.id) && meta.pushed[t.id] !== t.updatedAt)) {
    needsPush = true;
  }

  if (changed) await setAllTopics(Array.from(byId.values()));
  meta.lastPullAt = Date.now();
  await writeMeta(meta);
  console.log(`[Postweaver] Topics pulled from Firestore (${remote.length} remote, ${changed ? 'merged' : 'no change'})`);

  if (needsPush) await pushTopics();
  return true;
}

/** Pull then push: the full round trip, used on startup and when the panel opens */
export async function syncTopics(): Promise<boolean> {
  const pulled = await pullTopics();
  const pushed = await pushTopics();
  return pulled && pushed;
}

/** Debounced push scheduler for storage-change subscriptions */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleTopicsPush(delayMs = 2000): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushTopics();
  }, delayMs);
}
