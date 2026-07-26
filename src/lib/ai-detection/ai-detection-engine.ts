/**
 * AiDetectionEngine - Detects and badges AI-generated replies
 *
 * Uses MutationObserver + IntersectionObserver pattern from MetricsBadgeEngine.
 * Only processes replies to user's own posts (based on URL/profile context).
 */

import type { AiDetectionSettings } from '../../types/ai-detection';
import { analyzeText } from './heuristic-analyzer';
import { renderAiBadgeHTML } from './ai-badge-renderer';

/** CSS attributes for AI badges */
const AI_BADGE_ATTRS = {
  PROCESSED: 'data-pw-ai-processed',
  BADGE: 'data-pw-ai-badge',
} as const;

/** Badge CSS styles */
const AI_BADGE_STYLES = `
.pw-ai-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  transition: opacity 200ms ease-in-out;
}
.pw-ai-badge.updating { opacity: 0.5; }
.pw-ai-badge-hidden { display: none !important; }
`;

export class AiDetectionEngine {
  private settings: AiDetectionSettings;
  private intersectionObserver: IntersectionObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private badgeCache: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private scoreCache: WeakMap<HTMLElement, number> = new WeakMap();
  private observedPosts: Set<HTMLElement> = new Set();
  private debounceTimer: number = 0;
  private styleElement: HTMLStyleElement | null = null;
  private ownHandle: string | null = null;

  constructor(settings: AiDetectionSettings) {
    this.settings = settings;
  }

