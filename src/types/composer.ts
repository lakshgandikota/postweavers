/**
 * Composer types for tweet composition features
 */

/**
 * Composer settings for user preferences
 */
export interface ComposerSettings {
  /** Whether composer features are enabled (compose detection for AI Reply) */
  enabled: boolean;
  /** Auto-switch to Composer tab when compose is focused */
  autoSwitchToComposer: boolean;
}

/**
 * Default composer settings
 */
export const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  enabled: true,
  autoSwitchToComposer: true,
};

/**
 * Character count analysis result
 * Uses Twitter's weighted algorithm
 */
export interface CharCountResult {
  /** Weighted character count */
  count: number;
  /** Characters remaining (280 - count) */
  remaining: number;
  /** Whether tweet is valid (count <= 280) */
  valid: boolean;
  /** Color indicator based on threshold */
  color: 'green' | 'yellow' | 'red';
}

/**
 * Compose context type
 * Identifies where the user is composing
 */
export interface ComposeContext {
  /** Type of composition */
  type: 'new_tweet' | 'reply' | 'quote';
}
