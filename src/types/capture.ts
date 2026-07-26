/**
 * Data capture types for Postweaver tweet and profile storage
 * Used for storing captured content in IndexedDB for analytics
 */

/**
 * Captured tweet data
 * Represents a tweet with engagement metrics and content metadata
 */
export interface Tweet {
  /** Tweet ID (string, from Twitter) */
  id: string;

  /** User ID of tweet author */
  authorId: string;

  /** @handle for quick reference */
  authorHandle: string;

  /** Full tweet text */
  text: string;

  /** ISO timestamp of tweet creation */
  createdAt: string;

  /** Unix timestamp when we captured this */
  capturedAt: number;

  // Engagement metrics
  /** View count */
  views: number;

  /** Like count */
  likes: number;

  /** Retweet count */
  retweets: number;

  /** Reply count */
  replies: number;

  /** Quote count */
  quotes: number;

  /** Bookmark count */
  bookmarks: number;

  // Content metadata
  /** URLs to media (images, videos) */
  mediaUrls: string[];

  /** Extracted hashtags */
  hashtags: string[];

  /** Extracted @mentions */
  mentions: string[];

  /** Extracted URLs */
  urls: string[];

  // Relationships
  /** Is this a reply to another tweet */
  isReply: boolean;

  /** If reply, the parent tweet ID */
  replyToTweetId: string | null;

  /** Is this a retweet */
  isRetweet: boolean;

  /** If retweet, the original tweet ID */
  retweetOfId: string | null;

  /** Is this a quote tweet */
  isQuote: boolean;

  /** If quote, the quoted tweet ID */
  quotedTweetId: string | null;

  // For analytics
  /** Views per minute, calculated at capture time */
  viewsPerMinute: number | null;
}

/**
 * Captured user profile data
 * Represents a Twitter/X user profile with follower counts and metadata
 */
export interface Profile {
  /** User ID */
  id: string;

  /** @handle (screen_name) */
  handle: string;

  /** Display name */
  name: string;

  /** Profile description */
  bio: string;

  /** Profile image URL */
  avatarUrl: string;

  /** Header image URL */
  bannerUrl: string | null;

  // Counts
  /** Follower count */
  followers: number;

  /** Following count */
  following: number;

  /** Total tweet count */
  tweetCount: number;

  // Metadata
  /** User-entered location */
  location: string | null;

  /** User website URL */
  website: string | null;

  /** Account creation date */
  joinedAt: string | null;

  /** Legacy verified account */
  isVerified: boolean;

  /** Twitter Blue subscriber */
  isBlueVerified: boolean;

  // Capture metadata
  /** When we last updated this profile */
  capturedAt: number;
}

/**
 * Profile snapshot for tracking changes over time
 * Captures key metrics at a point in time for growth analytics
 */
export interface ProfileSnapshot {
  /** User ID this snapshot belongs to */
  profileId: string;

  /** Unix timestamp of snapshot */
  timestamp: number;

  /** Follower count at this time */
  followers: number;

  /** Following count at this time */
  following: number;

  /** Tweet count at this time */
  tweetCount: number;
}

/**
 * Capture settings configuration
 * Controls what data is captured and how long it's retained
 */
export interface CaptureSettings {
  /** Master toggle for capture */
  enabled: boolean;

  /** How long to keep data in days (default 365) */
  retentionDays: number;

  /** Capture user's own tweets */
  captureOwnTweets: boolean;

  /** Capture tweets from others */
  captureOthersTweets: boolean;

  /** Capture profile data */
  captureProfiles: boolean;
}

/**
 * Capture statistics for UI display
 * Shows current capture activity and storage usage
 */
export interface CaptureStats {
  /** Number of tweets captured today */
  tweetsToday: number;

  /** Total tweets in storage */
  totalTweets: number;

  /** Total profiles in storage */
  totalProfiles: number;

  /** Storage used in bytes */
  storageUsedBytes: number;
}

/**
 * Default capture settings
 * - enabled: true (capture starts when feature accessed)
 * - retentionDays: 365 (one year)
 * - All capture types enabled when feature is turned on
 */
export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  enabled: true,
  retentionDays: 365,
  captureOwnTweets: true,
  captureOthersTweets: true,
  captureProfiles: true,
};
