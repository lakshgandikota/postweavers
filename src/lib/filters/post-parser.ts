/**
 * Post parser for extracting engagement metrics from X.com DOM elements
 *
 * WARNING: X.com may change their DOM structure at any time. These selectors
 * are based on research from 2026-01-22 and use data-testid attributes which
 * are relatively stable but not guaranteed.
 *
 * Key selectors used:
 * - [data-testid="tweet"] - Tweet container
 * - [data-testid="reply"] - Reply button (aria-label contains count)
 * - [data-testid="retweet"] - Retweet button (aria-label contains count)
 * - [data-testid="like"] - Like button (aria-label contains count)
 * - time[datetime] - Timestamp element
 * - Views are trickier and may require analytics API text parsing
 */

import type { PostMetrics } from '../../types/filters';

/**
 * Parse engagement numbers with K/M/B suffixes
 * Examples: "1.2K" -> 1200, "5M" -> 5000000, "123" -> 123
 *
 * @param text - Raw text that may contain a number with suffix
 * @returns Parsed number, or 0 if parsing fails (fail-safe)
 */
export function parseEngagementNumber(text: string): number {
  if (!text) return 0;

  // Clean the text - remove commas and extra whitespace
  const cleaned = text.replace(/,/g, '').trim();

  // Match number patterns: 1.2K, 5M, 123, etc.
  const match = cleaned.match(/([\d.]+)\s*([KMBkmb])?/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;

  const suffix = match[2]?.toUpperCase();
  switch (suffix) {
    case 'K':
      return Math.floor(num * 1_000);
    case 'M':
      return Math.floor(num * 1_000_000);
    case 'B':
      return Math.floor(num * 1_000_000_000);
    default:
      return Math.floor(num);
  }
}

/**
 * Extract a metric value from an element's aria-label
 * X.com buttons use aria-label like "123 Replies" or "1.2K Likes"
 *
 * @param element - Element with aria-label containing the metric
 * @returns Parsed number or 0
 */
function parseMetricFromAriaLabel(element: Element | null): number {
  if (!element) return 0;

  const ariaLabel = element.getAttribute('aria-label') || '';
  // Extract the number part from labels like "123 Replies" or "1.2K Likes"
  return parseEngagementNumber(ariaLabel);
}

/**
 * Extract a metric from a button element by data-testid
 *
 * @param postElement - The tweet container element
 * @param testId - The data-testid value (e.g., "reply", "like", "retweet")
 * @returns Parsed number or 0
 */
function parseMetricByTestId(postElement: HTMLElement, testId: string): number {
  // First try to find the button with data-testid
  const button = postElement.querySelector(`[data-testid="${testId}"]`);
  if (!button) return 0;

  // Try aria-label first (most reliable)
  const ariaValue = parseMetricFromAriaLabel(button);
  if (ariaValue > 0) return ariaValue;

  // Fallback: look for text content in descendant spans
  const textSpan = button.querySelector('[data-testid="app-text-transition-container"]');
  if (textSpan?.textContent) {
    return parseEngagementNumber(textSpan.textContent);
  }

  // Last resort: button's own text content
  if (button.textContent) {
    return parseEngagementNumber(button.textContent);
  }

  return 0;
}

/**
 * Parse view count from a tweet element
 * Views are displayed differently - usually in analytics text or a separate container
 *
 * @param postElement - The tweet container element
 * @returns View count or 0
 */
function parseViews(postElement: HTMLElement): number {
  // Try to find analytics link/container that shows views
  // X.com uses various patterns - try multiple approaches

  // Pattern 1: Look for analytics link with "Views" or "views" text
  const allLinks = postElement.querySelectorAll('a[href*="/analytics"]');
  for (const link of allLinks) {
    const text = link.textContent || '';
    if (text.toLowerCase().includes('view')) {
      return parseEngagementNumber(text);
    }
  }

  // Pattern 2: Look for aria-label containing "views"
  const elementsWithViews = postElement.querySelectorAll('[aria-label*="view" i]');
  for (const el of elementsWithViews) {
    const ariaLabel = el.getAttribute('aria-label') || '';
    const match = ariaLabel.match(/([\d.]+[KMBkmb]?)\s*views?/i);
    if (match) {
      return parseEngagementNumber(match[1]);
    }
  }

  // Pattern 3: Look for text containers that might have view counts
  const textContainers = postElement.querySelectorAll('[data-testid="app-text-transition-container"]');
  for (const container of textContainers) {
    // Check if parent or sibling has "views" indicator
    const parent = container.parentElement;
    if (parent?.textContent?.toLowerCase().includes('view')) {
      return parseEngagementNumber(container.textContent || '');
    }
  }

  return 0;
}

/**
 * Parse timestamp from a tweet element
 *
 * @param postElement - The tweet container element
 * @returns Date object or null if not found
 */
function parseTimestamp(postElement: HTMLElement): Date | null {
  const timeElement = postElement.querySelector('time[datetime]');
  if (!timeElement) return null;

  const datetime = timeElement.getAttribute('datetime');
  if (!datetime) return null;

  try {
    const date = new Date(datetime);
    // Validate the date is reasonable (not NaN, not in the future by more than a minute)
    if (isNaN(date.getTime())) return null;
    if (date.getTime() > Date.now() + 60000) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Parse all engagement metrics from a tweet DOM element
 *
 * This function extracts views, replies, likes, retweets, and timestamp
 * from an X.com tweet element. It uses data-testid selectors which are
 * relatively stable but may change when X.com updates their UI.
 *
 * @param postElement - The tweet container element (should have data-testid="tweet")
 * @returns PostMetrics object or null if element isn't a valid tweet
 */
export function parsePostMetrics(postElement: HTMLElement): PostMetrics | null {
  // Validate this is actually a tweet element
  if (!postElement || postElement.getAttribute('data-testid') !== 'tweet') {
    // It might be a container that contains a tweet - try to find it
    const actualTweet = postElement.querySelector('[data-testid="tweet"]');
    if (actualTweet instanceof HTMLElement) {
      return parsePostMetrics(actualTweet);
    }

    console.log('[Postweaver] Element is not a valid tweet container');
    return null;
  }

  try {
    const metrics: PostMetrics = {
      views: parseViews(postElement),
      replies: parseMetricByTestId(postElement, 'reply'),
      likes: parseMetricByTestId(postElement, 'like'),
      retweets: parseMetricByTestId(postElement, 'retweet'),
      timestamp: parseTimestamp(postElement),
    };

    return metrics;
  } catch (error) {
    console.error('[Postweaver] Failed to parse post metrics:', error);
    return null;
  }
}

/**
 * Calculate views per minute for a post
 *
 * This metric helps identify viral/trending content vs stale posts.
 * Higher values indicate faster engagement accumulation.
 *
 * Edge cases handled:
 * - Posts < 1 minute old: Use actual seconds for more accurate calculation
 * - Very old posts (>24h): Metric becomes less meaningful but still calculated
 * - No timestamp: Returns 0 (cannot calculate)
 *
 * @param views - Total view count
 * @param timestamp - Post creation timestamp
 * @returns Views per minute, or 0 if calculation isn't possible
 */
export function calculateViewsPerMinute(views: number, timestamp: Date | null): number {
  if (!timestamp || views <= 0) return 0;

  const now = Date.now();
  const postTime = timestamp.getTime();

  // Sanity check - post can't be from the future
  if (postTime > now) return 0;

  const ageMs = now - postTime;

  // For very new posts (< 1 minute), use seconds-based calculation
  // to avoid division by very small numbers
  if (ageMs < 60000) {
    const ageSeconds = Math.max(ageMs / 1000, 1); // At least 1 second
    const viewsPerSecond = views / ageSeconds;
    return viewsPerSecond * 60; // Convert to per-minute rate
  }

  const ageMinutes = ageMs / 60000;
  return views / ageMinutes;
}
