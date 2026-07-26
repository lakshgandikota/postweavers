/**
 * Tweet storage operations for Postweaver data capture
 * Provides CRUD operations for captured tweets in IndexedDB
 */

import type { Tweet } from '../../types/capture';
import { initDatabase, STORES } from './schema';

/**
 * Upsert a tweet (insert or update if exists).
 * put() automatically handles both cases based on keyPath.
 */
export async function upsertTweet(
  tweet: Tweet,
  isOwnTweet: boolean
): Promise<void> {
  const db = await initDatabase();
  const storeName = isOwnTweet ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    const request = store.put(tweet);

    request.onerror = () => {
      console.error('[Postweaver] Failed to upsert tweet:', request.error);
      reject(request.error);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a single tweet by ID.
 */
export async function getTweet(
  tweetId: string,
  isOwnTweet: boolean
): Promise<Tweet | undefined> {
  const db = await initDatabase();
  const storeName = isOwnTweet ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(tweetId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all tweets by a specific author (from other_tweets store).
 */
export async function getTweetsByAuthor(authorId: string): Promise<Tweet[]> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OTHER_TWEETS, 'readonly');
    const store = tx.objectStore(STORES.OTHER_TWEETS);
    const index = store.index('authorId');
    const request = index.getAll(authorId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the user's best recent own tweets for AI voice examples.
 * Scans the most recent tweets (by createdAt), prefers non-replies,
 * and returns the top `limit` by like count.
 */
export async function getVoiceExampleTweets(limit: number): Promise<Tweet[]> {
  const db = await initDatabase();
  const scanSize = Math.max(limit * 5, 25);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OWN_TWEETS, 'readonly');
    const store = tx.objectStore(STORES.OWN_TWEETS);
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev');
    const recent: Tweet[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && recent.length < scanSize) {
        const tweet = cursor.value as Tweet;
        // Skip retweets — they aren't the user's own words
        if (!tweet.isRetweet && tweet.text) {
          recent.push(tweet);
        }
        cursor.continue();
      } else {
        const originals = recent.filter((t) => !t.isReply);
        const pool = originals.length >= limit ? originals : recent;
        pool.sort((a, b) => b.likes - a.likes);
        resolve(pool.slice(0, limit));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the user's most recent original own tweets for voice-profile learning.
 * Recency-ordered (not by likes) so the sample reflects how they currently
 * write; skips retweets and replies to focus on their own composed posts.
 */
export async function getRecentOwnTweets(limit: number): Promise<Tweet[]> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OWN_TWEETS, 'readonly');
    const store = tx.objectStore(STORES.OWN_TWEETS);
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev');
    const out: Tweet[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && out.length < limit) {
        const tweet = cursor.value as Tweet;
        if (!tweet.isRetweet && !tweet.isReply && tweet.text.trim().length > 0) {
          out.push(tweet);
        }
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete tweets captured before a given timestamp.
 * Used for retention cleanup.
 */
export async function deleteTweetsBefore(
  timestamp: number,
  isOwnTweet: boolean
): Promise<number> {
  const db = await initDatabase();
  const storeName = isOwnTweet ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index('capturedAt');
    const range = IDBKeyRange.upperBound(timestamp);
    const request = index.openCursor(range);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      console.log(`[Postweaver] Deleted ${deletedCount} old tweets from ${storeName}`);
      resolve(deletedCount);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get total count of tweets in a store.
 */
export async function getTweetCount(isOwnTweet: boolean): Promise<number> {
  const db = await initDatabase();
  const storeName = isOwnTweet ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get tweets captured today (for stats display).
 */
export async function getTweetsCapturedToday(isOwnTweet: boolean): Promise<number> {
  const db = await initDatabase();
  const storeName = isOwnTweet ? STORES.OWN_TWEETS : STORES.OTHER_TWEETS;

  // Start of today (midnight)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.getTime();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('capturedAt');
    const range = IDBKeyRange.lowerBound(startOfDay);
    const request = index.count(range);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
