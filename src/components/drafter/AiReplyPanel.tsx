import { useState, useRef, useEffect } from 'react';
import { useDrafter } from '../../hooks/useDrafter';
import { analyzeCharacterCount } from '../../lib/composer';
import {
  getContextBasket,
  removeFromContextBasket,
  clearContextBasket,
  subscribeToContextBasket,
} from '../../lib/storage';
import type { ContextSnippet } from '../../types/ai-drafter';
import { CharacterCount } from '../composer/CharacterCount';
import type { ContextToggles, ReplyStrategy } from '../../types/ai-drafter';
import { STRATEGY_DESCRIPTIONS, STRATEGY_LABELS } from '../../types/ai-drafter';

const STRATEGIES = Object.keys(STRATEGY_LABELS) as ReplyStrategy[];

const CONTEXT_BLOCKS: Array<{ key: keyof ContextToggles; label: string }> = [
  { key: 'aboutMe', label: 'About me' },
  { key: 'voice', label: 'My voice' },
  { key: 'post', label: 'This post' },
  { key: 'thread', label: 'Thread' },
  { key: 'authorBio', label: 'About author' },
];

/** One-tap refinements applied to the current draft */
const REFINEMENTS: Array<{ label: string; instruction: string }> = [
  { label: 'Shorter', instruction: 'Make it shorter: cut it down hard, one punchy sentence' },
  { label: 'Punchier', instruction: 'Make it punchier and more direct, with more energy' },
  { label: 'More specific', instruction: 'Make it more specific: replace any generality with a concrete detail or example' },
  { label: 'Softer', instruction: 'Soften the tone: keep the point but make it friendlier' },
];

/** Human-readable age of a post + whether it's still in the high-reach window */
function postAge(iso: string | null | undefined): { label: string; fresh: boolean } | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { label: `${Math.max(1, mins)}m ago`, fresh: true };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `${hours}h ago`, fresh: hours < 6 };
  return { label: `${Math.floor(hours / 24)}d ago`, fresh: false };
}

