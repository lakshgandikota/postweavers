import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AiDrafterSettings,
  ContextToggles,
  DraftPortMessage,
  ReplyStrategy,
  ReplyTarget,
} from '../types/ai-drafter';
import { DEFAULT_AI_DRAFTER_SETTINGS, DRAFT_PORT_NAME } from '../types/ai-drafter';
import {
  getAiDrafterSettings,
  updateAiDrafterSettings,
  subscribeToAiDrafterSettings,
} from '../lib/storage';
import type { ComposeContext } from '../types/messages';
import type { Topic } from '../types/topics';
import { getTopics, subscribeToTopics, suggestTopics } from '../lib/topics';

export type DraftStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface DraftVariant {
  text: string;
  done: boolean;
  error: string | null;
}

export interface DraftMetrics {
  ttftMs: number;
  totalMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface UseDrafterReturn {
  // Settings
  settings: AiDrafterSettings;
  settingsLoading: boolean;
  updateSettings: (updates: Partial<AiDrafterSettings>) => Promise<void>;

  // Reply target (from compose focus or manual refresh)
  target: ReplyTarget | null;
  refreshTarget: () => Promise<void>;

  // Draft request state
  intent: string;
  setIntent: (value: string) => void;
  strategy: ReplyStrategy;
  setStrategy: (value: ReplyStrategy) => void;
  context: ContextToggles;
  toggleContext: (key: keyof ContextToggles) => void;

  // Topic pools
  topics: Topic[];
  /** Ids selected for this draft (pinned topics are always added on top) */
  selectedTopicIds: string[];
  /** Ids the auto-suggester picked from the post text */
  suggestedTopicIds: string[];
  toggleTopic: (id: string) => void;

  // Draft output state
  draft: string;
  setDraft: (value: string) => void;
  status: DraftStatus;
  error: string | null;
  metrics: DraftMetrics | null;

  // Variant state (multiple takes side-by-side)
  variants: DraftVariant[];
  variantsActive: boolean;
  pickVariant: (index: number) => void;

  // Actions
  generateDraft: () => void;
  generateVariants: (count?: number) => void;
  refineDraft: (instruction: string) => void;
  cancelDraft: () => void;
  insertDraft: () => Promise<boolean>;
}

export function useDrafter(): UseDrafterReturn {
  const [settings, setSettings] = useState<AiDrafterSettings>(DEFAULT_AI_DRAFTER_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const [intent, setIntent] = useState('');
  const [strategy, setStrategy] = useState<ReplyStrategy>(
    DEFAULT_AI_DRAFTER_SETTINGS.defaultStrategy
  );
  const [context, setContext] = useState<ContextToggles>(
    DEFAULT_AI_DRAFTER_SETTINGS.contextDefaults
  );

  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [suggestedTopicIds, setSuggestedTopicIds] = useState<string[]>([]);

  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DraftMetrics | null>(null);

  const [variants, setVariants] = useState<DraftVariant[]>([]);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const variantPortsRef = useRef<chrome.runtime.Port[]>([]);

  // Load settings and seed strategy/context defaults from them
  useEffect(() => {
    getAiDrafterSettings().then((loaded) => {
      setSettings(loaded);
      setStrategy(loaded.defaultStrategy);
      setContext(loaded.contextDefaults);
      setSettingsLoading(false);
    });

    return subscribeToAiDrafterSettings(setSettings);
  }, []);

  // Topics: keep the list live, and re-suggest whenever the target changes
  useEffect(() => {
    getTopics().then(setTopics);
    return subscribeToTopics(setTopics);
  }, []);

  useEffect(() => {
    const text = target ? [target.text, ...target.thread.map((t) => t.text)].join(' ') : '';
    const suggested = suggestTopics(text, topics).map((t) => t.id);
    setSuggestedTopicIds(suggested);
    setSelectedTopicIds(suggested);
    // Only re-run on a new target or when topics change identity; manual
    // toggles must survive re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.authorHandle, target?.text, topics]);

  const toggleTopic = useCallback((id: string) => {
    setSelectedTopicIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }, []);

  // Pick up the reply target when the user focuses a reply box on X
  useEffect(() => {
    const handleMessage = (message: { type: string; context?: ComposeContext }) => {
      if (message.type === 'COMPOSE_FOCUSED' && message.context?.type === 'reply') {
        setTarget(message.context.target ?? null);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Close any open ports on unmount
  useEffect(() => {
    return () => {
      portRef.current?.disconnect();
      variantPortsRef.current.forEach((p) => p.disconnect());
    };
  }, []);

  const refreshTarget = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_REPLY_CONTEXT' });
      setTarget(response?.target ?? null);
    } catch {
      setTarget(null);
    }
  }, []);

  const toggleContext = useCallback((key: keyof ContextToggles) => {
    setContext((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  /**
   * Open a draft port streaming into the main draft area.
   * Used by both fresh drafts and refinements.
   */
  const startMainDraft = useCallback(
    (request: {
      intent: string;
      strategy: typeof strategy;
      context: ContextToggles;
      target: ReplyTarget | null;
      topicIds: string[];
      refine?: { current: string; instruction: string } | null;
    }) => {
      portRef.current?.disconnect();

      setDraft('');
      setError(null);
      setMetrics(null);
      setStatus('streaming');

      const port = chrome.runtime.connect({ name: DRAFT_PORT_NAME });
      portRef.current = port;

      port.onMessage.addListener((message: DraftPortMessage) => {
        if (message.type === 'CHUNK') {
          setDraft((current) => current + message.text);
        } else if (message.type === 'DONE') {
          setMetrics({
            ttftMs: message.ttftMs,
            totalMs: message.totalMs,
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
          });
          setStatus('done');
          port.disconnect();
          portRef.current = null;
        } else if (message.type === 'ERROR') {
          setError(message.error);
          setStatus('error');
          port.disconnect();
          portRef.current = null;
        }
      });

      port.onDisconnect.addListener(() => {
        // "Receiving end does not exist" means the running background worker
        // predates the drafter — a stale extension load, fixed by reloading it
        const lastError = chrome.runtime.lastError?.message;
        if (portRef.current === port) {
          portRef.current = null;
          // Background died mid-stream without a DONE/ERROR
          setStatus((current) => (current === 'streaming' ? 'error' : current));
          setError(
            (current) =>
              current ??
              `Lost connection to the background worker${lastError ? ` (${lastError})` : ''}. ` +
                'Reload the extension at chrome://extensions and reopen this panel.'
          );
        }
      });

      port.postMessage({ type: 'DRAFT', request });
    },
    []
  );

  const generateDraft = useCallback(() => {
    setVariants([]);
    startMainDraft({ intent, strategy, context, target, topicIds: selectedTopicIds });
  }, [intent, strategy, context, target, selectedTopicIds, startMainDraft]);

  /** Revise the current draft in place (shorter, punchier, etc.) */
  const refineDraft = useCallback(
    (instruction: string) => {
      const current = draft.trim();
      if (!current) return;
      startMainDraft({
        intent,
        strategy,
        context,
        target,
        topicIds: selectedTopicIds,
        refine: { current, instruction },
      });
    },
    [draft, intent, strategy, context, target, selectedTopicIds, startMainDraft]
  );

  /** Generate several takes in parallel; user picks one into the main draft */
  const generateVariants = useCallback(
    (count = 3) => {
      portRef.current?.disconnect();
      portRef.current = null;
      variantPortsRef.current.forEach((p) => p.disconnect());
      variantPortsRef.current = [];

      setDraft('');
      setError(null);
      setMetrics(null);
      setStatus('idle');
      setVariants(
        Array.from({ length: count }, () => ({ text: '', done: false, error: null }))
      );

      for (let i = 0; i < count; i++) {
        const port = chrome.runtime.connect({ name: DRAFT_PORT_NAME });
        variantPortsRef.current.push(port);

        const updateVariant = (patch: Partial<DraftVariant>, append?: string) => {
          setVariants((prev) =>
            prev.map((v, idx) =>
              idx === i ? { ...v, ...patch, text: append !== undefined ? v.text + append : v.text } : v
            )
          );
        };

        port.onMessage.addListener((message: DraftPortMessage) => {
          if (message.type === 'CHUNK') {
            updateVariant({}, message.text);
          } else if (message.type === 'DONE') {
            updateVariant({ done: true });
            port.disconnect();
          } else if (message.type === 'ERROR') {
            updateVariant({ done: true, error: message.error });
            port.disconnect();
          }
        });

        port.onDisconnect.addListener(() => {
          const lastError = chrome.runtime.lastError?.message;
          if (lastError) {
            updateVariant({ done: true, error: lastError });
          }
        });

        port.postMessage({
          type: 'DRAFT',
          request: { intent, strategy, context, target, topicIds: selectedTopicIds },
        });
      }
    },
    [intent, strategy, context, target, selectedTopicIds]
  );

  const pickVariant = useCallback(
    (index: number) => {
      const chosen = variants[index];
      if (!chosen || !chosen.text.trim()) return;
      setDraft(chosen.text.trim());
      setStatus('done');
      setVariants([]);
    },
    [variants]
  );

  const cancelDraft = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
    variantPortsRef.current.forEach((p) => p.disconnect());
    variantPortsRef.current = [];
    setVariants([]);
    setStatus((current) => (current === 'streaming' ? 'idle' : current));
  }, []);

  const insertDraft = useCallback(async (): Promise<boolean> => {
    if (!draft.trim()) return false;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'INSERT_DRAFT',
        content: draft.trim(),
      });
      return response?.success ?? false;
    } catch {
      return false;
    }
  }, [draft]);

  const updateSettingsCallback = useCallback(
    async (updates: Partial<AiDrafterSettings>) => {
      await updateAiDrafterSettings(updates);
    },
    []
  );

  return {
    settings,
    settingsLoading,
    updateSettings: updateSettingsCallback,
    target,
    refreshTarget,
    intent,
    setIntent,
    strategy,
    setStrategy,
    context,
    toggleContext,
    topics,
    selectedTopicIds,
    suggestedTopicIds,
    toggleTopic,
    draft,
    setDraft,
    status,
    error,
    metrics,
    variants,
    variantsActive: variants.length > 0,
    pickVariant,
    generateDraft,
    generateVariants,
    refineDraft,
    cancelDraft,
    insertDraft,
  };
}