  /**
   * Initialize the AI detection engine
   */
  initialize(): void {
    if (!this.settings.enabled) {
      console.log('[Postweaver] AI detection engine not enabled, skipping initialization');
      return;
    }

    // Inject CSS styles
    this.injectStyles();

    // Try to detect logged-in user's handle from URL or DOM
    this.detectOwnHandle();

    // Create IntersectionObserver for efficient scroll-based detection
    this.intersectionObserver = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: 0.1, rootMargin: '50px' }
    );

    // Create MutationObserver for new posts
    this.mutationObserver = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Process existing posts
    this.processAllPosts();

    console.log('[Postweaver] AI detection engine initialized');
  }

  /**
   * Cleanup the engine
   */
  cleanup(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = 0;
    }

    // Remove badges
    const badges = document.querySelectorAll(`[${AI_BADGE_ATTRS.BADGE}]`);
    badges.forEach((b) => b.remove());

    // Remove processed attributes
    const processed = document.querySelectorAll(`[${AI_BADGE_ATTRS.PROCESSED}]`);
    processed.forEach((p) => p.removeAttribute(AI_BADGE_ATTRS.PROCESSED));

    // Remove styles
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    this.badgeCache = new WeakMap();
    this.scoreCache = new WeakMap();
    this.observedPosts.clear();

    console.log('[Postweaver] AI detection engine cleaned up');
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: AiDetectionSettings): void {
    const wasEnabled = this.settings.enabled;
    const oldThreshold = this.settings.threshold;
    const oldShowBadges = this.settings.showBadges;
    this.settings = newSettings;

    if (!wasEnabled && newSettings.enabled) {
      this.initialize();
    } else if (wasEnabled && !newSettings.enabled) {
      this.cleanup();
    } else if (newSettings.enabled) {
      // Threshold changed - re-evaluate all posts
      if (oldThreshold !== newSettings.threshold) {
        this.refreshAllBadges();
      }
      // ShowBadges changed
      if (oldShowBadges !== newSettings.showBadges) {
        this.updateBadgeVisibility();
      }
    }
  }

  /**
   * Process all posts on page
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

    console.log(`[Postweaver] Processed ${processed} posts for AI detection`);
  }

  /**
   * Process a single post
   */
  private processPost(postElement: HTMLElement): void {
    // Skip if already processed
    if (postElement.hasAttribute(AI_BADGE_ATTRS.PROCESSED)) {
      return;
    }

    // Mark as processed
    postElement.setAttribute(AI_BADGE_ATTRS.PROCESSED, 'true');

    // Check if this is a reply
    if (!this.isReply(postElement)) {
      return;
    }

    // Check if reply is to own post (based on context)
    if (!this.isReplyToOwnPost(postElement)) {
      return;
    }

    // Extract tweet text
    const text = this.extractTweetText(postElement);
    if (!text || text.length < 20) {
      return; // Skip very short replies
    }

    // Run detection
    const result = analyzeText(text, this.settings.threshold);
    this.scoreCache.set(postElement, result.confidence);

    // Create badge if above threshold
    if (result.isAiGenerated) {
      this.attachBadge(postElement, result.confidence);
    }

    // Observe for scroll updates
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(postElement);
    }

    this.observedPosts.add(postElement);
  }

  /**
   * Check if post is a reply
   */
  private isReply(postElement: HTMLElement): boolean {
    // Check for "Replying to" indicator
    const replyIndicator = postElement.querySelector('[data-testid="reply"]');
    if (replyIndicator) return true;

    // Alternative: check for "Replying to @" text
    const socialContext = postElement.querySelector('[data-testid="socialContext"]');
    if (socialContext?.textContent?.includes('Replying to')) return true;

    return false;
  }

  /**
   * Check if reply is to user's own post
   * Uses URL-based detection (if on user's profile/status page)
   */
  private isReplyToOwnPost(postElement: HTMLElement): boolean {
    // If we don't know the user's handle, can't determine
    if (!this.ownHandle) {
      // Fallback: check if URL contains user handle
      return this.isOwnProfilePage();
    }

    // Check "Replying to @handle" text
    const replyIndicator = postElement.querySelector('[data-testid="reply"]');
    if (replyIndicator) {
      const text = replyIndicator.textContent || '';
      const handleMatch = text.match(/@(\w+)/);
      if (handleMatch && handleMatch[1].toLowerCase() === this.ownHandle.toLowerCase()) {
        return true;
      }
    }

    // If on own profile page, assume replies are to user
    return this.isOwnProfilePage();
  }

  /**
   * Check if current page is user's own profile
   */
  private isOwnProfilePage(): boolean {
    if (!this.ownHandle) return false;

    const path = window.location.pathname.toLowerCase();
    const handlePath = `/${this.ownHandle.toLowerCase()}`;

    // Check if on user's profile page or a tweet detail page
    return path.startsWith(handlePath);
  }

  /**
   * Detect logged-in user's handle
   */
  private detectOwnHandle(): void {
    // Try to get from DOM - profile link in sidebar
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href) {
        const match = href.match(/^\/(\w+)$/);
        if (match) {
          this.ownHandle = match[1];
          console.log(`[Postweaver] Detected own handle: @${this.ownHandle}`);
          return;
        }
      }
    }

    // Try sessionStorage (may be set by data capture)
    const storedHandle = sessionStorage.getItem('postweaver_user_handle');
    if (storedHandle) {
      this.ownHandle = storedHandle;
      console.log(`[Postweaver] Loaded own handle from session: @${this.ownHandle}`);
      return;
    }

    // If still not found, we'll rely on URL-based detection
    console.warn('[Postweaver] Could not detect own handle, using URL-based detection only');
  }

  /**
   * Extract tweet text from post element
   */
  private extractTweetText(postElement: HTMLElement): string {
    const tweetText = postElement.querySelector('[data-testid="tweetText"]');
    return tweetText?.textContent || '';
  }

  /**
   * Attach AI badge to post
   */
  private attachBadge(postElement: HTMLElement, confidence: number): void {
    const existing = this.badgeCache.get(postElement);
    if (existing) {
      existing.innerHTML = renderAiBadgeHTML(confidence);
      return;
    }

    // Find username area for badge placement
    const userNameContainer = postElement.querySelector('[data-testid="User-Name"]');
    if (!userNameContainer) {
      console.warn('[Postweaver] Could not find User-Name container for AI badge placement');
      return;
    }

    const badge = document.createElement('span');
    badge.className = 'pw-ai-badge';
    badge.setAttribute(AI_BADGE_ATTRS.BADGE, 'true');
    badge.innerHTML = renderAiBadgeHTML(confidence);

    // Apply visibility setting
    if (!this.settings.showBadges) {
      badge.classList.add('pw-ai-badge-hidden');
    }

    userNameContainer.appendChild(badge);
    this.badgeCache.set(postElement, badge);
  }

  /**
   * Refresh all badges (when threshold changes)
   */
  private refreshAllBadges(): void {
    this.observedPosts.forEach((postElement) => {
      const text = this.extractTweetText(postElement);
      if (!text) return;

      const result = analyzeText(text, this.settings.threshold);
      this.scoreCache.set(postElement, result.confidence);

      const badge = this.badgeCache.get(postElement);

      if (result.isAiGenerated) {
        if (badge) {
          badge.innerHTML = renderAiBadgeHTML(result.confidence);
          badge.classList.remove('pw-ai-badge-hidden');
        } else {
          this.attachBadge(postElement, result.confidence);
        }
      } else {
        // Below threshold - hide badge
        if (badge) {
          badge.classList.add('pw-ai-badge-hidden');
        }
      }
    });
  }

  /**
   * Update badge visibility
   */
  private updateBadgeVisibility(): void {
    this.observedPosts.forEach((postElement) => {
      const badge = this.badgeCache.get(postElement);
      if (badge) {
        badge.classList.toggle('pw-ai-badge-hidden', !this.settings.showBadges);
      }
    });
  }

  /**
   * Handle DOM mutations with debouncing
   */
  private handleMutations(_mutations: MutationRecord[]): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.processNewPosts();
    }, 300);
  }

  /**
   * Process only new posts
   */
  private processNewPosts(): void {
    const selector = `[data-testid="tweet"]:not([${AI_BADGE_ATTRS.PROCESSED}])`;
    const newPosts = document.querySelectorAll(selector);

    newPosts.forEach((post) => {
      if (post instanceof HTMLElement) {
        this.processPost(post);
      }
    });
  }

  /**
   * Handle intersection events
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.target instanceof HTMLElement) {
        // Could refresh detection on scroll, but typically not needed
        // Just ensure badge is visible
        const badge = this.badgeCache.get(entry.target);
        if (badge) {
          badge.classList.toggle('pw-ai-badge-hidden', !this.settings.showBadges);
        }
      }
    });
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = AI_BADGE_STYLES;
    document.head.appendChild(this.styleElement);
  }
}
