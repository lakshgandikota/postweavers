import { describe, it, expect } from 'vitest';
import type { Topic, TopicEntry } from '../../types/topics';
import { TOPIC_ENTRY_LIMIT } from '../../types/topics';
import {
  appendEntry,
  mergeTopic,
  normalizeTopic,
  parseKeywords,
  suggestTopics,
} from './topic-utils';

function topic(overrides: Partial<Topic> = {}): Topic {
  return normalizeTopic({
    id: overrides.id ?? 't1',
    name: 'AI regulation',
    stance: '',
    keywords: [],
    entries: [],
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  });
}

function entry(id: string, text: string, addedAt: number, kind: TopicEntry['kind'] = 'note'): TopicEntry {
  return { id, kind, text, addedAt };
}

describe('suggestTopics', () => {
  it('matches the topic name as a whole word, case-insensitively', () => {
    const t = topic();
    expect(suggestTopics('Thoughts on ai regulation in the EU?', [t])).toEqual([t]);
    expect(suggestTopics('regulations are fine', [t])).toEqual([]);
  });

  it('matches keywords, including handles and multi-word phrases', () => {
    const t = topic({ keywords: ['EU AI Act', '@sama'] });
    expect(suggestTopics('the eu ai act passed today', [t])).toHaveLength(1);
    expect(suggestTopics('agree with @sama here', [t])).toHaveLength(1);
    expect(suggestTopics('the act passed', [t])).toHaveLength(0);
  });

  it('never suggests pinned or deleted topics', () => {
    const pinned = topic({ id: 'p', pinned: true });
    const deleted = topic({ id: 'd', deletedAt: 5 });
    expect(suggestTopics('ai regulation', [pinned, deleted])).toEqual([]);
  });

  it('ignores one-character keywords', () => {
    const t = topic({ name: 'x' });
    expect(suggestTopics('x marks the spot', [t])).toEqual([]);
  });
});

describe('parseKeywords', () => {
  it('splits on commas and newlines, trims, and dedupes case-insensitively', () => {
    expect(parseKeywords(' llm , LLM\nagents,, ')).toEqual(['llm', 'agents']);
  });
});

describe('appendEntry', () => {
  it('dedupes identical posts and caps at the limit', () => {
    let entries: TopicEntry[] = [];
    const post = { id: 'a', kind: 'post' as const, text: 'hi', authorHandle: 'x', addedAt: 1 };
    entries = appendEntry(entries, post);
    const same = appendEntry(entries, { ...post, id: 'b' });
    expect(same).toBe(entries);

    for (let i = 0; i < TOPIC_ENTRY_LIMIT + 5; i++) {
      entries = appendEntry(entries, entry(`n${i}`, `note ${i}`, i));
    }
    expect(entries).toHaveLength(TOPIC_ENTRY_LIMIT);
    expect(entries[0]!.text).not.toBe('hi'); // oldest dropped
  });

  it('drops blank entries', () => {
    const entries = [entry('a', 'x', 1)];
    expect(appendEntry(entries, entry('b', '   ', 2))).toBe(entries);
  });
});

describe('mergeTopic', () => {
  it('adopts a remote topic that does not exist locally', () => {
    const remote = topic({ updatedAt: 10 });
    const r = mergeTopic(null, remote, 0);
    expect(r.merged).toBe(remote);
    expect(r.changedLocally).toBe(true);
    expect(r.needsPush).toBe(false);
  });

  it('keeps local when it is newer and flags a push', () => {
    const local = topic({ updatedAt: 20 });
    const remote = topic({ updatedAt: 10 });
    const r = mergeTopic(local, remote, 10);
    expect(r.merged).toBe(local);
    expect(r.changedLocally).toBe(false);
    expect(r.needsPush).toBe(true);
  });

  it('takes remote when newer and rescues entries added since the last push', () => {
    const local = topic({
      updatedAt: 15,
      entries: [entry('old', 'pushed before', 5), entry('new', 'saved offline', 12)],
    });
    const remote = topic({ updatedAt: 20, entries: [entry('old', 'pushed before', 5), entry('r', 'from phone', 18)] });
    const r = mergeTopic(local, remote, 10);
    expect(r.changedLocally).toBe(true);
    expect(r.needsPush).toBe(true);
    expect(r.merged.entries.map((e) => e.id)).toEqual(['old', 'r', 'new']);
    expect(r.merged.updatedAt).toBeGreaterThan(20);
  });

  it('honors a remote deletion without resurrecting local entries', () => {
    const local = topic({ updatedAt: 15, entries: [entry('new', 'x', 12)] });
    const remote = topic({ updatedAt: 20, deletedAt: 20, entries: [] });
    const r = mergeTopic(local, remote, 10);
    expect(r.merged.deletedAt).toBe(20);
    expect(r.needsPush).toBe(false);
  });
});
