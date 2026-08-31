/**
 * Topic context types
 *
 * A topic is a durable, cross-device pool of knowledge the user builds over
 * time: posts they saved from X (a sharp reply, a fact, a thread worth
 * remembering), their own notes, and a short stance. When a draft touches
 * that topic, the pool is handed to the model so the reply sounds informed
 * and consistent with what the user actually thinks.
 *
 * Distinct from the context basket (src/types/ai-drafter.ts), which is a
 * one-shot scratchpad for the next draft only.
 */

export type TopicEntryKind = 'post' | 'note';

export interface TopicEntry {
  /** Stable id (uuid) */
  id: string;
  /** A post saved from X, or a note the user typed */
  kind: TopicEntryKind;
  /** The post text or the note */
  text: string;
  /** @handle of the post's author (without @); posts only */
  authorHandle?: string;
  /** Permalink of the post when it could be read from the page */
  sourceUrl?: string;
  /** Epoch ms when added */
  addedAt: number;
}

export interface Topic {
  /** Stable id (uuid); doubles as the Firestore document id */
  id: string;
  /** Short display name, e.g. "AI regulation" */
  name: string;
  /**
   * Optional framing in the user's words: what this topic is, and where
   * they stand on it. Goes to the model verbatim.
   */
  stance: string;
  /**
   * Extra words that mark a post as being about this topic. The topic name
   * always counts as a keyword; these widen the net (synonyms, handles,
   * product names).
   */
  keywords: string[];
  /** Saved posts and notes, oldest first */
  entries: TopicEntry[];
  /** Include this topic in every draft, whether or not it matches */
  pinned: boolean;
  createdAt: number;
  /** Bumped on every change; drives last-write-wins sync */
  updatedAt: number;
  /** Tombstone so a deletion on one device propagates to the others */
  deletedAt: number | null;
}

/** Max live topics */
export const TOPIC_LIMIT = 40;
/** Max entries kept per topic; the oldest is dropped past this */
export const TOPIC_ENTRY_LIMIT = 40;
/** Max characters stored per entry */
export const TOPIC_ENTRY_MAX_CHARS = 1500;
/** Max characters of stance text */
export const TOPIC_STANCE_MAX_CHARS = 1000;
/** Tombstones older than this are purged locally and remotely */
export const TOPIC_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
