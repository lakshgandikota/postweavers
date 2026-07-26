/**
 * Badge settings types for Postweaver engagement metrics display
 * Controls how engagement badges are shown on X.com posts
 */

/**
 * Configurable boundaries for traffic light tiers
 * Values represent views/minute thresholds
 */
export interface TierThresholds {
  /** Below this is "low" tier (red) - default 10 */
  low: number;
  /** Below this is "medium" tier (yellow), above is "high" (green) - default 50 */
  medium: number;
}

/**
 * Badge tier classification
 * - low: red tier (below low threshold)
 * - medium: yellow tier (between low and medium threshold)
 * - high: green tier (above medium threshold)
 * - unknown: gray tier (null/missing data)
 */
export type BadgeTier = 'low' | 'medium' | 'high' | 'unknown';

/**
 * Badge settings configuration
 */
export interface BadgeSettings {
  /** Master toggle for badge feature */
  enabled: boolean;

  /** Visibility toggle (separate from enabled for quick show/hide) */
  showBadges: boolean;

  /** User-configurable tier boundaries */
  thresholds: TierThresholds;
}

/**
 * Default badge settings
 * - enabled: false (opt-in per project convention)
 * - showBadges: true (visible when enabled)
 * - thresholds: { low: 10, medium: 50 }
 */
export const DEFAULT_BADGE_SETTINGS: BadgeSettings = {
  enabled: false,
  showBadges: true,
  thresholds: {
    low: 10,
    medium: 50,
  },
};
