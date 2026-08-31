import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildVoiceLearningPrompt,
} from './prompt-builder';
import type { ResolvedContext } from './prompt-builder';
import type { DraftRequest } from '../../types/ai-drafter';

const EMPTY_CONTEXT: ResolvedContext = {
  persona: '',
  voiceExamples: [],
  authorBio: '',
  customInstructions: '',
  customStrategy: '',
  voiceProfile: '',
  authorRecentPosts: [],
  gatheredContext: [],
  topics: [],
};

function makeRequest(overrides: Partial<DraftRequest> = {}): DraftRequest {
  return {
    intent: 'point out the tradeoff they missed',
    strategy: 'insight',
    context: { aboutMe: true, voice: true, post: true, thread: true, authorBio: true },
    target: {
      authorHandle: 'someuser',
      authorName: 'Some User',
      text: 'Shipping fast beats shipping perfect, every time.',
      thread: [{ authorHandle: 'earlier', text: 'Hot takes incoming' }],
    },
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('always includes the core drafting rules', () => {
    const system = buildSystemPrompt(EMPTY_CONTEXT);
    expect(system).toContain('200 characters');
    expect(system).toContain('Output ONLY the reply text');
  });

  it('includes persona and voice examples when provided', () => {
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      persona: 'Indie hacker building dev tools',
      voiceExamples: [{ text: 'ship it and see' }, { text: 'perf is a feature' }],
    });
    expect(system).toContain('Indie hacker building dev tools');
    expect(system).toContain('1. ship it and see');
    expect(system).toContain('2. perf is a feature');
  });

  it('omits persona/voice sections when empty', () => {
    const system = buildSystemPrompt(EMPTY_CONTEXT);
    expect(system).not.toContain('About the user');
    expect(system).not.toContain('writing voice');
  });

  it('enforces short, human, no-AI-tell rules', () => {
    const system = buildSystemPrompt(EMPTY_CONTEXT);
    expect(system).toContain('SHORT');
    expect(system).toMatch(/Great point/);
    expect(system).toContain('Never mention being an AI');
  });

  it('includes the learned voice profile as the primary style signal', () => {
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      voiceProfile: 'lowercase, terse, dry humor, no emoji, one line max',
    });
    expect(system).toContain('This is how the user writes');
    expect(system).toContain('lowercase, terse, dry humor');
  });

  it('appends custom instructions when provided', () => {
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      customInstructions: 'Never use hashtags. Lowercase only.',
    });
    expect(system).toContain('Additional instructions from the user');
    expect(system).toContain('Never use hashtags. Lowercase only.');
  });
});

describe('topic context', () => {
  it('puts selected topics in the system prompt with stance and entries', () => {
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      topics: [
        {
          name: 'AI regulation',
          stance: 'Regulate outcomes, not model sizes.',
          entries: [
            { kind: 'post', text: 'the EU act keys on FLOPs, which is a proxy', authorHandle: 'policywonk' },
            { kind: 'note', text: 'compute thresholds age badly' },
          ],
        },
      ],
    });
    expect(system).toContain('about "AI regulation"');
    expect(system).toContain("The user's stance: Regulate outcomes, not model sizes.");
    expect(system).toContain('- Saved post by @policywonk: the EU act keys on FLOPs');
    expect(system).toContain("- User's note: compute thresholds age badly");
  });

  it('skips topics with nothing in them', () => {
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      topics: [{ name: 'Empty', stance: '  ', entries: [] }],
    });
    expect(system).not.toContain('Empty');
  });

  it('keeps the newest entries when a topic is over the prompt cap', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      kind: 'note' as const,
      text: `note number ${i}`,
    }));
    const system = buildSystemPrompt({
      ...EMPTY_CONTEXT,
      topics: [{ name: 'Big', stance: '', entries }],
    });
    expect(system).toContain('note number 39');
    expect(system).not.toContain('note number 0\n');
  });
});

