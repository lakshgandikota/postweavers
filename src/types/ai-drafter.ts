/**
 * AI reply drafter types
 *
 * Human-in-the-loop reply drafting: the extension drafts text from the
 * user's rough intent, the user reviews/edits, and the user clicks X's
 * own Post button. Nothing is ever posted automatically.
 */

/**
 * Reply strategy presets
 * Each maps to prompt instructions in prompt-builder.ts
 */
export type ReplyStrategy =
  | 'agree_add'
  | 'contrarian'
  | 'insight'
  | 'humor'
  | 'bait_question'
  | 'custom';

/** Display labels for strategies */
export const STRATEGY_LABELS: Record<ReplyStrategy, string> = {
  agree_add: 'Agree & add',
  contrarian: 'Contrarian',
  insight: 'Add insight',
  humor: 'Humor',
  bait_question: 'Bait question',
  custom: 'Custom',
};

/** Short descriptions shown in the UI */
export const STRATEGY_DESCRIPTIONS: Record<ReplyStrategy, string> = {
  agree_add: 'Agree with the post and add something new',
  contrarian: 'Respectfully push back with a counterpoint',
  insight: 'Contribute a non-obvious observation or fact',
  humor: 'A witty or playful take',
  bait_question: 'Plant a deliberate question designed to farm replies',
  custom: 'Your own strategy, defined in AI Reply settings',
};

/**
 * LLM provider for bring-your-own-key drafting
 */
export type LlmProvider = 'anthropic' | 'openai' | 'openrouter';

/** Default model per provider (user can override in settings) */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-4o-mini',
  // OpenRouter namespaces every model as `vendor/model`. Sonnet balances
  // voice-matching quality against cost for replies this short.
  openrouter: 'anthropic/claude-sonnet-5',
};

/**
 * Which context blocks to include in a draft request
 */
export interface ContextToggles {
  /** User's persona / "about me" text */
  aboutMe: boolean;
  /** Voice examples from the user's own captured tweets */
  voice: boolean;
  /** The post being replied to */
  post: boolean;
  /** Preceding tweets in the thread */
  thread: boolean;
  /** Captured bio of the post's author */
  authorBio: boolean;
}

/**
 * A post/reply the user hand-picked from the X UI as extra drafting context.
 * Gathered via the ⊕ button injected on posts; stored in a small basket.
 */
export interface ContextSnippet {
  /** Stable id for removal (authorHandle + text hash) */
  id: string;
  /** @handle of the snippet's author (without @) */
  authorHandle: string;
  /** The post text */
  text: string;
  /** Epoch ms when gathered */
  addedAt: number;
}

/** Max snippets kept in the context basket */
export const CONTEXT_BASKET_LIMIT = 8;

/**
 * The tweet being replied to, extracted from the page DOM
 */
export interface ReplyTarget {
  /** @handle of the post author (without @) */
  authorHandle: string;
  /** Display name of the post author */
  authorName: string;
  /** Full text of the post */
  text: string;
  /** ISO timestamp of the post, when extractable (drives the timing nudge) */
  postedAt?: string | null;
  /** Preceding tweets in the thread (oldest first), if on a status page */
  thread: Array<{ authorHandle: string; text: string }>;
}

/**
 * A draft request sent from the side panel to the background worker
 */
export interface DraftRequest {
  /** The user's rough thought on what they want to say */
  intent: string;
  /** Selected response strategy */
  strategy: ReplyStrategy;
  /** Which context blocks to include */
  context: ContextToggles;
  /** The post being replied to (null when drafting blind) */
  target: ReplyTarget | null;
  /**
   * Topic pools to include, by id. Pinned topics are always added by the
   * background worker on top of these.
   */
  topicIds?: string[];
  /** When set, revise an existing draft instead of drafting fresh */
  refine?: { current: string; instruction: string } | null;
}

/**
 * Streaming port messages (background -> side panel)
 */
export type DraftPortMessage =
  | { type: 'CHUNK'; text: string }
  | {
      type: 'DONE';
      ttftMs: number;
      totalMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
    }
  | { type: 'ERROR'; error: string };

/**
 * Port message from side panel to background to start a draft
 */
export type DraftPortRequest = { type: 'DRAFT'; request: DraftRequest };

/** Port name for the draft streaming connection */
export const DRAFT_PORT_NAME = 'pw-draft';

/**
 * AI drafter settings
 */
/** Where drafts are billed from: user's own key or the managed backend */
export type KeyMode = 'byo' | 'managed';

export interface AiDrafterSettings {
  /** Whether the AI drafter is enabled */
  enabled: boolean;
  /** BYO key vs PostWeaver Cloud (backend-managed key with quotas) */
  keyMode: KeyMode;
  /** LLM provider */
  provider: LlmProvider;
  /** API key for the selected provider (stored locally, never synced) */
  apiKey: string;
  /** Model ID; empty string means use the provider default */
  model: string;
  /** "About me" persona text included as context */
  persona: string;
  /** Extra rules appended to the system prompt (editable "system prompt") */
  customInstructions: string;
  /** Instruction used when the 'custom' strategy is selected */
  customStrategy: string;
  /**
   * Learned, distilled style guide for the user's voice. Generated once from
   * their captured posts and reused on every draft (no re-analysis per draft).
   * Editable by the user.
   */
  voiceProfile: string;
  /** When the voice profile was last learned (epoch ms; 0 = never) */
  voiceLearnedAt: number;
  /** How many posts the current voice profile was learned from */
  voiceSourceCount: number;
  /** How many own tweets to include as voice examples alongside the profile */
  voiceExampleCount: number;
  /** Default context toggles for new drafts */
  contextDefaults: ContextToggles;
  /** Default strategy for new drafts */
  defaultStrategy: ReplyStrategy;
  /** Max tokens for a draft (replies are short) */
  maxTokens: number;
}

/**
 * Default AI drafter settings
 */
export const DEFAULT_AI_DRAFTER_SETTINGS: AiDrafterSettings = {
  enabled: true,
  keyMode: 'byo',
  provider: 'anthropic',
  apiKey: '',
  model: '',
  persona: '',
  customInstructions: '',
  customStrategy: '',
  voiceProfile: '',
  voiceLearnedAt: 0,
  voiceSourceCount: 0,
  voiceExampleCount: 3,
  contextDefaults: {
    aboutMe: true,
    voice: true,
    post: true,
    thread: true,
    authorBio: false,
  },
  defaultStrategy: 'agree_add',
  maxTokens: 300,
};