/** Compact token count, e.g. 1400 -> "1.4k" */
function fmtTokens(n: number | null): string | null {
  if (n === null) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * AI reply drafting panel.
 *
 * Human-in-the-loop by design: the extension drafts, the user reviews/edits
 * and inserts into X's reply box, and posting is always the user's click on
 * X's own Post button. Nothing is ever submitted automatically.
 */
export function AiReplyPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    settings,
    settingsLoading,
    target,
    refreshTarget,
    intent,
    setIntent,
    strategy,
    setStrategy,
    context,
    toggleContext,
    draft,
    setDraft,
    status,
    error,
    metrics,
    variants,
    variantsActive,
    pickVariant,
    generateDraft,
    generateVariants,
    refineDraft,
    cancelDraft,
    insertDraft,
  } = useDrafter();

  const [insertResult, setInsertResult] = useState<'ok' | 'fail' | null>(null);
  const insertingRef = useRef(false);
  const [basket, setBasket] = useState<ContextSnippet[]>([]);

  useEffect(() => {
    getContextBasket().then(setBasket);
    return subscribeToContextBasket(setBasket);
  }, []);

  const charCount = analyzeCharacterCount(draft);
  const hasLlmAccess = settings.keyMode === 'managed' || !!settings.apiKey;
  const needsSetup = !settingsLoading && !hasLlmAccess;
  const canDraft = status !== 'streaming' && hasLlmAccess;

  const handleInsert = async () => {
    // Re-entry guard: a double-click would legitimately append twice
    if (insertingRef.current) return;
    insertingRef.current = true;
    try {
      const success = await insertDraft();
      setInsertResult(success ? 'ok' : 'fail');
      setTimeout(() => setInsertResult(null), 2500);
    } finally {
      insertingRef.current = false;
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h3 className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
        AI Reply
      </h3>

      {needsSetup ? (
        <button
          onClick={onOpenSettings}
          className="w-full text-left rounded-lg border border-x-accent/50 bg-x-accent/5 p-3 hover:bg-x-accent/10 transition-colors"
        >
          <p className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
            Set up drafting to get started
          </p>
          <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark mt-1">
            Choose PostWeaver Cloud or add your own API key.{' '}
            <span className="text-x-accent font-medium">Open Settings →</span>
          </p>
        </button>
      ) : (
        <>
          {/* Voice-learn nudge: sounding like the user starts here */}
          {!settings.voiceProfile && (
            <button
              onClick={onOpenSettings}
              className="w-full text-left rounded-lg border border-x-accent/50 bg-x-accent/5 p-2 hover:bg-x-accent/10 transition-colors"
            >
              <p className="text-xs text-x-text-light dark:text-x-text-dark">
                <span className="font-medium">Drafts not sounding like you?</span>{' '}
                <span className="text-x-accent font-medium">Learn my voice →</span>
              </p>
              <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark mt-0.5">
                One-time analysis of your posts, stored and reused on every draft.
              </p>
            </button>
          )}

          {/* Reply target */}
          <div className="rounded-lg border border-x-border-light dark:border-x-border-dark p-2">
            <div className="flex items-start justify-between gap-2">
              {target ? (
                <div className="min-w-0">
                  <p className="text-xs text-x-text-light dark:text-x-text-dark">
                    <span className="font-medium">Replying to @{target.authorHandle}:</span>{' '}
                    <span className="text-x-secondary-light dark:text-x-secondary-dark break-words">
                      {target.text.length > 140 ? target.text.slice(0, 140) + '…' : target.text}
                    </span>
                  </p>
                  {(() => {
                    const age = postAge(target.postedAt);
                    if (!age) return null;
                    return (
                      <p
                        className={`text-[10px] mt-0.5 ${
                          age.fresh
                            ? 'text-green-600 dark:text-green-500'
                            : 'text-x-secondary-light dark:text-x-secondary-dark'
                        }`}
                      >
                        {age.fresh
                          ? `🔥 posted ${age.label}. Early replies get the most reach`
                          : `posted ${age.label}`}
                      </p>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                  No reply detected. Click into a reply box on X, or refresh.
                </p>
              )}
              <button
                onClick={refreshTarget}
                title="Re-read the reply context from the page"
                className="shrink-0 text-xs text-x-accent hover:text-x-accent/80 font-medium"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Gathered context basket */}
          {basket.length > 0 && (
            <div className="rounded-lg border border-x-accent/40 bg-x-accent/5 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-x-text-light dark:text-x-text-dark">
                  Gathered context ({basket.length}), included in the next draft
                </span>
                <button
                  onClick={() => clearContextBasket()}
                  className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark hover:text-red-500"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-1">
                {basket.map((snippet) => (
                  <div key={snippet.id} className="flex items-start gap-1.5">
                    <p className="flex-1 text-[11px] text-x-secondary-light dark:text-x-secondary-dark leading-snug">
                      <span className="font-medium text-x-text-light dark:text-x-text-dark">
                        @{snippet.authorHandle}:
                      </span>{' '}
                      {snippet.text.length > 90 ? snippet.text.slice(0, 90) + '…' : snippet.text}
                    </p>
                    <button
                      onClick={() => removeFromContextBasket(snippet.id)}
                      title="Remove from context"
                      className="shrink-0 text-xs text-x-secondary-light dark:text-x-secondary-dark hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
                Tip: click ⊕ under any post on X to add it here.
              </p>
            </div>
          )}

          {/* Context block toggles */}
          <div>
            <label className="block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-1.5">
              Context
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CONTEXT_BLOCKS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleContext(key)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    context[key]
                      ? 'bg-x-accent/10 border-x-accent text-x-accent'
                      : 'border-x-border-light dark:border-x-border-dark text-x-secondary-light dark:text-x-secondary-dark'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-1.5">
              Strategy
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  title={STRATEGY_DESCRIPTIONS[s]}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    strategy === s
                      ? 'bg-x-accent text-white border-x-accent'
                      : 'border-x-border-light dark:border-x-border-dark text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark'
                  }`}
                >
                  {STRATEGY_LABELS[s]}
                  {s === 'bait_question' && ' 🎣'}
                </button>
              ))}
            </div>
          </div>

          {/* Intent */}
          <div>
            <label className="block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-1.5">
              Your rough thought
            </label>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={2}
              placeholder="What do you want to say? (optional, the strategy alone works too)"
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-1 focus:ring-x-accent"
            />
          </div>

          {/* Draft actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={status === 'streaming' ? cancelDraft : generateDraft}
              disabled={!canDraft && status !== 'streaming'}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                status === 'streaming'
                  ? 'bg-gray-100 dark:bg-gray-800 text-x-text-light dark:text-x-text-dark'
                  : 'bg-x-accent text-white hover:bg-x-accent/90 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {status === 'streaming' ? 'Cancel' : draft ? 'Redraft' : 'Draft reply'}
            </button>
            <button
              onClick={variantsActive ? cancelDraft : () => generateVariants(3)}
              disabled={!canDraft && !variantsActive}
              title="Generate three takes and pick the best"
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-x-border-light dark:border-x-border-dark text-x-text-light dark:text-x-text-dark hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {variantsActive ? 'Cancel' : '3 takes'}
            </button>
            {metrics && (
              <span className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
                first token {(metrics.ttftMs / 1000).toFixed(1)}s ·{' '}
                {(metrics.totalMs / 1000).toFixed(1)}s total
                {metrics.inputTokens !== null && metrics.outputTokens !== null && (
                  <> · {fmtTokens(metrics.inputTokens)}→{fmtTokens(metrics.outputTokens)} tok</>
                )}
              </span>
            )}
          </div>

          {/* Variant takes */}
          {variantsActive && (
            <div className="space-y-2">
              {variants.map((variant, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-x-border-light dark:border-x-border-dark p-2"
                >
                  <p className="text-sm text-x-text-light dark:text-x-text-dark whitespace-pre-wrap min-h-[20px]">
                    {variant.text}
                    {!variant.done && (
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-x-accent animate-pulse" />
                    )}
                  </p>
                  {variant.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{variant.error}</p>
                  )}
                  {variant.done && !variant.error && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={() => pickVariant(i)}
                        className="px-2 py-1 text-xs font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 transition-colors"
                      >
                        Use this one
                      </button>
                      <button
                        onClick={(e) => {
                          navigator.clipboard.writeText(variant.text.trim());
                          const el = e.currentTarget;
                          el.textContent = 'Copied!';
                          setTimeout(() => {
                            el.textContent = 'Copy';
                          }, 1500);
                        }}
                        className="px-2 py-1 text-xs rounded-lg border border-x-border-light dark:border-x-border-dark text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>
          )}

          {/* Draft output */}
          {(draft || status === 'streaming') && (
            <div className="space-y-2">
              {status === 'streaming' ? (
                <div className="w-full min-h-[72px] px-2 py-1.5 text-sm rounded-lg border border-x-accent/50 bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark whitespace-pre-wrap">
                  {draft}
                  <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-x-accent animate-pulse" />
                </div>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-1 focus:ring-x-accent"
                />
              )}

              {status === 'done' && (
                <div className="flex flex-wrap gap-1.5">
                  {REFINEMENTS.map(({ label, instruction }) => (
                    <button
                      key={label}
                      onClick={() => refineDraft(instruction)}
                      className="px-2 py-0.5 text-xs rounded-full border border-x-border-light dark:border-x-border-dark text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark hover:border-x-accent transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {status === 'done' && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleInsert}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 transition-colors"
                    >
                      Insert into reply box
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(draft)}
                      className="px-2 py-1.5 text-xs text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark"
                    >
                      Copy
                    </button>
                    {insertResult === 'ok' && (
                      <span className="text-xs text-green-600 dark:text-green-500">Inserted</span>
                    )}
                    {insertResult === 'fail' && (
                      <span className="text-xs text-red-600 dark:text-red-400">
                        Click into the reply box first
                      </span>
                    )}
                  </div>
                  <CharacterCount charCount={charCount} />
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark text-center">
            Drafts are never posted automatically. You review and click Post on X.
          </p>
        </>
      )}
    </div>
  );
}
