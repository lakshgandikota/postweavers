/**
 * MetricsBadgeEngine - Core engine for displaying engagement badges on X.com posts
 *
 * Uses IntersectionObserver for efficient scroll-based recalculation and
 * MutationObserver for detecting new posts during infinite scroll.
 *
 * Pattern follows PostFilterEngine from Phase 3.
 */

import type { BadgeSettings } from '../../types/metrics';
import { parsePostMetrics, calculateViewsPerMinute } from '../filters/post-parser';
import { renderBadgeHTML } from './badge-renderer';

/** CSS class/attribute names used for badges */
const BADGE_ATTRS = {
  PROCESSED: 'data-pw-badge-processed',
  BADGE: 'data-pw-badge',
} as const;

/** Badge CSS styles to inject */
const BADGE_STYLES = `
.pw-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  margin-left: 12px;
  transition: opacity 200ms ease-in-out;
}
.pw-badge.updating { opacity: 0.5; }
.pw-badge-hidden { display: none !important; }
`;

/**
 * MetricsBadgeEngine - Manages engagement badges on X.com posts
 *
 * Features:
 * - IntersectionObserver for efficient scroll-based updates
 * - MutationObserver for detecting new posts
 * - WeakMap caches to prevent memory leaks
 * - Settings-driven tier thresholds
 */
export class MetricsBadgeEngine {
  private settings: BadgeSettings;
  private intersectionObserver: IntersectionObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private badgeCache: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private metricsCache: WeakMap<HTMLElement, number | null> = new WeakMap();
  private observedPosts: Set<HTMLElement> = new Set();
  private debounceTimer: number = 0;
  private styleElement: HTMLStyleElement | null = null;

  constructor(settings: BadgeSettings) {
    this.settings = settings;
  }

