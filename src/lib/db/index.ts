/**
 * Barrel export for Postweaver database module
 * Provides clean import interface for IndexedDB operations
 */

// Schema and initialization
export { initDatabase, closeDatabase, DB_NAME, DB_VERSION, STORES } from './schema';

// Tweet operations
export {
  upsertTweet,
  getTweet,
  getTweetsByAuthor,
  getVoiceExampleTweets,
  getRecentOwnTweets,
  deleteTweetsBefore,
  getTweetCount,
  getTweetsCapturedToday,
} from './tweets';

// Profile operations
export {
  upsertProfile,
  getProfile,
  getProfileByHandle,
  addProfileSnapshot,
  getProfileHistory,
  deleteProfilesBefore,
  deleteProfileHistoryBefore,
  getProfileCount,
} from './profiles';

// Export utilities
export {
  exportTweetsAsJSON,
  exportTweetsAsCSV,
  exportProfilesAsJSON,
  clearAllData,
  getStorageStats,
} from './export';
