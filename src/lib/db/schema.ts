/**
 * IndexedDB schema and initialization for Postweaver data capture
 * Provides database connection with singleton pattern and store definitions
 */

export const DB_NAME = 'postweaver_data';
export const DB_VERSION = 1;

/** Store names as constants for type safety */
export const STORES = {
  OWN_TWEETS: 'own_tweets',
  OTHER_TWEETS: 'other_tweets',
  PROFILES: 'profiles',
  PROFILE_HISTORY: 'profile_history',
} as const;

// Singleton pattern - reuse connection
let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize and return IndexedDB database connection.
 * Uses singleton pattern to reuse connection.
 */
export async function initDatabase(): Promise<IDBDatabase> {
  // Return existing connection if available
  if (dbInstance) {
    return dbInstance;
  }

  // Return pending connection if initialization in progress
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[Postweaver] Failed to open database:', request.error);
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle connection close (e.g., browser garbage collection)
      dbInstance.onclose = () => {
        console.log('[Postweaver] Database connection closed');
        dbInstance = null;
        dbPromise = null;
      };

      console.log('[Postweaver] Database initialized');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[Postweaver] Database upgrade needed, creating stores...');

      // Own tweets store - user's own tweets for analytics
      if (!db.objectStoreNames.contains(STORES.OWN_TWEETS)) {
        const ownStore = db.createObjectStore(STORES.OWN_TWEETS, { keyPath: 'id' });
        ownStore.createIndex('capturedAt', 'capturedAt'); // For retention cleanup
        ownStore.createIndex('createdAt', 'createdAt'); // For chronological queries
        ownStore.createIndex('viewsPerMinute', 'viewsPerMinute'); // For analytics sorting
      }

      // Others' tweets store - tweets from accounts user follows/views
      if (!db.objectStoreNames.contains(STORES.OTHER_TWEETS)) {
        const otherStore = db.createObjectStore(STORES.OTHER_TWEETS, { keyPath: 'id' });
        otherStore.createIndex('capturedAt', 'capturedAt'); // For retention cleanup
        otherStore.createIndex('authorId', 'authorId'); // Query by author
        otherStore.createIndex('createdAt', 'createdAt'); // For chronological queries
        otherStore.createIndex('viewsPerMinute', 'viewsPerMinute'); // For analytics sorting
      }

      // User profiles store
      if (!db.objectStoreNames.contains(STORES.PROFILES)) {
        const profileStore = db.createObjectStore(STORES.PROFILES, { keyPath: 'id' });
        profileStore.createIndex('handle', 'handle'); // Query by @handle
        profileStore.createIndex('capturedAt', 'capturedAt'); // For retention cleanup
      }

      // Profile history for tracking follower growth over time
      if (!db.objectStoreNames.contains(STORES.PROFILE_HISTORY)) {
        const historyStore = db.createObjectStore(STORES.PROFILE_HISTORY, {
          keyPath: ['profileId', 'timestamp'], // Compound key
        });
        historyStore.createIndex('profileId', 'profileId'); // Get all history for profile
        historyStore.createIndex('timestamp', 'timestamp'); // For retention cleanup
      }

      console.log('[Postweaver] Database stores created');
    };
  });

  return dbPromise;
}

/**
 * Close database connection (for testing/cleanup)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
}