  /**
   * Initialize the badge engine
   * Sets up observers, injects styles, and processes existing posts
   */
  initialize(): void {
    if (!this.settings.enabled) {
      console.log('[Postweaver] Badge engine not enabled, skipping initialization');
      return;
    }

    // Inject CSS styles
    this.injectStyles();

    // Create IntersectionObserver for efficient scroll-based updates
    this.intersectionObserver = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        threshold: 0.1, // Trigger at 10% visibility
        rootMargin: '50px', // Start early
      }
    );

    // Create MutationObserver for detecting new posts
    this.mutationObserver = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    // Start observing document.body for new posts
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Process existing posts
    this.processAllPosts();

    console.log('[Postweaver] Badge engine initialized');
  }

  /**
   * Cleanup the badge engine
   * Disconnects observers, removes badges and styles
   */
  cleanup(): void {
    // Disconnect observers
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }

    // Remove all badges from DOM
    const badges = document.querySelectorAll(`[${BADGE_ATTRS.BADGE}]`);
    badges.forEach((badge) => badge.remove());

    // Remove processed attributes
    const processedPosts = document.querySelectorAll(`[${BADGE_ATTRS.PROCESSED}]`);
    processedPosts.forEach((post) => {
      post.removeAttribute(BADGE_ATTRS.PROCESSED);
    });

    // Remove injected style element
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    // Clear caches and sets
    this.badgeCache = new WeakMap();
    this.metricsCache = new WeakMap();
    this.observedPosts.clear();

    console.log('[Postweaver] Badge engine cleaned up');
  }

  /**
   * Update settings and handle enable/disable transitions
   */
  updateSettings(newSettings: BadgeSettings): void {
    const wasEnabled = this.settings.enabled;
    const oldThresholds = this.settings.thresholds;
    const oldShowBadges = this.settings.showBadges;
    this.settings = newSettings;

    if (!wasEnabled && newSettings.enabled) {
      // Engine was disabled, now enabled - initialize
      this.initialize();
    } else if (wasEnabled && !newSettings.enabled) {
      // Engine was enabled, now disabled - cleanup
      this.cleanup();
    } else if (newSettings.enabled) {
      // Settings changed while enabled

      // If thresholds changed, refresh all badges
      if (
        oldThresholds.low !== newSettings.thresholds.low ||
        oldThresholds.medium !== newSettings.thresholds.medium
      ) {
        this.refreshAllBadges();
      }

      // If showBadges changed, update visibility
      if (oldShowBadges !== newSettings.showBadges) {
        this.updateBadgeVisibility();
      }
    }
  }

  /**
   * Process all posts on the page (public for navigation callback)
   */
  processAllPosts(): void {
    const posts = document.querySelectorAll('[data-testid="tweet"]');
    let processed = 0;

    posts.forEach((post) => {
      if (post instanceof HTMLElement) {
        this.processPost(post);
        processed++;
      }
    });

    console.log(`[Postweaver] Processed ${processed} posts for badges`);
  }

  /**
   * Process a single post element
   */
  private processPost(postElement: HTMLElement): void {
    // Skip if already processed
    if (postElement.hasAttribute(BADGE_ATTRS.PROCESSED)) {
      return;
    }

    // Mark as processed
    postElement.setAttribute(BADGE_ATTRS.PROCESSED, 'true');

    // Get or create badge element
    const badge = this.getOrCreateBadge(postElement);
    if (!badge) {
      return;
    }

    // Calculate views/min
    const viewsPerMin = this.calculatePostViewsPerMin(postElement);
    this.metricsCache.set(postElement, viewsPerMin);

    // Update badge display
    this.updateBadge(postElement);

    // Observe with IntersectionObserver for scroll updates
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(postElement);
    }

    // Track for cleanup
    this.observedPosts.add(postElement);
  }

  /**
   * Get or create a badge element for a post
   */
  private getOrCreateBadge(postElement: HTMLElement): HTMLElement | null {
    // Check cache first
    const cached = this.badgeCache.get(postElement);
    if (cached) {
      return cached;
    }

    // Find metrics row in post (the action bar with reply/retweet/like/etc)
    const metricsRow = postElement.querySelector('[role="group"]');
    if (!metricsRow) {
      return null;
    }

    // Create badge container
    const badge = document.createElement('div');
    badge.className = 'pw-badge';
    badge.setAttribute(BADGE_ATTRS.BADGE, 'true');

    // Insert badge at end of metrics row
    metricsRow.appendChild(badge);

    // Cache for future access
    this.badgeCache.set(postElement, badge);

    return badge;
  }

  /**
   * Update badge content and visibility
   */
  private updateBadge(postElement: HTMLElement): void {
    const badge = this.badgeCache.get(postElement);
    if (!badge) {
      return;
    }

    // Add updating class for animation
    badge.classList.add('updating');

    // Recalculate views/min (post may have new timestamp from DOM updates)
    const viewsPerMin = this.calculatePostViewsPerMin(postElement);
    this.metricsCache.set(postElement, viewsPerMin);

    // Render badge content using renderBadgeHTML
    badge.innerHTML = renderBadgeHTML(viewsPerMin, this.settings.thresholds);

    // Apply visibility setting
    badge.classList.toggle('pw-badge-hidden', !this.settings.showBadges);

    // Remove updating class after brief delay
    window.setTimeout(() => {
      badge.classList.remove('updating');
    }, 100);
  }

  /**
   * Calculate views per minute for a post
   */
  private calculatePostViewsPerMin(postElement: HTMLElement): number | null {
    const metrics = parsePostMetrics(postElement);
    if (!metrics || !metrics.timestamp) {
      return null;
    }

    const viewsPerMin = calculateViewsPerMinute(metrics.views, metrics.timestamp);
    return viewsPerMin > 0 ? viewsPerMin : null;
  }

  /**
   * Refresh all badges with current settings
   */
  private refreshAllBadges(): void {
    this.observedPosts.forEach((postElement) => {
      this.updateBadge(postElement);
    });
  }

  /**
   * Update visibility on all badges
   */
  private updateBadgeVisibility(): void {
    this.observedPosts.forEach((postElement) => {
      const badge = this.badgeCache.get(postElement);
      if (badge) {
        badge.classList.toggle('pw-badge-hidden', !this.settings.showBadges);
      }
    });
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
      this.processNewPosts();
    }, 300);
  }

  /**
   * Process only new (unprocessed) posts
   */
  private processNewPosts(): void {
    const selector = `[data-testid="tweet"]:not([${BADGE_ATTRS.PROCESSED}])`;
    const newPosts = document.querySelectorAll(selector);

    newPosts.forEach((post) => {
      if (post instanceof HTMLElement) {
        this.processPost(post);
      }
    });
  }

  /**
   * Handle intersection observer entries
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.target instanceof HTMLElement) {
        // Update badge when post becomes visible
        this.updateBadge(entry.target);
      }
    });
  }

  /**
   * Inject badge CSS styles into document head
   */
  private injectStyles(): void {
    if (this.styleElement) {
      return; // Already injected
    }

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = BADGE_STYLES;
    document.head.appendChild(this.styleElement);
  }
}
