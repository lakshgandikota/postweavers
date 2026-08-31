/**
 * Topic storage in chrome.storage.local. Every context (side panel,
 * content script, background) reads and writes the same key; the
 * background worker mirrors it to Firestore (see firebase/topics-sync.ts).
 */

import type { Topic, TopicEntry, TopicEntryKind } from '../../types/topics';
import { TOPIC_LIMIT, TOPIC_STANCE_MAX_CHARS } from '../../types/topics';
import { appendEntry, liveTopics, newId, normalizeTopic } from './topic-utils';

export const TOPICS_STORAGE_KEY = 'postweaver_topics';

/** All topics including tombstones, as stored */
export async function getAllTopics(): Promise<Topic[]> {
  const result = await chrome.storage.local.get(TOPICS_STORAGE_KEY);
  const raw = result[TOPICS_STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Partial<Topic> & { id: string } => !!t && typeof t.id === 'string')
    .map(normalizeTopic);
}

/** Live topics, most recently updated first */
export async function getTopics(): Promise<Topic[]> {
  return liveTopics(await getAllTopics());
}

export async function getTopic(id: string): Promise<Topic | null> {
  return (await getAllTopics()).find((t) => t.id === id && !t.deletedAt) ?? null;
}

/** Replace the whole list (used by sync). Callers pass normalized topics. */
export async function setAllTopics(topics: Topic[]): Promise<void> {
  await chrome.storage.local.set({ [TOPICS_STORAGE_KEY]: topics });
}

export async function createTopic(
  name: string,
  extras: Partial<Pick<Topic, 'stance' | 'keywords' | 'pinned'>> = {}
): Promise<Topic> {
  const all = await getAllTopics();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Topic needs a name');
  const existing = all.find((t) => !t.deletedAt && t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  if (liveTopics(all).length >= TOPIC_LIMIT) {
    throw new Error(`You can keep up to ${TOPIC_LIMIT} topics. Delete one to add another.`);
  }
  const now = Date.now();
  const topic: Topic = {
    id: newId(),
    name: trimmed,
    stance: (extras.stance ?? '').slice(0, TOPIC_STANCE_MAX_CHARS),
    keywords: extras.keywords ?? [],
    entries: [],
    pinned: !!extras.pinned,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await setAllTopics([...all, topic]);
  return topic;
}

export async function updateTopic(
  id: string,
  patch: Partial<Pick<Topic, 'name' | 'stance' | 'keywords' | 'pinned'>>
): Promise<Topic | null> {
  const all = await getAllTopics();
  const index = all.findIndex((t) => t.id === id && !t.deletedAt);
  if (index < 0) return null;
  const current = all[index]!;
  const next: Topic = {
    ...current,
    ...patch,
    name: (patch.name ?? current.name).trim() || current.name,
    stance: (patch.stance ?? current.stance).slice(0, TOPIC_STANCE_MAX_CHARS),
    updatedAt: Date.now(),
  };
  all[index] = next;
  await setAllTopics(all);
  return next;
}

/** Tombstone the topic so the deletion syncs; entries are dropped to save space */
export async function deleteTopic(id: string): Promise<void> {
  const all = await getAllTopics();
  const index = all.findIndex((t) => t.id === id);
  if (index < 0) return;
  const now = Date.now();
  all[index] = { ...all[index]!, entries: [], deletedAt: now, updatedAt: now };
  await setAllTopics(all);
}

export async function addTopicEntry(
  topicId: string,
  entry: { kind: TopicEntryKind; text: string; authorHandle?: string; sourceUrl?: string }
): Promise<{ topic: Topic; added: boolean } | null> {
  const all = await getAllTopics();
  const index = all.findIndex((t) => t.id === topicId && !t.deletedAt);
  if (index < 0) return null;
  const current = all[index]!;
  const full: TopicEntry = {
    id: newId(),
    kind: entry.kind,
    text: entry.text,
    addedAt: Date.now(),
    ...(entry.authorHandle ? { authorHandle: entry.authorHandle } : {}),
    ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
  };
  const entries = appendEntry(current.entries, full);
  if (entries === current.entries) return { topic: current, added: false };
  const next: Topic = { ...current, entries, updatedAt: Date.now() };
  all[index] = next;
  await setAllTopics(all);
  return { topic: next, added: true };
}

export async function removeTopicEntry(topicId: string, entryId: string): Promise<Topic | null> {
  const all = await getAllTopics();
  const index = all.findIndex((t) => t.id === topicId && !t.deletedAt);
  if (index < 0) return null;
  const current = all[index]!;
  const entries = current.entries.filter((e) => e.id !== entryId);
  if (entries.length === current.entries.length) return current;
  const next: Topic = { ...current, entries, updatedAt: Date.now() };
  all[index] = next;
  await setAllTopics(all);
  return next;
}

/** Subscribe to live-topic changes from any extension context */
export function subscribeToTopics(callback: (topics: Topic[]) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(TOPICS_STORAGE_KEY in changes)) return;
    const raw = changes[TOPICS_STORAGE_KEY]?.newValue;
    const topics = Array.isArray(raw)
      ? raw
          .filter((t): t is Partial<Topic> & { id: string } => !!t && typeof t.id === 'string')
          .map(normalizeTopic)
      : [];
    callback(liveTopics(topics));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
