import type { FilterSettings } from './filters';

/**
 * Extension settings interface
 * Defines all configurable options for Postweaver
 */
export interface ExtensionSettings {
  /** Master toggle - false by default (opt-in activation) */
  enabled: boolean;

  /** Theme preference: follows system, light, or dark */
  theme: 'light' | 'dark' | 'auto';

  // Feature toggles (for future phases, disabled initially)
  features: {
    /** Rich text formatting toolbar */
    textFormatting: boolean;
    /** Feed filtering and sorting options */
    feedFiltering: boolean;
    /** Engagement metrics display */
    engagementMetrics: boolean;
    /** Data capture and export features */
    dataCapture: boolean;
    /** AI reply detection on user's posts */
    aiDetection: boolean;
    /** Tweet composer with character count and templates */
    composer: boolean;
  };

  // Metadata
  /** Extension version for migration purposes */
  version: string;

  /** Timestamp of last settings update (for highlighting new settings) */
  lastUpdated: number;

  /** Filter settings (optional - stored separately but linked for type completeness) */
  filterSettings?: FilterSettings;
}
