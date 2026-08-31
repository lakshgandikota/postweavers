import { useState, useEffect } from 'react';
import type { AiDrafterSettings, LlmProvider } from '../../types/ai-drafter';
import { DEFAULT_MODELS } from '../../types/ai-drafter';
import { STRIPE_PAYMENT_LINK_URL, STRIPE_PORTAL_URL } from '../../lib/firebase';

/** Human-friendly "time ago" for the last-learned label */
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
 * Sync account block: Google sign-in and cross-device sync status.
 * Lives under the Settings tab's "Account" section.
 */
export function SyncAccount() {
  const [syncEmail, setSyncEmail] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ plan: 'pro' | 'free'; comped: boolean } | null>(null);

  const loadPlan = () => {
    chrome.runtime
      .sendMessage({ type: 'GET_BILLING' })
      .then((res) => {
        if (res?.plan) setPlan({ plan: res.plan, comped: !!res.comped });
      })
      .catch(() => {});
  };

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }).then((res) => {
      setSyncEmail(res?.email ?? null);
    }).catch(() => {});
    loadPlan();
  }, []);

  const signInWithGoogle = async () => {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LINK_GOOGLE' });
      if (res?.success) {
        setSyncEmail(res.email ?? null);
        loadPlan();
      } else {
        setLinkError(res?.error ?? 'Sign-in failed.');
      }
    } catch (e) {
      setLinkError(String(e));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="rounded-lg border border-x-border-light dark:border-x-border-dark p-2">
      {syncEmail ? (
        <div className="space-y-1">
          <p className="text-xs text-x-text-light dark:text-x-text-dark">
            <span className="text-green-600 dark:text-green-500">●</span> Syncing across devices as{' '}
            <span className="font-medium">{syncEmail}</span>
          </p>
          {plan && (
            <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
              {plan.plan === 'pro' ? (
                <>
                  <span className="text-green-600 dark:text-green-500">●</span> Cloud Pro
                  {plan.comped ? ' (complimentary)' : ''}: voice, About me, and topics sync; managed drafting at Pro limits.
                </>
              ) : (
                <>Free plan: voice, About me, and topics still sync. Cloud Pro raises managed drafting limits.</>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
            Sign in so your voice, About me, and topics follow you to every device.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={linking}
            className="w-full px-3 py-1.5 text-sm font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 disabled:opacity-50 transition-colors"
          >
            {linking ? 'Signing in…' : 'Sign in with Google'}
          </button>
          {linkError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 break-all">{linkError}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Display name per provider, used for the picker and the storage note */
const PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

/** Shape of each provider's key, shown as the input placeholder */
const PROVIDER_KEY_HINTS: Record<LlmProvider, string> = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  openrouter: 'sk-or-v1-…',
};

/**
 * AI drafter configuration: provider, API key, model, and persona.
 * The API key stays in chrome.storage.local and is only sent to the
 * selected provider's API.
 */
export function DrafterSettings({
  settings,
  onUpdate,
}: {
  settings: AiDrafterSettings;
  onUpdate: (updates: Partial<AiDrafterSettings>) => Promise<void>;
}) {
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey);
  const [keyVisible, setKeyVisible] = useState(false);
  const [learning, setLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);
  const [billing, setBilling] = useState<{
    uid: string | null;
    plan: 'pro' | 'free';
    comped?: boolean;
    dailyLimit?: number | null;
  } | null>(null);

  useEffect(() => {
    if (settings.keyMode !== 'managed') return;
    chrome.runtime.sendMessage({ type: 'GET_BILLING' }).then(setBilling).catch(() => {});
  }, [settings.keyMode]);

  const openUpgrade = () => {
    if (!STRIPE_PAYMENT_LINK_URL || !billing?.uid) return;
    chrome.tabs.create({
      url: `${STRIPE_PAYMENT_LINK_URL}?client_reference_id=${encodeURIComponent(billing.uid)}`,
    });
  };

  const learnVoice = async () => {
    setLearning(true);
    setLearnError(null);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LEARN_VOICE' });
      if (!res?.success) {
        setLearnError(res?.error ?? 'Failed to learn voice.');
      }
      // On success the background persists it; the settings subscription
      // updates the profile field automatically.
    } catch (e) {
      setLearnError(String(e));
    } finally {
      setLearning(false);
    }
  };

  const labelClass =
    'block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-1';
  const inputClass =
    'w-full px-2 py-1.5 text-sm rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-900 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-1 focus:ring-x-accent';

  return (
    <div className="space-y-3">
      {/* Key mode */}
      <div>
        <label className={labelClass}>Drafting runs on</label>
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {(
            [
              { mode: 'managed', label: 'PostWeaver Cloud' },
              { mode: 'byo', label: 'My own key' },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdate({ keyMode: mode })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                settings.keyMode === mode
                  ? 'bg-white dark:bg-gray-700 text-x-text-light dark:text-x-text-dark shadow-sm'
                  : 'text-x-secondary-light dark:text-x-secondary-dark'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {settings.keyMode === 'managed' && (
          <div className="mt-1 space-y-1.5">
            <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
              Drafts run through PostWeaver's backend, no API key needed. Daily limits apply.
            </p>
            {billing?.plan === 'pro' ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-x-text-light dark:text-x-text-dark">
                  <span className="text-green-600 dark:text-green-500">●</span> Cloud Pro active
                  {billing.comped ? ' (complimentary)' : ''}
                  {billing.dailyLimit ? (
                    <span className="text-x-secondary-light dark:text-x-secondary-dark">
                      {' '}· {billing.dailyLimit} drafts/day
                    </span>
                  ) : null}
                </p>
                {!billing.comped && (
                  <button
                    type="button"
                    onClick={() => chrome.tabs.create({ url: STRIPE_PORTAL_URL })}
                    title="Cancel, change card, or download invoices via Stripe's secure portal"
                    className="text-xs text-x-accent hover:text-x-accent/80 font-medium transition-colors"
                  >
                    Manage billing
                  </button>
                )}
              </div>
            ) : (
              billing &&
              STRIPE_PAYMENT_LINK_URL && (
                <button
                  type="button"
                  onClick={openUpgrade}
                  className="w-full px-3 py-1.5 text-sm font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 transition-colors"
                >
                  Upgrade to Cloud Pro ($12/mo)
                </button>
              )
            )}
          </div>
        )}
      </div>

      {settings.keyMode === 'byo' && (
      <>
      {/* Provider */}
      <div>
        <label className={labelClass}>Provider</label>
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {(['anthropic', 'openai', 'openrouter'] as LlmProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => onUpdate({ provider })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                settings.provider === provider
                  ? 'bg-white dark:bg-gray-700 text-x-text-light dark:text-x-text-dark shadow-sm'
                  : 'text-x-secondary-light dark:text-x-secondary-dark'
              }`}
            >
              {PROVIDER_LABELS[provider]}
            </button>
          ))}
        </div>
      </div>

      {/* API key */}
      <div>
        <label className={labelClass}>API key</label>
        <div className="flex gap-1">
          <input
            type={keyVisible ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onBlur={() => onUpdate({ apiKey: apiKeyInput.trim() })}
            placeholder={PROVIDER_KEY_HINTS[settings.provider]}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setKeyVisible(!keyVisible)}
            className="px-2 text-xs text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark"
          >
            {keyVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
          Stored locally; sent only to {PROVIDER_LABELS[settings.provider]}.
        </p>
      </div>

      {/* Model */}
      <div>
        <label className={labelClass}>Model</label>
        <input
          type="text"
          value={settings.model}
          onChange={(e) => onUpdate({ model: e.target.value })}
          placeholder={DEFAULT_MODELS[settings.provider]}
          className={inputClass}
        />
        {settings.provider === 'openrouter' && (
          <p className="mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
            OpenRouter model IDs are namespaced, like{' '}
            <span className="font-mono">anthropic/claude-sonnet-5</span> or{' '}
            <span className="font-mono">google/gemini-2.5-flash</span>. Browse them at{' '}
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer noopener"
              className="text-x-accent hover:underline"
            >
              openrouter.ai/models
            </a>
            .
          </p>
        )}
      </div>
      </>
      )}

      <p className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
        "About me" and your topics live in the Context tab.
      </p>

      {/* Custom system instructions */}
      <div>
        <label className={labelClass}>Custom instructions (appended to every draft)</label>
        <textarea
          value={settings.customInstructions}
          onChange={(e) => onUpdate({ customInstructions: e.target.value })}
          rows={3}
          placeholder="e.g. Never use hashtags. Keep it under 2 sentences. Lowercase only."
          className={inputClass}
        />
        <p className="mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
          Added to the system prompt for every reply, on top of the core rules.
        </p>
      </div>

      {/* Custom strategy */}
      <div>
        <label className={labelClass}>Custom strategy (used by the "Custom" strategy)</label>
        <textarea
          value={settings.customStrategy}
          onChange={(e) => onUpdate({ customStrategy: e.target.value })}
          rows={3}
          placeholder="e.g. Steelman the opposite view in one line, then ask which assumption they'd drop first."
          className={inputClass}
        />
      </div>

      {/* Learned voice profile */}
      <div className="border-t border-x-border-light dark:border-x-border-dark pt-3">
        <div className="flex items-center justify-between mb-1">
          <label className={labelClass + ' mb-0'}>Your voice</label>
          {settings.voiceLearnedAt > 0 && (
            <span className="text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
              learned from {settings.voiceSourceCount} posts · {timeAgo(settings.voiceLearnedAt)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={learnVoice}
          disabled={learning || (settings.keyMode === 'byo' && !settings.apiKey)}
          className="w-full px-3 py-1.5 mb-2 text-sm font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {learning
            ? 'Analyzing your posts…'
            : settings.voiceProfile
              ? 'Re-learn my voice'
              : 'Learn my voice from my posts'}
        </button>

        {learnError && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-2 break-words">{learnError}</p>
        )}

        <textarea
          value={settings.voiceProfile}
          onChange={(e) => onUpdate({ voiceProfile: e.target.value })}
          rows={settings.voiceProfile ? 7 : 3}
          placeholder="Click 'Learn my voice' to distill a style guide from your captured posts. You can edit it after. This is stored and reused on every draft, with no re-analysis each time."
          className={inputClass}
        />
        <p className="mt-1 text-[10px] text-x-secondary-light dark:text-x-secondary-dark">
          Used when the "My voice" block is on. It's editable, so tweak it if a draft feels off.
        </p>
      </div>

      {/* Raw example count (secondary — reinforces the profile) */}
      <div>
        <label className={labelClass}>
          Also include {settings.voiceExampleCount} raw example post
          {settings.voiceExampleCount === 1 ? '' : 's'}
        </label>
        <input
          type="range"
          min={0}
          max={8}
          value={settings.voiceExampleCount}
          onChange={(e) => onUpdate({ voiceExampleCount: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  );
}
