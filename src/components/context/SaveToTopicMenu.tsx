import { useEffect, useRef, useState } from 'react';
import type { Topic, TopicEntryKind } from '../../types/topics';
import { addTopicEntry, createTopic } from '../../lib/topics';

export interface SaveableEntry {
  kind: TopicEntryKind;
  text: string;
  authorHandle?: string;
  sourceUrl?: string;
}

/**
 * "Save to topic" dropdown: pick an existing topic or type a new one.
 * Self-contained: it writes to storage and reports back the topic name so
 * the caller can flash a confirmation.
 */
export function SaveToTopicMenu({
  entry,
  topics,
  label = 'Save to topic',
  compact = false,
  onSaved,
}: {
  entry: SaveableEntry;
  topics: Topic[];
  label?: string;
  compact?: boolean;
  onSaved?: (topic: Topic, added: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = async (topicId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await addTopicEntry(topicId, entry);
      if (result) {
        onSaved?.(result.topic, result.added);
        setOpen(false);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveToNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const topic = await createTopic(name);
      const result = await addTopicEntry(topic.id, entry);
      if (result) onSaved?.(result.topic, result.added);
      setNewName('');
      setOpen(false);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Remember this under a topic so future drafts on that subject can use it"
        className={
          compact
            ? 'text-[10px] text-x-accent hover:text-x-accent/80 font-medium whitespace-nowrap'
            : 'px-2 py-1 text-xs rounded-lg border border-x-border-light dark:border-x-border-dark text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark hover:border-x-accent transition-colors whitespace-nowrap'
        }
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 shadow-lg p-1.5">
          {topics.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {topics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => save(t.id)}
                  className="w-full text-left px-2 py-1 text-xs rounded text-x-text-light dark:text-x-text-dark hover:bg-x-accent/10 disabled:opacity-50 truncate"
                >
                  {t.name}
                  <span className="text-x-secondary-light dark:text-x-secondary-dark"> · {t.entries.length}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
              No topics yet. Name one below.
            </p>
          )}
          <div className="mt-1 flex gap-1 border-t border-x-border-light dark:border-x-border-dark pt-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveToNew();
                }
              }}
              placeholder="New topic…"
              className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-1 focus:ring-x-accent"
            />
            <button
              type="button"
              disabled={busy || !newName.trim()}
              onClick={saveToNew}
              className="px-2 py-1 text-xs font-medium rounded bg-x-accent text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {error && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
