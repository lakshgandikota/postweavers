/**
 * Export and data management utilities for Postweaver
 * Provides JSON/CSV export, storage stats, and clear functionality
 */

import type { Tweet, Profile } from '../../types/capture';
import { initDatabase, STORES } from './schema';

/**
 * Get all tweets from both stores
 */
async function getAllTweets(): Promise<{ own: Tweet[]; others: Tweet[] }> {
  const db = await initDatabase();

  const own = await new Promise<Tweet[]>((resolve, reject) => {
    const tx = db.transaction(STORES.OWN_TWEETS, 'readonly');
    const store = tx.objectStore(STORES.OWN_TWEETS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const others = await new Promise<Tweet[]>((resolve, reject) => {
    const tx = db.transaction(STORES.OTHER_TWEETS, 'readonly');
    const store = tx.objectStore(STORES.OTHER_TWEETS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  return { own, others };
}

/**
 * Get all profiles
 */
async function getAllProfiles(): Promise<Profile[]> {
  const db = await initDatabase();

  return new Promise<Profile[]>((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readonly');
    const store = tx.objectStore(STORES.PROFILES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Export all tweets as JSON file
 */
export async function exportTweetsAsJSON(): Promise<void> {
  const tweets = await getAllTweets();
  const data = {
    exportedAt: new Date().toISOString(),
    ownTweets: tweets.own,
    othersTweets: tweets.others,
    totalCount: tweets.own.length + tweets.others.length,
  };

  downloadFile(
    JSON.stringify(data, null, 2),
    `postweaver-tweets-${formatDate()}.json`,
    'application/json'
  );
}

/**
 * Export all tweets as CSV file
 */
export async function exportTweetsAsCSV(): Promise<void> {
  const tweets = await getAllTweets();
  const allTweets = [
    ...tweets.own.map((t) => ({ ...t, isOwn: true })),
    ...tweets.others.map((t) => ({ ...t, isOwn: false })),
  ];

  // CSV header
  const headers = [
    'id',
    'authorId',
    'authorHandle',
    'text',
    'createdAt',
    'capturedAt',
    'views',
    'likes',
    'retweets',
    'replies',
    'quotes',
    'bookmarks',
    'viewsPerMinute',
    'isOwn',
    'isReply',
    'isRetweet',
    'isQuote',
    'hashtags',
    'mentions',
  ];

  // Build CSV rows
  const rows = allTweets.map((tweet) => [
    tweet.id,
    tweet.authorId,
    tweet.authorHandle,
    escapeCsvValue(tweet.text),
    tweet.createdAt,
    new Date(tweet.capturedAt).toISOString(),
    tweet.views,
    tweet.likes,
    tweet.retweets,
    tweet.replies,
    tweet.quotes,
    tweet.bookmarks,
    tweet.viewsPerMinute ?? '',
    (tweet as Tweet & { isOwn: boolean }).isOwn,
    tweet.isReply,
    tweet.isRetweet,
    tweet.isQuote,
    tweet.hashtags.join(';'),
    tweet.mentions.join(';'),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  downloadFile(csv, `postweaver-tweets-${formatDate()}.csv`, 'text/csv');
}

/**
 * Export all profiles as JSON file
 */
export async function exportProfilesAsJSON(): Promise<void> {
  const profiles = await getAllProfiles();
  const data = {
    exportedAt: new Date().toISOString(),
    profiles,
    totalCount: profiles.length,
  };

  downloadFile(
    JSON.stringify(data, null, 2),
    `postweaver-profiles-${formatDate()}.json`,
    'application/json'
  );
}

/**
 * Clear all captured data from IndexedDB
 */
export async function clearAllData(): Promise<void> {
  const db = await initDatabase();

  // Clear all stores
  const stores = [
    STORES.OWN_TWEETS,
    STORES.OTHER_TWEETS,
    STORES.PROFILES,
    STORES.PROFILE_HISTORY,
  ];

  for (const storeName of stores) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  console.log('[Postweaver] All captured data cleared');
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  tweetsCount: number;
  profilesCount: number;
  storageUsedBytes: number;
}> {
  const db = await initDatabase();

  // Count tweets
  const ownCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORES.OWN_TWEETS, 'readonly');
    const request = tx.objectStore(STORES.OWN_TWEETS).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const othersCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORES.OTHER_TWEETS, 'readonly');
    const request = tx.objectStore(STORES.OTHER_TWEETS).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // Count profiles
  const profilesCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readonly');
    const request = tx.objectStore(STORES.PROFILES).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // Get storage estimate
  let storageUsedBytes = 0;
  try {
    const estimate = await navigator.storage.estimate();
    storageUsedBytes = estimate.usage || 0;
  } catch {
    // Storage API may not be available
  }

  return {
    tweetsCount: ownCount + othersCount,
    profilesCount,
    storageUsedBytes,
  };
}

// Helper functions

function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

function escapeCsvValue(value: string): string {
  // Escape quotes and wrap in quotes if contains comma, newline, or quote
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
