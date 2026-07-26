/**
 * Engagement metric calculations for analytics
 * Provides functions to calculate engagement rates and performance metrics
 */

import type { Tweet } from '../../types/capture';

/**
 * Calculate engagement rate for a single tweet
 * Uses Twitter standard formula: (total engagements / views) * 100
 * @param tweet - Tweet to calculate engagement rate for
 * @returns Engagement rate as percentage (0-100+)
 */
export function calculateEngagementRate(tweet: Tweet): number {
  if (tweet.views === 0) {
    return 0; // Avoid division by zero
  }

  const totalEngagements =
    tweet.likes + tweet.retweets + tweet.replies + tweet.quotes + tweet.bookmarks;

  return (totalEngagements / tweet.views) * 100;
}

/**
 * Calculate average engagement rate across multiple tweets
 * Aggregates all engagements and views, then calculates overall rate
 * @param tweets - Array of tweets to analyze
 * @returns Average engagement rate as percentage (0-100+)
 */
export function calculateAverageEngagementRate(tweets: Tweet[]): number {
  let totalEngagements = 0;
  let totalViews = 0;

  for (const tweet of tweets) {
    totalEngagements +=
      tweet.likes + tweet.retweets + tweet.replies + tweet.quotes + tweet.bookmarks;
    totalViews += tweet.views;
  }

  if (totalViews === 0) {
    return 0; // Avoid division by zero
  }

  return (totalEngagements / totalViews) * 100;
}

/**
 * Calculate views per minute for a tweet
 * Measures how quickly a tweet is gaining views
 * @param views - Current view count
 * @param createdAt - Tweet creation timestamp (ISO string)
 * @returns Views per minute, or null if less than 1 minute old
 */
export function calculateViewsPerMinute(views: number, createdAt: string): number | null {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const minutesSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60);

  if (minutesSinceCreation < 1) {
    return null; // Too new to calculate meaningful rate
  }

  return views / minutesSinceCreation;
}
