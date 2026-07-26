/**
 * Post filter engine for applying filter rules to X.com posts
 *
 * Uses MutationObserver to detect new posts and applies filtering rules
 * based on user settings (views/min, replies, age, keywords).
 */

import type { FilterSettings, PostMetrics } from '../../types/filters';
import { parsePostMetrics, calculateViewsPerMinute } from './post-parser';

/** Filter reason types for stats tracking */
type FilterReasonType = 'viewsPerMinute' | 'replies' | 'age' | 'keyword';

/** Result of filter evaluation */
interface FilterResult {
  shouldHide: boolean;
  reason?: string;
  reasonType?: FilterReasonType;
}

/** CSS class/attribute names used for filtering */
const FILTER_ATTRS = {
  PROCESSED: 'data-pw-processed',
  FILTERED: 'data-pw-filtered',
  OVERLAY_ID: 'pw-filter-overlay',
} as const;

/** Original styles saved for restoration */
interface SavedStyles {
  display?: string;
  contentVisibility?: string;
  opacity?: string;
  pointerEvents?: string;
}

/** Filter statistics for tracking and UI display */
export interface FilterStats {
  totalProcessed: number;
  totalFiltered: number;
  byReason: {
    viewsPerMinute: number;
    replies: number;
    age: number;
    keyword: number;
  };
}

/**
 * PostFilterEngine - Core filtering logic for X.com posts
 *
 * Applies filter rules based on settings and handles DOM mutations
 * to filter new posts as they load during infinite scroll.
 */
export class PostFilterEngine {
  private settings: FilterSettings;
  private debounceTimer: number = 0;
  private observer: MutationObserver | null = null;
  private savedStyles: WeakMap<HTMLElement, SavedStyles> = new WeakMap();
  private stats: FilterStats = {
    totalProcessed: 0,
    totalFiltered: 0,
    byReason: { viewsPerMinute: 0, replies: 0, age: 0, keyword: 0 },
  };

  constructor(settings: FilterSettings) {
    this.settings = settings;
  }

  /**
   * Get current filter statistics
   * Returns a copy to prevent external mutation
   */
  getStats(): FilterStats {
    return {
      totalProcessed: this.stats.totalProcessed,
      totalFiltered: this.stats.totalFiltered,
      byReason: { ...this.stats.byReason },
    };
  }

