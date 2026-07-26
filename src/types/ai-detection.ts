/**
 * AI detection types for Postweaver heuristic analysis
 * Identifies AI-generated replies using pattern matching
 */

/**
 * Individual detection signal with name and confidence
 */
export interface DetectionSignal {
  /** Signal identifier (e.g., "ai_phrases", "transitions") */
  name: string;
  /** Confidence score 0-1 for this specific signal */
  confidence: number;
  /** Weight of this signal in final score calculation */
  weight: number;
}

/**
 * Result of AI detection analysis
 */
export interface DetectionResult {
  /** Final confidence score 0-1 (weighted combination of signals) */
  confidence: number;
  /** Individual signals that contributed to the score */
  signals: DetectionSignal[];
  /** True if confidence exceeds threshold */
  isAiGenerated: boolean;
}

/**
 * AI detection settings configuration
 */
export interface AiDetectionSettings {
  /** Master toggle for AI detection feature */
  enabled: boolean;

  /** Confidence threshold 0-1 for classifying as AI (default: 0.7) */
  threshold: number;

  /** Visibility toggle for AI badges on detected replies */
  showBadges: boolean;
}

/**
 * Default AI detection settings
 * - enabled: false (opt-in per project convention)
 * - threshold: 0.7 (conservative - requires 3+ strong signals)
 * - showBadges: true (visible when enabled)
 */
export const DEFAULT_AI_DETECTION_SETTINGS: AiDetectionSettings = {
  enabled: false,
  threshold: 0.7,
  showBadges: true,
};
