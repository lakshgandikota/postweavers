/**
 * Pure helpers for topics: id generation, normalization, auto-suggestion,
 * and the sync merge rule. No chrome.* access here so they unit-test cleanly.
 */

import type { Topic, TopicEntry } from '../../types/topics';
import {
  TOPIC_ENTRY_LIMIT,
  TOPIC_ENTRY_MAX_CHARS,
  TOPIC_STANCE_MAX_CHARS,
} from '../../types/topics';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Live (non-deleted) topics, newest activity first */
export function liveTopics(topics: Topic[]): Topic[] {
  return topics
    .filter((t) => !t.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Fill defaults for a topic read from storage or the network */
export function normalizeTopic(raw: Partial<Topic> & { id: string }): Topic {
  const now = Date.now();
  return {
    id: raw.id,
    name: (raw.name ?? '').trim() || 'Untitled topic',
    stance: (raw.stance ?? '').slice(0, TOPIC_STANCE_MAX_CHARS),
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map((k) => String(k).trim()).filter(Boolean)
      : [],
    entries: Array.isArray(raw.entries)
      ? raw.entries
          .filter((e): e is TopicEntry => !!e && typeof e.text === 'string' && !!e.id)
          .map((e) => ({ ...e, text: e.text.slice(0, TOPIC_ENTRY_MAX_CHARS) }))
      : [],
    pinned: !!raw.pinned,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    deletedAt: raw.deletedAt ?? null,
  };
}

/** Parse a comma/newline separated keyword string into a clean list */
export function parseKeywords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const k = part.trim();
    const key = k.toLowerCase();
    if (!k || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/**
 * Append an entry, deduping posts by author + text and capping the list
 * (oldest dropped first). Returns the same array reference when nothing
 * changed so callers can skip a write.
 */
export function appendEntry(entries: TopicEntry[], entry: TopicEntry): TopicEntry[] {
  const text = entry.text.trim().slice(0, TOPIC_ENTRY_MAX_CHARS);
  if (!text) return entries;
  const duplicate = entries.some(
    (e) => e.kind === entry.kind && e.text === text && (e.authorHandle ?? '') === (entry.authorHandle ?? '')
  );
  if (duplicate) return entries;
  const next = [...entries, { ...entry, text }];
  while (next.length > TOPIC_ENTRY_LIMIT) next.shift();
  return next;
}

/**
 * Which topics does this text plausibly touch? Matches the topic name and
 * each keyword as a whole word, case-insensitively. Multi-word keywords
 * match as phrases. Pinned topics are not "suggested" (they're always on).
 */
export function suggestTopics(text: string, topics: Topic[]): Topic[] {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  if (!haystack.trim()) return [];
  return liveTopics(topics).filter((topic) => {
    if (topic.pinned) return false;
    const needles = [topic.name, ...topic.keywords];
    return needles.some((needle) => matchesWord(haystack, needle));
  });
}

function matchesWord(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (n.length < 2) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  // Word boundaries that also treat @, #, and punctuation as separators
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(haystack);
}

/** Whether a post/entry already lives in this topic */
export function topicHasPost(topic: Topic, authorHandle: string, text: string): boolean {
  const t = text.trim();
  return topic.entries.some(
    (e) => e.kind === 'post' && e.text === t && (e.authorHandle ?? '') === authorHandle
  );
}

/**
 * Sync merge for one topic. Last-write-wins on updatedAt, with one
 * protection: entries added locally after our last successful push are
 * carried over even when the remote copy wins, so a save made on this
 * device right before a pull is never lost.
 *
 * `lastPushedAt` is the updatedAt we most recently pushed for this topic
 * (0 when never pushed). Returns the merged topic and whether it differs
 * from `local` (meaning storage needs a write) and from `remote` (meaning
 * a push is needed).
 */
export function mergeTopic(
  local: Topic | null,
  remote: Topic,
  lastPushedAt: number
): { merged: Topic; changedLocally: boolean; needsPush: boolean } {
  if (!local) {
    return { merged: remote, changedLocally: true, needsPush: false };
  }
  if (remote.updatedAt <= local.updatedAt) {
    // Local is current or ahead; a push (if pending) is decided by the caller
    return { merged: local, changedLocally: false, needsPush: local.updatedAt > remote.updatedAt };
  }

  // Remote wins. Rescue local entries added since the last push.
  if (remote.deletedAt) {
    return { merged: remote, changedLocally: true, needsPush: false };
  }
  const remoteIds = new Set(remote.entries.map((e) => e.id));
  const rescued = local.entries.filter((e) => e.addedAt > lastPushedAt && !remoteIds.has(e.id));
  if (rescued.length === 0 || local.deletedAt) {
    return { merged: remote, changedLocally: true, needsPush: false };
  }
  let entries = remote.entries;
  for (const e of rescued) entries = appendEntry(entries, e);
  const merged: Topic = { ...remote, entries, updatedAt: Date.now() };
  return { merged, changedLocally: true, needsPush: true };
}