  /**
   * Reset filter statistics
   */
  private resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      totalFiltered: 0,
      byReason: { viewsPerMinute: 0, replies: 0, age: 0, keyword: 0 },
    };
  }

  /**
   * Initialize the filter engine
   * Sets up MutationObserver and filters existing posts
   */
  initialize(): void {
    if (!this.settings.enabled) {
      console.log('[Postweaver] Filter engine not enabled, skipping initialization');
      return;
    }

    // Create MutationObserver to watch for new posts
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    // Start observing document.body for new posts
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Filter existing posts
    this.filterAllPosts();

    console.log('[Postweaver] Filter engine initialized');
  }

  /**
   * Cleanup the filter engine
   * Disconnects observer and removes all filter styling
   */
  cleanup(): void {
    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }

    // Remove all filter attributes and styles from posts
    const processedPosts = document.querySelectorAll(`[${FILTER_ATTRS.PROCESSED}]`);
    processedPosts.forEach((post) => {
      if (post instanceof HTMLElement) {
        this.removeFilterStyling(post);
        post.removeAttribute(FILTER_ATTRS.PROCESSED);
        post.removeAttribute(FILTER_ATTRS.FILTERED);
      }
    });

    console.log('[Postweaver] Filter engine cleaned up');
  }

  /**
   * Update settings and reapply filters
   */
  updateSettings(newSettings: FilterSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = newSettings;

    if (!wasEnabled && newSettings.enabled) {
      // Engine was disabled, now enabled - initialize
      this.initialize();
    } else if (wasEnabled && !newSettings.enabled) {
      // Engine was enabled, now disabled - cleanup
      this.cleanup();
    } else if (newSettings.enabled) {
      // Settings changed while enabled - reapply filters
      this.filterAllPosts();
    }
  }

  /**
   * Determine if a post should be filtered based on metrics and text
   */
  private shouldFilterPost(metrics: PostMetrics, postText: string): FilterResult {
    // Check views/minute filter
    if (this.settings.minViewsPerMinute !== null && metrics.timestamp) {
      const viewsPerMin = calculateViewsPerMinute(metrics.views, metrics.timestamp);
      if (viewsPerMin < this.settings.minViewsPerMinute) {
        return {
          shouldHide: true,
          reason: `Below ${this.settings.minViewsPerMinute} views/min threshold`,
          reasonType: 'viewsPerMinute',
        };
      }
    }

    // Check reply count filter
    if (this.settings.maxReplies !== null) {
      if (metrics.replies > this.settings.maxReplies) {
        return {
          shouldHide: true,
          reason: `Exceeds ${this.settings.maxReplies} replies`,
          reasonType: 'replies',
        };
      }
    }

    // Check age filter
    if (this.settings.maxAgeHours !== null && metrics.timestamp) {
      const ageHours = (Date.now() - metrics.timestamp.getTime()) / (1000 * 60 * 60);
      if (ageHours > this.settings.maxAgeHours) {
        return {
          shouldHide: true,
          reason: `Older than ${this.settings.maxAgeHours} hours`,
          reasonType: 'age',
        };
      }
    }

    // Check keyword filter
    if (this.settings.keywordMode !== 'off' && this.settings.keywords.length > 0) {
      const lowerText = postText.toLowerCase();
      const hasKeyword = this.settings.keywords.some((keyword) =>
        lowerText.includes(keyword.toLowerCase())
      );

      if (this.settings.keywordMode === 'allowlist') {
        // Allowlist: hide if text does NOT contain any keyword
        if (!hasKeyword) {
          return {
            shouldHide: true,
            reason: 'Keyword filter: allowlist',
            reasonType: 'keyword',
          };
        }
      } else if (this.settings.keywordMode === 'blocklist') {
        // Blocklist: hide if text DOES contain any keyword
        if (hasKeyword) {
          return {
            shouldHide: true,
            reason: 'Keyword filter: blocklist',
            reasonType: 'keyword',
          };
        }
      }
    }

    return { shouldHide: false };
  }

  /**
   * Apply filter styling to a post element
   */
  private applyFilter(postElement: HTMLElement, shouldHide: boolean, reason?: string): void {
    if (shouldHide) {
      // Save original styles for restoration
      if (!this.savedStyles.has(postElement)) {
        this.savedStyles.set(postElement, {
          display: postElement.style.display,
          contentVisibility: postElement.style.contentVisibility,
          opacity: postElement.style.opacity,
          pointerEvents: postElement.style.pointerEvents,
        });
      }

      // Mark as filtered
      postElement.setAttribute(FILTER_ATTRS.FILTERED, 'true');

      // Apply hiding method
      switch (this.settings.hideMethod) {
        case 'hide':
          // Use content-visibility with display: none fallback
          postElement.style.contentVisibility = 'hidden';
          postElement.style.display = 'none';
          break;

        case 'dim':
          postElement.style.opacity = '0.3';
          postElement.style.pointerEvents = 'none';
          break;

        case 'overlay':
          this.addOverlay(postElement, reason);
          break;
      }
    } else {
      this.removeFilterStyling(postElement);
    }
  }

  /**
   * Add a semi-transparent overlay to a post
   */
  private addOverlay(postElement: HTMLElement, reason?: string): void {
    // Remove existing overlay if any
    const existingOverlay = postElement.querySelector(`#${FILTER_ATTRS.OVERLAY_ID}`);
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create overlay element
    const overlay = document.createElement('div');
    overlay.id = FILTER_ATTRS.OVERLAY_ID;
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      pointer-events: none;
    `;

    // Add reason text if enabled
    if (this.settings.showFilterReason && reason) {
      const reasonText = document.createElement('span');
      reasonText.style.cssText = `
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        padding: 4px 8px;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 4px;
      `;
      reasonText.textContent = reason;
      overlay.appendChild(reasonText);
    }

    // Ensure post has relative positioning for overlay
    const currentPosition = window.getComputedStyle(postElement).position;
    if (currentPosition === 'static') {
      postElement.style.position = 'relative';
    }

    postElement.appendChild(overlay);
  }

  /**
   * Remove all filter styling from a post
   */
  private removeFilterStyling(postElement: HTMLElement): void {
    // Restore original styles
    const saved = this.savedStyles.get(postElement);
    if (saved) {
      postElement.style.display = saved.display || '';
      postElement.style.contentVisibility = saved.contentVisibility || '';
      postElement.style.opacity = saved.opacity || '';
      postElement.style.pointerEvents = saved.pointerEvents || '';
      this.savedStyles.delete(postElement);
    } else {
      // No saved styles - just clear filter-related styles
      postElement.style.display = '';
      postElement.style.contentVisibility = '';
      postElement.style.opacity = '';
      postElement.style.pointerEvents = '';
    }

    // Remove position: relative if we added it for overlay
    if (postElement.style.position === 'relative') {
      postElement.style.position = '';
    }

    // Remove overlay if present
    const overlay = postElement.querySelector(`#${FILTER_ATTRS.OVERLAY_ID}`);
    if (overlay) {
      overlay.remove();
    }

    // Remove filtered attribute
    postElement.removeAttribute(FILTER_ATTRS.FILTERED);
  }

  /**
   * Process a single post element
   */
  private filterPost(postElement: HTMLElement): void {
    // Mark as processed to avoid re-processing
    postElement.setAttribute(FILTER_ATTRS.PROCESSED, 'true');

    // Parse metrics from the post
    const metrics = parsePostMetrics(postElement);
    if (!metrics) {
      // Fail-safe: don't filter if we can't parse metrics
      return;
    }

    // Track processed post
    this.stats.totalProcessed++;

    // Get post text content for keyword filtering
    // Look for the actual tweet text content
    const tweetText = postElement.querySelector('[data-testid="tweetText"]');
    const postText = tweetText?.textContent || postElement.textContent || '';

    // Evaluate filter rules
    const result = this.shouldFilterPost(metrics, postText);

    // Track filtered post and reason
    if (result.shouldHide) {
      this.stats.totalFiltered++;
      if (result.reasonType) {
        this.stats.byReason[result.reasonType]++;
      }

      // Log stats periodically (every 10 posts filtered)
      if (this.stats.totalFiltered > 0 && this.stats.totalFiltered % 10 === 0) {
        console.log('[Postweaver] Filter stats:', this.getStats());
      }
    }

    // Apply filter styling
    this.applyFilter(postElement, result.shouldHide, result.reason);
  }

  /**
   * Filter only new (unprocessed) posts
   */
  private filterNewPosts(): void {
    const selector = `[data-testid="tweet"]:not([${FILTER_ATTRS.PROCESSED}])`;
    const newPosts = document.querySelectorAll(selector);

    newPosts.forEach((post) => {
      if (post instanceof HTMLElement) {
        this.filterPost(post);
      }
    });
  }

  /**
   * Filter all posts (resets processing state)
   * Public so it can be called on navigation changes
   */
  filterAllPosts(): void {
    // Reset stats to avoid double-counting on re-filter
    this.resetStats();

    const selector = '[data-testid="tweet"]';
    const allPosts = document.querySelectorAll(selector);

    allPosts.forEach((post) => {
      if (post instanceof HTMLElement) {
        // Remove processed flag to force re-evaluation
        post.removeAttribute(FILTER_ATTRS.PROCESSED);
        this.filterPost(post);
      }
    });

    // Log initial filter results
    if (this.stats.totalFiltered > 0) {
      console.log('[Postweaver] Initial filter results:', this.getStats());
    }
  }

  /**
   * Handle DOM mutations with debouncing
   */
  private handleMutations(_mutations: MutationRecord[]): void {
    // Clear any existing debounce timer
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer (300ms)
    this.debounceTimer = window.setTimeout(() => {
      this.filterNewPosts();
    }, 300);
  }
}
