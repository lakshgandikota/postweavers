/**
 * Prompt builder for AI reply drafting
 *
 * Ordering matters: static content (role, strategy catalog, persona, voice
 * examples) goes in the system prompt so provider prefix caching can reuse
 * it across drafts; per-request content (post, thread, intent) goes in the
 * user message. Changing persona/voice invalidates the cache; changing the
 * post or intent does not.
 */

import type { DraftRequest, ReplyStrategy } from '../../types/ai-drafter';

/** Max characters of a single tweet included as context */
const MAX_CONTEXT_TWEET_CHARS = 500;

/** Max thread tweets included as context */
const MAX_THREAD_TWEETS = 5;

/**
 * Per-strategy drafting instructions
 */
const STRATEGY_INSTRUCTIONS: Record<ReplyStrategy, string> = {
  agree_add:
    'Agree with the post, then add something genuinely new: a supporting example, a consequence the author did not mention, or a sharper way to say it. Never just restate the post.',
  contrarian:
    'Push back on the post with a specific counterpoint or counterexample. Be direct but respectful: challenge the idea, not the person. No strawmanning.',
  insight:
    'Contribute a non-obvious observation, fact, or connection that makes readers feel smarter for having read the reply. Specificity beats generality.',
  humor:
    'Reply with a witty or playful take. Land one joke, keep it short, and stay on-topic. Never punch down at the author.',
  bait_question:
    'End the reply with a deliberate baited question engineered to farm responses: pick the angle of the post people are most likely to have strong, divided opinions about, take a light stance, then ask the question that makes readers need to answer. The question must be specific to the post. Generic "what do you think?" questions are forbidden.',
  // Placeholder — the actual instruction comes from the user's customStrategy
  // (resolved by the caller); this is only used if that text is empty.
  custom: 'Write a natural, on-topic reply.',
};

/**
 * Voice example for style matching
 */
export interface VoiceExample {
  text: string;
}

/**
 * Static context resolved by the background worker before prompt assembly
 */
export interface ResolvedContext {
  /** Persona text ('' when disabled or unset) */
  persona: string;
  /** Voice examples ([] when disabled or none captured) */
  voiceExamples: VoiceExample[];
  /** Author bio ('' when disabled or not captured) */
  authorBio: string;
  /** Extra system-prompt rules from settings ('' when unset) */
  customInstructions: string;
  /** User-defined strategy instruction, used when strategy is 'custom' */
  customStrategy: string;
  /** Learned voice style guide ('' when not yet learned or voice disabled) */
  voiceProfile: string;
  /** Recent captured posts by the reply target's author ([] when unavailable) */
  authorRecentPosts: string[];
  /** Posts the user hand-picked from the X UI as extra context ([] when none) */
  gatheredContext: Array<{ authorHandle: string; text: string }>;
  /**
   * Topic pools selected (or pinned) for this draft: what the user has
   * collected and thinks about each subject ([] when none apply)
   */
  topics: TopicContext[];
}

/** One topic's knowledge, ready for the prompt */
export interface TopicContext {
  name: string;
  stance: string;
  entries: Array<{ kind: 'post' | 'note'; text: string; authorHandle?: string }>;
}

/** Max entries per topic put in the prompt (newest kept) */
const MAX_TOPIC_ENTRIES = 25;

/**
 * Built prompt ready for an LLM call
 */
export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * Build the system prompt (static-first: role, strategies, persona, voice)
 */
export function buildSystemPrompt(resolved: ResolvedContext): string {
  const parts: string[] = [];

  parts.push(
    'You write a reply to a post on X, AS the user: a specific real person, not an assistant. ' +
      'Output ONLY the reply text: no quotes, no preamble, no explanation, no options.\n\n' +
      'Sound human and match how this user actually writes:\n' +
      '- SHORT. Usually one sentence; two at most. Aim well under 200 characters unless the thought truly needs more.\n' +
      '- Casual and direct. Fragments, lowercase, and blunt takes are good if that matches the user.\n' +
      "- No AI tells: never open with \"Great point\", \"Absolutely\", \"Well said\", \"I couldn't agree more\", \"So true\", or \"This.\"; don't restate or summarize the post; don't over-explain or hedge.\n" +
      '- Avoid em-dashes, semicolons, and corporate polish. Write like a person typing fast, not an editor.\n' +
      "- No hashtags or emoji unless the user's own voice clearly uses them.\n" +
      '- Never mention being an AI. Never use the same generic phrasing an AI would.'
  );

  // The learned voice profile is the primary style signal
  if (resolved.voiceProfile.trim()) {
    parts.push(
      `This is how the user writes. Match it exactly (length, casing, punctuation, slang, energy):\n${resolved.voiceProfile.trim()}`
    );
  }

  if (resolved.persona) {
    parts.push(`Who the user is:\n${resolved.persona}`);
  }

  // Topic knowledge: semi-static per subject, so it lives in the system
  // prompt and caches across redrafts and variants on the same post
  for (const topic of resolved.topics) {
    const block = formatTopic(topic);
    if (block) parts.push(block);
  }

  // Raw examples reinforce the abstract profile (or stand in when none learned)
  if (resolved.voiceExamples.length > 0) {
    const examples = resolved.voiceExamples
      .map((ex, i) => `${i + 1}. ${truncate(ex.text, MAX_CONTEXT_TWEET_CHARS)}`)
      .join('\n');
    parts.push(
      `Real posts by the user. Imitate this exact voice:\n${examples}`
    );
  }

  if (resolved.customInstructions.trim()) {
    parts.push(`Additional instructions from the user:\n${resolved.customInstructions.trim()}`);
  }

  return parts.join('\n\n');
}

