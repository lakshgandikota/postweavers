/**
 * IndexedDB query functions for analytics data retrieval
 * Provides date-range filtered queries using IDBKeyRange for efficient data access
 */

import { initDatabase, STORES } from '../db/schema';
import type { Tweet } from '../../types/capture';
import type { DailyStats } from '../../types/analytics';

/**
 * Get all tweets within a date range
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @param isOwnTweets - Query own_tweets (true) or other_tweets (false)
 * @returns Promise resolving to array of tweets
 */
export async function getTweetsInRange(
  startDate: Date,
  endDate: Date,
  isOwnTweets: boolean
): Promise<Tweet[]> {
  try {
    const db = await initDatabase();
    const storeName = isOwnTweets ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

    // Create timestamp range for query
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();
    const range = IDBKeyRange.bound(startTimestamp, endTimestamp);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('capturedAt');

      const request = index.getAll(range);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[Postweaver] Failed to get tweets in range:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[Postweaver] Error in getTweetsInRange:', error);
    return [];
  }
}

/**
 * Get daily aggregated statistics for a date range
 * Uses cursor-based iteration for efficient aggregation directly in IndexedDB
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @param isOwnTweets - Query own_tweets (true) or other_tweets (false)
 * @returns Promise resolving to array of daily statistics
 */
export async function getDailyAggregates(
  startDate: Date,
  endDate: Date,
  isOwnTweets: boolean
): Promise<DailyStats[]> {
  try {
    const db = await initDatabase();
    const storeName = isOwnTweets ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

    // Create timestamp range for query
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();
    const range = IDBKeyRange.bound(startTimestamp, endTimestamp);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('capturedAt');

      // Use Map for efficient aggregation by date
      const dailyMap = new Map<string, DailyStats>();

      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;

        if (cursor) {
          const tweet = cursor.value as Tweet;

          // Extract date in YYYY-MM-DD format from capturedAt timestamp
          const dateKey = new Date(tweet.capturedAt).toISOString().split('T')[0]!;

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

          // Accumulate metrics (synchronous to avoid TransactionInactiveError)
          stats.tweetCount++;
          stats.totalViews += tweet.views;
          stats.totalLikes += tweet.likes;
          stats.totalRetweets += tweet.retweets;
          stats.totalReplies += tweet.replies;
          stats.totalQuotes += tweet.quotes;
          stats.totalBookmarks += tweet.bookmarks;

          // Continue to next record
          cursor.continue();
        } else {
          // Cursor complete - convert Map to sorted array
          const sortedStats = Array.from(dailyMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          resolve(sortedStats);
        }
      };

      request.onerror = () => {
        console.error('[Postweaver] Failed to get daily aggregates:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[Postweaver] Error in getDailyAggregates:', error);
    return [];
  }
}
