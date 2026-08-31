import { useEffect, useState } from 'react';
import type { Topic, TopicEntry } from '../../types/topics';
import type { AiDrafterSettings } from '../../types/ai-drafter';
import {
  createTopic,
  updateTopic,
  deleteTopic,
  addTopicEntry,
  removeTopicEntry,
  parseKeywords,
} from '../../lib/topics';
import { useTopics } from '../../hooks/useTopics';

const labelClass =
  'block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-1';
const inputClass =
  'w-full px-2 py-1.5 text-sm rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-1 focus:ring-x-accent';
const hintClass = 'mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark';

function timeAgo(epochMs: number): string {
  if (!epochMs) return '';
  const secs = Math.floor((Date.now() - epochMs) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Text field that edits locally and commits on blur, so typing doesn't
 * write storage (and trigger a sync push) on every keystroke.
 */
function CommitField({
  value,
  onCommit,
  rows,
  placeholder,
  maxLength,
}: {
  value: string;
  onCommit: (next: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local !== value) onCommit(local);
  };
  if (rows) {
    return (
      <textarea
        value={local}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        className={inputClass}
      />
    );
  }
  return (
    <input
      type="text"
      value={local}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={inputClass}
    />
  );
}

/** Sync line shown at the top of the Context tab */
function SyncLine({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
      setEmail(res?.email ?? null);
      if (res?.ok) setSyncedAt(res.syncedAt ?? Date.now());
    } catch {
      // Offline; nothing to show
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void sync();
  }, []);

  return (
    <div className="flex items-center justify-between gap-2 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
      {email ? (
        <span className="truncate">
          <span className="text-green-600 dark:text-green-500">●</span> Synced as {email}
          {syncedAt > 0 && ` · ${timeAgo(syncedAt)}`}
        </span>
      ) : (
        <button type="button" onClick={onOpenSettings} className="text-left hover:text-x-accent">
          Saved on this device. <span className="text-x-accent font-medium">Sign in to sync across devices →</span>
        </button>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={syncing}
        className="shrink-0 text-x-accent hover:text-x-accent/80 font-medium disabled:opacity-50"
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
  );
}

function EntryRow({ entry, onRemove }: { entry: TopicEntry; onRemove: () => void }) {
  const isPost = entry.kind === 'post';
  return (
    <div className="flex items-start gap-1.5 group">
      <span className="shrink-0 text-[10px] mt-0.5 text-x-secondary-light dark:text-x-secondary-dark" title={isPost ? 'Saved post' : 'Your note'}>
        {isPost ? '⊕' : '✎'}
      </span>
      <p className="flex-1 min-w-0 text-[11px] text-x-secondary-light dark:text-x-secondary-dark leading-snug break-words">
        {isPost && entry.authorHandle && (
          <span className="font-medium text-x-text-light dark:text-x-text-dark">
            {entry.sourceUrl ? (
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener" className="hover:text-x-accent">
                @{entry.authorHandle}
              </a>
            ) : (
              <>@{entry.authorHandle}</>
            )}
            :{' '}
          </span>
        )}
        {entry.text}
      </p>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        className="shrink-0 text-xs text-x-secondary-light dark:text-x-secondary-dark hover:text-red-500"
      >
        ×
      </button>
    </div>
  );
}

function TopicCard({ topic, defaultOpen }: { topic: Topic; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const posts = topic.entries.filter((e) => e.kind === 'post').length;
  const notes = topic.entries.length - posts;
  const summary = [
    posts > 0 ? `${posts} post${posts === 1 ? '' : 's'}` : null,
    notes > 0 ? `${notes} note${notes === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const visibleEntries = showAll ? topic.entries.slice().reverse() : topic.entries.slice(-6).reverse();

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    await addTopicEntry(topic.id, { kind: 'note', text });
    setNote('');
  };

  return (
    <div className="rounded-lg border border-x-border-light dark:border-x-border-dark">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-x-text-light dark:text-x-text-dark truncate">
            {topic.name}
            {topic.pinned && (
              <span className="ml-1.5 text-[10px] font-normal text-x-accent" title="Included in every draft">
                always on
              </span>
            )}
          </p>
          <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
            {summary || 'empty'} · updated {timeAgo(topic.updatedAt)}
          </p>
        </div>
        <svg
          className={`w-4 h-4 shrink-0 text-x-secondary-light dark:text-x-secondary-dark transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2.5">
          <div>
            <label className={labelClass}>Name</label>
            <CommitField value={topic.name} maxLength={60} onCommit={(name) => void updateTopic(topic.id, { name })} />
          </div>
          <div>
            <label className={labelClass}>Where you stand</label>
            <CommitField
              value={topic.stance}
              rows={2}
              maxLength={1000}
              placeholder="One or two lines in your words: what this is and what you think about it."
              onCommit={(stance) => void updateTopic(topic.id, { stance })}
            />
          </div>
          <div>
            <label className={labelClass}>Also matches</label>
            <CommitField
              value={topic.keywords.join(', ')}
              placeholder="synonyms, product names, @handles (comma separated)"
              onCommit={(raw) => void updateTopic(topic.id, { keywords: parseKeywords(raw) })}
            />
            <p className={hintClass}>
              A post mentioning the topic name or any of these auto-selects this topic when you draft.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-x-text-light dark:text-x-text-dark">
            <input
              type="checkbox"
              checked={topic.pinned}
              onChange={(e) => void updateTopic(topic.id, { pinned: e.target.checked })}
              className="accent-x-accent"
            />
            Include in every draft, whatever the post is about
          </label>

          <div>
            <label className={labelClass}>Saved material</label>
            {topic.entries.length === 0 ? (
              <p className="text-[11px] text-x-secondary-light dark:text-x-secondary-dark">
                Nothing yet. On X, click ⊕ under a post and choose this topic, or add a note below.
              </p>
            ) : (
              <div className="space-y-1.5">
                {visibleEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onRemove={() => void removeTopicEntry(topic.id, entry.id)} />
                ))}
                {topic.entries.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => !s)}
                    className="text-[10px] text-x-accent hover:text-x-accent/80 font-medium"
                  >
                    {showAll ? 'Show fewer' : `Show all ${topic.entries.length}`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void addNote();
                }
              }}
              rows={2}
              placeholder="Add a note: a fact, a line you liked, an argument to reuse…"
              className={inputClass}
            />
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={addNote}
                disabled={!note.trim()}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 disabled:opacity-40 transition-colors"
              >
                Add note
              </button>
              {confirmDelete ? (
                <span className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
                  Delete this topic everywhere?{' '}
                  <button type="button" onClick={() => void deleteTopic(topic.id)} className="text-red-500 font-medium">
                    Yes
                  </button>{' '}
                  ·{' '}
                  <button type="button" onClick={() => setConfirmDelete(false)} className="font-medium">
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark hover:text-red-500"
                >
                  Delete topic
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Context tab: the two kinds of memory that make drafts better over time.
 * "About me" is universal and goes into every draft; topics are per-subject
 * pools of saved posts and notes, pulled in when a draft touches them.
 * Both sync across devices through the user's account.
 */
export function ContextPanel({
  settings,
  onUpdateSettings,
  onOpenSettings,
}: {
  settings: AiDrafterSettings;
  onUpdateSettings: (updates: Partial<AiDrafterSettings>) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const { topics, loading } = useTopics();
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    try {
      const topic = await createTopic(name);
      setJustCreated(topic.id);
      setNewName('');
    } catch (e) {
      setCreateError((e as Error)?.message ?? String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-x-text-light dark:text-x-text-dark">Context</h3>
        <SyncLine onOpenSettings={onOpenSettings} />
      </div>

      {/* Universal: about me */}
      <div>
        <label className={labelClass}>About me</label>
        <CommitField
          value={settings.persona}
          rows={5}
          maxLength={2000}
          placeholder={
            'Who you are on X, in your own words. What you build, what you know, what you care about, what you refuse to say. ' +
            'Example: "Founder of a dev-tools startup, ex-infra at a big cloud. Strong opinions on shipping speed and on AI hype. Never shill, never do hashtags."'
          }
          onCommit={(persona) => void onUpdateSettings({ persona })}
        />
        <p className={hintClass}>
          Goes into every draft when the "About me" chip is on. Save with a click outside the box.
        </p>
      </div>

      {/* Per-subject: topics */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelClass + ' mb-0'}>Topics</label>
          {topics.length > 0 && (
            <span className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
              {topics.length} topic{topics.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-x-secondary-light dark:text-x-secondary-dark mb-2 leading-snug">
          A memory per subject. When you see a reply worth remembering, click ⊕ under it on X and pick a topic.
          Drafts about that subject pull the whole pool in.
        </p>

        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            maxLength={60}
            placeholder="New topic, e.g. AI regulation"
            className={inputClass}
          />
          <button
            type="button"
            onClick={create}
            disabled={!newName.trim()}
            className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
        {createError && <p className="mb-2 text-[10px] text-red-600 dark:text-red-400">{createError}</p>}

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-x-border-light dark:border-x-border-dark p-3 text-center">
            <p className="text-xs text-x-text-light dark:text-x-text-dark font-medium">No topics yet</p>
            <p className="mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark leading-snug">
              Start with two or three subjects you reply about most. Then, on X, click ⊕ under a good post and
              save it to one of them.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} defaultOpen={topic.id === justCreated} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
