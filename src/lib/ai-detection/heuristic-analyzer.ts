/**
 * Heuristic AI detection analyzer
 *
 * Detects AI-generated text using multiple linguistic and structural signals.
 * Conservative approach - requires multiple signals to flag content.
 */

import type { DetectionResult, DetectionSignal } from '../../types/ai-detection';

/**
 * Internal detection signal configuration with detect function
 */
interface InternalSignal {
  name: string;
  weight: number;
  detect: (text: string) => { score: number; reason: string };
}

/**
 * Common AI phrases that are overused by language models
 */
const AI_PHRASES = [
  'delve',
  'comprehensive',
  'robust',
  'leverage',
  'utilize',
  'tapestry',
  'multifaceted',
  'paradigm',
  'synergy',
  'holistic',
];

/**
 * Formal transitions overused by AI
 */
const FORMAL_TRANSITIONS = [
  'moreover',
  'furthermore',
  'additionally',
  'consequently',
  'nevertheless',
  'therefore',
  'thus',
  'hence',
];

/**
 * Formal opening phrases typical of AI
 */
const FORMAL_OPENINGS = [
  'i hope this finds you well',
  'i trust this',
  'it is worth noting',
  'it is important to note',
  'it should be noted',
];

/**
 * Detection signals with weighted scoring
 */
const INTERNAL_SIGNALS: InternalSignal[] = [
  {
    name: 'ai_phrases',
    weight: 0.25,
    detect: (text: string) => {
      const lower = text.toLowerCase();
      const matches = AI_PHRASES.filter((phrase) => lower.includes(phrase));
      const score = Math.min(matches.length / 3, 1); // 3+ matches = max score
      return {
        score,
        reason:
          matches.length > 0
            ? `Found ${matches.length} AI-typical phrases: ${matches.join(', ')}`
            : 'No AI-typical phrases detected',
      };
    },
  },
  {
    name: 'transitions',
    weight: 0.15,
    detect: (text: string) => {
      const lower = text.toLowerCase();
      const matches = FORMAL_TRANSITIONS.filter((trans) => lower.includes(trans));
      const score = Math.min(matches.length / 4, 1); // 4+ transitions = max score
      return {
        score,
        reason:
          matches.length > 0
            ? `Found ${matches.length} formal transitions`
            : 'Normal transition usage',
      };
    },
  },
  {
    name: 'em_dashes',
    weight: 0.1,
    detect: (text: string) => {
      const emDashCount = (text.match(/—/g) || []).length;
      const sentenceCount = text.split(/[.!?]+/).length;
      const ratio = sentenceCount > 0 ? emDashCount / sentenceCount : 0;
      const score = Math.min(ratio / 0.5, 1); // 0.5+ ratio = max score
      return {
        score,
        reason: emDashCount > 2 ? `High em dash usage (${emDashCount})` : 'Normal punctuation',
      };
    },
  },
  {
    name: 'uniformity',
    weight: 0.15,
    detect: (text: string) => {
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      if (sentences.length < 3) {
        return { score: 0, reason: 'Too few sentences to analyze' };
      }

      const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance =
        lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);

      // Low variance indicates uniform sentence lengths (typical of AI)
      const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
      const score = coefficientOfVariation < 0.3 ? 0.8 : coefficientOfVariation < 0.5 ? 0.4 : 0;

      return {
        score,
        reason:
          score > 0.5 ? 'Very uniform sentence lengths' : 'Natural sentence length variation',
      };
    },
  },
  {
    name: 'formal_structure',
    weight: 0.1,
    detect: (text: string) => {
      const paragraphs = text.split(/\n\n+/);
      let threeSenatenceParagraphs = 0;

      for (const para of paragraphs) {
        const sentences = para.split(/[.!?]+/).filter((s) => s.trim().length > 0);
        if (sentences.length === 3) {
          threeSenatenceParagraphs++;
        }
      }

      const score =
        paragraphs.length > 0 ? Math.min(threeSenatenceParagraphs / paragraphs.length, 1) : 0;
      return {
        score,
        reason:
          score > 0.5
            ? 'Many paragraphs follow 3-sentence pattern'
            : 'Natural paragraph structure',
      };
    },
  },
  {
    name: 'lack_of_informality',
    weight: 0.1,
    detect: (text: string) => {
      const contractions = ["n't", "'ll", "'re", "'ve", "'m", "'d", "'s"];
      const hasContractions = contractions.some((c) => text.includes(c));
      const hasSlang = /\b(lol|omg|ngl|tbh|imo|btw|gonna|wanna|yeah)\b/i.test(text);
      // Check for emoji using surrogate pair range
      const hasEmoji = /[\uD800-\uDFFF]/.test(text);

      const informalityCount = [hasContractions, hasSlang, hasEmoji].filter(Boolean).length;
      const score = informalityCount === 0 ? 0.8 : informalityCount === 1 ? 0.4 : 0;

      return {
        score,
        reason:
          score > 0.5 ? 'Very formal, lacks casual language markers' : 'Natural informality level',
      };
    },
  },
  {
    name: 'curly_quotes',
    weight: 0.1,
    detect: (text: string) => {
      const curlyQuotes = (text.match(/[""'']/g) || []).length;
      const straightQuotes = (text.match(/["']/g) || []).length;

      if (curlyQuotes === 0) {
        return { score: 0, reason: 'No curly quotes detected' };
      }

      const score = straightQuotes === 0 && curlyQuotes > 0 ? 0.7 : 0;
      return {
        score,
        reason:
          score > 0.5 ? 'Exclusively uses curly quotes (AI typical)' : 'Normal quote usage',
      };
    },
  },
  {
    name: 'formal_opening',
    weight: 0.05,
    detect: (text: string) => {
      const lower = text.toLowerCase();
      const hasOpening = FORMAL_OPENINGS.some((opening) => lower.startsWith(opening));
      const score = hasOpening ? 1 : 0;
      return {
        score,
        reason: hasOpening ? 'Starts with formal AI-typical phrase' : 'Natural opening',
      };
    },
  },
];

/**
 * Analyze text for AI-generated patterns
 *
 * @param text - Text to analyze
 * @param threshold - Confidence threshold for flagging (default 0.7)
 * @returns Detection result with confidence score and signal breakdown
 */
export function analyzeText(text: string, threshold: number = 0.7): DetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      isAiGenerated: false,
      confidence: 0,
      signals: [],
    };
  }

  // Run all detection signals
  const signals: DetectionSignal[] = INTERNAL_SIGNALS.map((signal) => {
    const result = signal.detect(text);
    return {
      name: signal.name,
      confidence: result.score, // Raw score for this signal
      weight: signal.weight,
    };
  });

  // Calculate overall confidence as sum of weighted scores
  const confidence = signals.reduce((sum, signal) => sum + signal.confidence * signal.weight, 0);

  // Conservative approach: require 3+ signals above 0.3 raw score for high confidence
  const activeSignals = signals.filter((s) => s.confidence > 0.3).length;
  const adjustedConfidence = activeSignals >= 3 ? confidence : confidence * 0.7;

  return {
    isAiGenerated: adjustedConfidence >= threshold,
    confidence: Math.min(adjustedConfidence, 1),
    signals,
  };
}

/**
 * Export detection signals for reference (without detect functions)
 */
export const DETECTION_SIGNALS: DetectionSignal[] = INTERNAL_SIGNALS.map((s) => ({
  name: s.name,
  weight: s.weight,
  confidence: 0, // Placeholder, actual confidence computed during analysis
}));

