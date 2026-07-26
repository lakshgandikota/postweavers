/**
 * Logged-in user ID management
 *
 * The logged-in user ID is extracted from GraphQL responses and cached.
 * This is used to distinguish between own tweets and others' tweets.
 */

let cachedUserId: string | null = null;

/**
 * Set the logged-in user ID (called when extracted from API response)
 */
export function setLoggedInUserId(userId: string | null): void {
  if (userId && userId !== cachedUserId) {
    cachedUserId = userId;
    console.log('[Postweaver] Logged-in user ID set:', userId);

    // Also persist to session storage for cross-context access
    try {
      sessionStorage.setItem('postweaver_user_id', userId);
    } catch {
      // sessionStorage may not be available in all contexts
    }
  }
}

/**
 * Get the cached logged-in user ID
 */
export function getLoggedInUserId(): string | null {
  if (cachedUserId) return cachedUserId;

  // Try to recover from session storage
  try {
    const stored = sessionStorage.getItem('postweaver_user_id');
    if (stored) {
      cachedUserId = stored;
      return stored;
    }
  } catch {
    // sessionStorage may not be available
  }

  return null;
}

/**
 * Check if a given user ID is the logged-in user
 */
export function isOwnUserId(userId: string): boolean {
  const loggedInId = getLoggedInUserId();
  return loggedInId !== null && loggedInId === userId;
}

/**
 * Clear cached user ID (for testing/cleanup)
 */
export function clearLoggedInUserId(): void {
  cachedUserId = null;
  try {
    sessionStorage.removeItem('postweaver_user_id');
  } catch {
    // Ignore
  }
}

/**
 * Extract logged-in user ID from DOM if not already set
 * Fallback method when API response doesn't include user context
 *
 * Note: This tries to find user ID from the page DOM which is less reliable
 * than extracting from API responses. Prefer using setLoggedInUserId with
 * API-extracted values.
 */
export function extractLoggedInUserIdFromDOM(): string | null {
  // Return cached if available
  if (cachedUserId) return cachedUserId;

  try {
    // Try to find user ID from various DOM sources
    // Pattern 1: Look for data-user-id attributes
    const userElement = document.querySelector('[data-user-id]');
    if (userElement) {
      const userId = userElement.getAttribute('data-user-id');
      if (userId) {
        setLoggedInUserId(userId);
        return userId;
      }
    }

    // Pattern 2: Look for user screen name in URL and profile link
    // The logged-in user's profile link often appears in navigation
    const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      // href is like "/username" - we can use this to identify but need ID from elsewhere
      console.log('[Postweaver] Found profile link:', href);
    }

    return null;
  } catch {
    return null;
  }
}
