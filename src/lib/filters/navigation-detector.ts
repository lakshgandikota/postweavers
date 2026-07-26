/**
 * SPA navigation detector for X.com
 *
 * X.com is a Single Page Application that uses the History API for navigation.
 * This detector intercepts pushState/replaceState and listens for popstate
 * events to detect when the user navigates between pages.
 *
 * This allows the filter engine to re-apply filters when navigating
 * between Home, Lists, Communities, and other pages.
 */

/**
 * NavigationDetector - Detects SPA navigation changes
 *
 * Wraps History API methods and listens for popstate events to
 * call a callback whenever navigation occurs.
 */
export class NavigationDetector {
  private onNavigate: () => void;
  private originalPushState: typeof history.pushState;
  private originalReplaceState: typeof history.replaceState;
  private popstateHandler: () => void;
  private initialized: boolean = false;

  constructor(onNavigate: () => void) {
    this.onNavigate = onNavigate;
    // Store original History API methods
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);
    // Create bound handler for popstate
    this.popstateHandler = () => this.onNavigate();
  }

  /**
   * Initialize navigation detection
   * Wraps History API and adds event listeners
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[Postweaver] Navigation detector already initialized');
      return;
    }

    // Wrap history.pushState
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPushState(...args);
      this.onNavigate();
    };

    // Wrap history.replaceState
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplaceState(...args);
      this.onNavigate();
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', this.popstateHandler);

    this.initialized = true;
    console.log('[Postweaver] Navigation detector initialized');
  }

  /**
   * Cleanup navigation detection
   * Restores original History API methods and removes event listeners
   */
  cleanup(): void {
    if (!this.initialized) {
      return;
    }

    // Restore original History API methods
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;

    // Remove popstate event listener
    window.removeEventListener('popstate', this.popstateHandler);

    this.initialized = false;
    console.log('[Postweaver] Navigation detector cleaned up');
  }

  /**
   * Check if the current page should have filtering applied
   *
   * Per CONTEXT.md: "Filters work on Home, Lists, Communities pages"
   *
   * Filterable pages:
   * - / (root, redirects to /home)
   * - /home (Home timeline)
   * - /i/lists/* (Lists)
   * - /*/communities/* (Communities)
   *
   * Non-filterable pages:
   * - /compose/* (Compose tweet)
   * - /messages/* (DMs)
   * - /settings/* (Settings)
   * - /:username (Profile pages - debatable, excluded for now)
   * - /:username/status/* (Individual tweet view)
   *
   * @returns true if current page should have filtering
   */
  static isFilterablePage(): boolean {
    const pathname = window.location.pathname;

    // Root path (redirects to /home)
    if (pathname === '/') {
      return true;
    }

    // Home timeline
    if (pathname === '/home') {
      return true;
    }

    // Lists (/i/lists/*)
    if (pathname.startsWith('/i/lists')) {
      return true;
    }

    // Communities (/*/communities/*)
    // Pattern: /:anything/communities or /:anything/communities/*
    if (/\/[^/]+\/communities(\/|$)/.test(pathname)) {
      return true;
    }

    // Search results (optional - can be noisy but useful)
    if (pathname === '/search' || pathname.startsWith('/search?')) {
      return true;
    }

    // "For You" and "Following" tabs are part of /home
    // Explore page
    if (pathname === '/explore') {
      return true;
    }

    // All other pages are not filterable
    return false;
  }
}
