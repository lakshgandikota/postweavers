/**
 * Analytics type definitions for dashboard data visualization
 */

/**
 * Date range for analytics queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Daily aggregated statistics
 */
export interface DailyStats {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Number of tweets captured on this day */
  tweetCount: number;
  /** Total views across all tweets */
  totalViews: number;
  /** Total likes across all tweets */
  totalLikes: number;
  /** Total retweets across all tweets */
  totalRetweets: number;
  /** Total replies across all tweets */
  totalReplies: number;
  /** Total quotes across all tweets */
  totalQuotes: number;
  /** Total bookmarks across all tweets */
  totalBookmarks: number;
}

/**
 * Summary analytics across a time period
 */
export interface AnalyticsSummary {
  /** Total number of tweets */
  totalTweets: number;
  /** Total views across all tweets */
  totalViews: number;
  /** Total engagements (likes + retweets + replies + quotes + bookmarks) */
  totalEngagements: number;
  /** Average views per minute */
  avgViewsPerMin: number;
  /** Engagement rate as percentage (engagements/views * 100) */
  engagementRate: number;
}

/**
 * Data point for chart visualization
 */
export interface ChartDataPoint {
  /** Formatted date for display (e.g., "Jan 15") */
  date: string;
  /** View count */
  views: number;
  /** Like count */
  likes: number;
  /** Retweet count */
  retweets: number;
  /** Engagement rate as percentage */
  engagementRate: number;
}

/**
 * Predefined date range presets
 */
export type DatePreset = '7d' | '30d' | '90d' | 'all';
