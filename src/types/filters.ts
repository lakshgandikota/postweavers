/**
 * Filter settings types for Postweaver feed filtering
 * Controls how posts are filtered based on engagement metrics and keywords
 */

/** How keywords are used for filtering */
export type KeywordMode = 'allowlist' | 'blocklist' | 'off';

/** How filtered posts are displayed */
export type HideMethod = 'hide' | 'dim' | 'overlay';

/**
 * Filter settings configuration
 * All numeric thresholds use null to indicate "disabled"
 */
export interface FilterSettings {
  /** Master toggle for all filtering */
  enabled: boolean;

  /** Minimum views/minute threshold - posts below this are filtered (null = disabled) */
  minViewsPerMinute: number | null;

  /** Maximum replies threshold - posts above this are filtered (null = disabled) */
  maxReplies: number | null;

  /** Maximum age in hours - posts older than this are filtered (null = disabled) */
  maxAgeHours: number | null;

  /** Keywords for filtering */
  keywords: string[];

  /** How keywords are used: allowlist (show only), blocklist (hide), or off */
  keywordMode: KeywordMode;

  /** How filtered posts are displayed */
  hideMethod: HideMethod;

  /** Whether to show the reason a post was filtered */
  showFilterReason: boolean;
}

/**
 * Engagement metrics extracted from a post DOM element
 */
export interface PostMetrics {
  /** View count */
  views: number;

  /** Reply count */
  replies: number;

  /** Like count */
  likes: number;

  /** Retweet/repost count */
  retweets: number;

  /** Post timestamp (null if not parseable) */
  timestamp: Date | null;
}

/**
 * Default filter settings
 * - enabled: false (opt-in per existing pattern)
 * - All thresholds: null (disabled)
 * - hideMethod: 'hide' (cleanest default)
 */
export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  enabled: false,
  minViewsPerMinute: null,
  maxReplies: null,
  maxAgeHours: null,
  keywords: [],
  keywordMode: 'off',
  hideMethod: 'hide',
  showFilterReason: false,
};