describe('buildUserPrompt', () => {
  it('includes post, thread, bio, strategy, and intent when all toggles are on', () => {
    const user = buildUserPrompt(makeRequest(), {
      ...EMPTY_CONTEXT,
      authorBio: 'VC-funded founder',
    });
    expect(user).toContain('Shipping fast beats shipping perfect');
    expect(user).toContain('@earlier: Hot takes incoming');
    expect(user).toContain('VC-funded founder');
    expect(user).toContain('non-obvious observation');
    expect(user).toContain('point out the tradeoff they missed');
  });

  it('respects disabled context toggles', () => {
    const request = makeRequest({
      context: { aboutMe: false, voice: false, post: false, thread: false, authorBio: false },
    });
    const user = buildUserPrompt(request, {
      ...EMPTY_CONTEXT,
      authorBio: 'VC-funded founder',
    });
    expect(user).not.toContain('Shipping fast');
    expect(user).not.toContain('Hot takes incoming');
    expect(user).not.toContain('VC-funded founder');
  });

  it('handles a missing target and empty intent', () => {
    const user = buildUserPrompt(makeRequest({ target: null, intent: '  ' }), EMPTY_CONTEXT);
    expect(user).toContain('gave no specific thought');
    expect(user).toContain('Draft the reply now.');
  });

  it('maps each strategy to its instructions', () => {
    const baitPrompt = buildUserPrompt(makeRequest({ strategy: 'bait_question' }), EMPTY_CONTEXT);
    expect(baitPrompt).toContain('baited question');

    const humorPrompt = buildUserPrompt(makeRequest({ strategy: 'humor' }), EMPTY_CONTEXT);
    expect(humorPrompt).toContain('witty');
  });

  it('uses the user-defined instruction for the custom strategy', () => {
    const user = buildUserPrompt(makeRequest({ strategy: 'custom' }), {
      ...EMPTY_CONTEXT,
      customStrategy: 'Steelman the opposite view, then ask one pointed question.',
    });
    expect(user).toContain('Steelman the opposite view');
  });

  it('falls back to a default when custom strategy text is empty', () => {
    const user = buildUserPrompt(makeRequest({ strategy: 'custom' }), EMPTY_CONTEXT);
    expect(user).toContain('natural, on-topic reply');
  });

  it('includes the author\'s recent posts under the author block', () => {
    const user = buildUserPrompt(makeRequest(), {
      ...EMPTY_CONTEXT,
      authorBio: 'Builds rockets',
      authorRecentPosts: ['launch day tomorrow', 'engines are hard'],
    });
    expect(user).toContain('Builds rockets');
    expect(user).toContain('- launch day tomorrow');
    expect(user).toContain('- engines are hard');
  });

  it('includes hand-gathered context posts', () => {
    const user = buildUserPrompt(makeRequest(), {
      ...EMPTY_CONTEXT,
      gatheredContext: [
        { authorHandle: 'expert1', text: 'the benchmark numbers were misleading' },
        { authorHandle: 'expert2', text: 'shipping speed correlates with team size' },
      ],
    });
    expect(user).toContain('Extra posts the user gathered as context');
    expect(user).toContain('@expert1: the benchmark numbers were misleading');
    expect(user).toContain('@expert2: shipping speed correlates with team size');
  });

  it('omits the gathered-context section when the basket is empty', () => {
    const user = buildUserPrompt(makeRequest(), EMPTY_CONTEXT);
    expect(user).not.toContain('Extra posts the user gathered');
  });

  it('switches to revision mode when refine is set', () => {
    const user = buildUserPrompt(
      makeRequest({ refine: { current: 'my too-long draft', instruction: 'Make it shorter' } }),
      EMPTY_CONTEXT
    );
    expect(user).toContain('The current draft of the reply:\nmy too-long draft');
    expect(user).toContain('Revise it: Make it shorter');
    // Fresh-draft scaffolding must not leak into revision mode
    expect(user).not.toContain('Draft the reply now.');
    expect(user).not.toContain('Reply strategy:');
  });

  it('truncates very long post text', () => {
    const request = makeRequest({
      target: {
        authorHandle: 'a',
        authorName: 'A',
        text: 'x'.repeat(2000),
        thread: [],
      },
    });
    const user = buildUserPrompt(request, EMPTY_CONTEXT);
    expect(user).toContain('…');
    expect(user.length).toBeLessThan(2000);
  });
});

describe('buildVoiceLearningPrompt', () => {
  it('numbers the sample posts and asks for a how-they-write guide', () => {
    const { system, user } = buildVoiceLearningPrompt([
      'ship it and see what breaks',
      'perf is a feature not a nice-to-have',
    ]);
    expect(system).toContain('style guide');
    expect(user).toContain('1. ship it and see what breaks');
    expect(user).toContain('2. perf is a feature');
    expect(user).toContain('only HOW they write');
  });
});

describe('buildPrompt', () => {
  it('keeps static content in system and per-request content in user (cache-friendly ordering)', () => {
    const { system, user } = buildPrompt(makeRequest(), {
      ...EMPTY_CONTEXT,
      persona: 'Indie hacker',
      voiceExamples: [{ text: 'ship it' }],
    });
    // Static: persona/voice in system
    expect(system).toContain('Indie hacker');
    expect(system).toContain('ship it');
    // Volatile: post/intent in user, not system
    expect(system).not.toContain('Shipping fast');
    expect(user).toContain('Shipping fast');
  });
});
