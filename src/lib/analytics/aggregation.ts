/**
 * Data aggregation utilities for analytics processing
 * Provides functions to group, aggregate, and fill gaps in time-series data
 */

import { addDays, isBefore, isEqual } from 'date-fns';
import type { Tweet } from '../../types/capture';
import type { DailyStats, AnalyticsSummary } from '../../types/analytics';

/**
 * Get UTC date string in YYYY-MM-DD format
 * Matches the format used in queries.ts for consistency
 */
function getUTCDateKey(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Get start of day in UTC
 */
function startOfDayUTC(date: Date): Date {
  const utcDate = new Date(date.toISOString().split('T')[0] + 'T00:00:00.000Z');
  return utcDate;
}

/**
 * Aggregate tweets into daily statistics
 * Groups tweets by date and sums metrics for each day
 * @param tweets - Array of tweets to aggregate
 * @returns Array of daily statistics sorted by date
 */
export function aggregateDailyStats(tweets: Tweet[]): DailyStats[] {
  const dailyMap = new Map<string, DailyStats>();

  for (const tweet of tweets) {
    // Extract UTC date in YYYY-MM-DD format from capturedAt timestamp
    const dateKey = getUTCDateKey(new Date(tweet.capturedAt));

    // Get existing stats for this date or create new entry
    const existing = dailyMap.get(dateKey);
    if (!existing) {
      const newStats: DailyStats = {
        date: dateKey,
        tweetCount: 0,
        totalViews: 0,
        totalLikes: 0,
        totalRetweets: 0,
        totalReplies: 0,
        totalQuotes: 0,
        totalBookmarks: 0,
      };
      dailyMap.set(dateKey, newStats);
    }

    const stats = dailyMap.get(dateKey)!;

    // Accumulate metrics
    stats.tweetCount++;
    stats.totalViews += tweet.views;
    stats.totalLikes += tweet.likes;
    stats.totalRetweets += tweet.retweets;
    stats.totalReplies += tweet.replies;
    stats.totalQuotes += tweet.quotes;
    stats.totalBookmarks += tweet.bookmarks;
  }

  // Convert Map to sorted array
  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fill date gaps in daily statistics with zero-filled entries
 * Creates continuous time series with no missing dates
 * @param data - Existing daily statistics (may have gaps)
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Continuous array with all dates from start to end
 */
export function fillDateGaps(
  data: DailyStats[],
  startDate: Date,
  endDate: Date
): DailyStats[] {
  // Create Map from existing data for O(1) lookup
  const dataMap = new Map<string, DailyStats>();
  for (const stats of data) {
    dataMap.set(stats.date, stats);
  }

  const result: DailyStats[] = [];

  // Use UTC dates to match how dates are stored in getDailyAggregates
  // (which uses toISOString().split('T')[0] - UTC date)
  let currentDate = startOfDayUTC(startDate);
  const end = startOfDayUTC(endDate);

  // Iterate through each date in range
  while (isBefore(currentDate, end) || isEqual(currentDate, end)) {
    // Use UTC date key to match the format from getDailyAggregates
    const dateKey = getUTCDateKey(currentDate);

    // Use existing data or create zero-filled entry
    const stats = dataMap.get(dateKey) || {
      date: dateKey,
      tweetCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalRetweets: 0,
      totalReplies: 0,
      totalQuotes: 0,
      totalBookmarks: 0,
    };

    result.push(stats);
    currentDate = addDays(currentDate, 1);
  }

  return result;
}

/**
 * Aggregate daily statistics into total summary
 * Sums all daily stats into overall totals
 * @param dailyStats - Array of daily statistics
 * @returns Partial summary with totals (rates not calculated)
 */
export function aggregateTotals(dailyStats: DailyStats[]): Partial<AnalyticsSummary> {
  let totalTweets = 0;
  let totalViews = 0;
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalQuotes = 0;
  let totalBookmarks = 0;

  for (const stats of dailyStats) {
    totalTweets += stats.tweetCount;
    totalViews += stats.totalViews;
    totalLikes += stats.totalLikes;
    totalRetweets += stats.totalRetweets;
    totalReplies += stats.totalReplies;
    totalQuotes += stats.totalQuotes;
    totalBookmarks += stats.totalBookmarks;
  }

  // Calculate total engagements (sum of all interaction types)
  const totalEngagements = totalLikes + totalRetweets + totalReplies + totalQuotes + totalBookmarks;

  return {
    totalTweets,
    totalViews,
    totalEngagements,
  };
}