/**
 * Build a prompt that analyzes the user's posts into a compact, reusable
 * voice style guide. Run once (not per draft); the result is stored.
 */
export function buildVoiceLearningPrompt(tweets: string[]): BuiltPrompt {
  const numbered = tweets
    .map((t, i) => `${i + 1}. ${truncate(t, MAX_CONTEXT_TWEET_CHARS)}`)
    .join('\n');

  return {
    system:
      'You analyze how one person writes on X and produce a concise, prescriptive style guide ' +
      'another writer could follow to imitate them convincingly. Output ONLY the guide.',
    user:
      `Here are real posts by one user:\n\n${numbered}\n\n` +
      'Write a tight style guide (6–9 short lines, no preamble) covering: typical length, ' +
      'tone/energy, formality, capitalization, punctuation habits, emoji/hashtag use, ' +
      'sentence structure, recurring vocabulary or slang, and any signature quirks. ' +
      'Be specific and concrete (quote a couple of characteristic phrasings). ' +
      'Do not summarize their topics, only HOW they write.',
  };
}

/**
 * Build the user message (per-request: post, thread, author bio, strategy, intent)
 */
export function buildUserPrompt(
  request: DraftRequest,
  resolved: ResolvedContext
): string {
  const parts: string[] = [];

  if (request.context.thread && request.target && request.target.thread.length > 0) {
    const thread = request.target.thread
      .slice(-MAX_THREAD_TWEETS)
      .map((t) => `@${t.authorHandle}: ${truncate(t.text, MAX_CONTEXT_TWEET_CHARS)}`)
      .join('\n');
    parts.push(`Earlier in the thread:\n${thread}`);
  }

  if (request.context.post && request.target) {
    parts.push(
      `The post to reply to, by ${request.target.authorName} (@${request.target.authorHandle}):\n` +
        truncate(request.target.text, MAX_CONTEXT_TWEET_CHARS)
    );
  }

  if (resolved.gatheredContext.length > 0) {
    const gathered = resolved.gatheredContext
      .map((s) => `- @${s.authorHandle}: ${truncate(s.text, MAX_CONTEXT_TWEET_CHARS)}`)
      .join('\n');
    parts.push(
      `Extra posts the user gathered as context. Use them for facts, tone of the conversation, or angles worth referencing:\n${gathered}`
    );
  }

  if (request.context.authorBio && (resolved.authorBio || resolved.authorRecentPosts.length > 0)) {
    const authorParts: string[] = [];
    if (resolved.authorBio) {
      authorParts.push(truncate(resolved.authorBio, 300));
    }
    if (resolved.authorRecentPosts.length > 0) {
      const recent = resolved.authorRecentPosts
        .slice(0, 3)
        .map((t) => `- ${truncate(t, 200)}`)
        .join('\n');
      authorParts.push(`Recent posts by them:\n${recent}`);
    }
    parts.push(`About the post's author:\n${authorParts.join('\n')}`);
  }

  // Refine mode: revise an existing draft instead of drafting fresh
  if (request.refine) {
    parts.push(`The current draft of the reply:\n${request.refine.current}`);
    parts.push(
      `Revise it: ${request.refine.instruction}. Keep the same voice. Output only the revised reply.`
    );
    return parts.join('\n\n');
  }

  const strategyInstruction =
    request.strategy === 'custom' && resolved.customStrategy.trim()
      ? resolved.customStrategy.trim()
      : STRATEGY_INSTRUCTIONS[request.strategy];
  parts.push(`Reply strategy: ${strategyInstruction}`);

  parts.push(
    request.intent.trim()
      ? `The user's rough thought on what to say:\n${request.intent.trim()}`
      : 'The user gave no specific thought. Draft the reply purely from the strategy and context.'
  );

  parts.push('Draft the reply now.');

  return parts.join('\n\n');
}

/**
 * Build the complete prompt for a draft request
 */
export function buildPrompt(
  request: DraftRequest,
  resolved: ResolvedContext
): BuiltPrompt {
  return {
    system: buildSystemPrompt(resolved),
    user: buildUserPrompt(request, resolved),
  };
}

/**
 * Render one topic pool as a system-prompt block. Returns '' when the topic
 * has nothing usable (no stance, no entries).
 */
function formatTopic(topic: TopicContext): string {
  const stance = topic.stance.trim();
  const entries = topic.entries.slice(-MAX_TOPIC_ENTRIES);
  if (!stance && entries.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    `What the user knows and thinks about "${topic.name}". Use it for facts, framing, and angles so the reply sounds informed and consistent with their view. Do not quote it verbatim unless it fits naturally.`
  );
  if (stance) lines.push(`The user's stance: ${stance}`);
  if (entries.length > 0) {
    const list = entries
      .map((e) => {
        const text = truncate(e.text, MAX_CONTEXT_TWEET_CHARS);
        return e.kind === 'post'
          ? `- Saved post${e.authorHandle ? ` by @${e.authorHandle}` : ''}: ${text}`
          : `- User's note: ${text}`;
      })
      .join('\n');
    lines.push(`Collected material:\n${list}`);
  }
  return lines.join('\n');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
