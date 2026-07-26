/**
 * GraphQL response parser for X.com API responses
 *
 * Parses tweets and profiles from intercepted GraphQL API responses.
 * Uses defensive parsing with optional chaining throughout since
 * X.com's API structure can change without notice.
 */

import type { Tweet, Profile } from '../../types/capture';
import { calculateViewsPerMinute } from '../filters/post-parser';

/**
 * Parsed data from a GraphQL response
 */
export interface ParsedData {
  tweets: Tweet[];
  profiles: Profile[];
  loggedInUserId: string | null;
}

/**
 * Known GraphQL operations that contain timeline/tweet data
 */
const TIMELINE_OPERATIONS = [
  'HomeTimeline',
  'HomeLatestTimeline',
  'ListLatestTweetsTimeline',
  'CommunityTweetsTimeline',
  'UserTweets',
  'UserTweetsAndReplies',
  'TweetDetail',
  'Bookmarks',
  'Likes',
  'SearchTimeline',
] as const;

/**
 * Parse a GraphQL response and extract tweets/profiles
 */
export function parseGraphQLResponse(
  operationName: string,
  data: unknown
): ParsedData {
  const result: ParsedData = {
    tweets: [],
    profiles: [],
    loggedInUserId: null,
  };

  try {
    // Extract logged-in user ID from viewer context if present
    result.loggedInUserId = extractViewerUserId(data);

    // Check if this is a known timeline operation
    const isTimelineOp = TIMELINE_OPERATIONS.some(op =>
      operationName.toLowerCase().includes(op.toLowerCase())
    );

    if (!isTimelineOp) {
      // Unknown operation - skip but log for investigation
      console.log(`[Postweaver] Skipping unknown GraphQL operation: ${operationName}`);
      return result;
    }

    // Find timeline instructions in response
    const instructions = findTimelineInstructions(data);

    if (!instructions) {
      return result;
    }

    // Process each instruction
    for (const instruction of instructions) {
      if (!instruction || typeof instruction !== 'object') continue;

      const instrType = (instruction as Record<string, unknown>).type;

      if (instrType === 'TimelineAddEntries' || instrType === 'TimelineAddToModule') {
        const entries = (instruction as Record<string, unknown>).entries as unknown[] | undefined;
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            processEntry(entry, result);
          }
        }
      }

      // Handle module items (used in some timeline views)
      if (instrType === 'TimelineAddToModule') {
        const moduleItems = (instruction as Record<string, unknown>).moduleItems as unknown[] | undefined;
        if (Array.isArray(moduleItems)) {
          for (const item of moduleItems) {
            processEntry(item, result);
          }
        }
      }
    }

    console.log(`[Postweaver] Parsed ${result.tweets.length} tweets, ${result.profiles.length} profiles from ${operationName}`);
  } catch (error) {
    console.error(`[Postweaver] Error parsing ${operationName}:`, error);
  }

  return result;
}

/**
 * Extract viewer (logged-in user) ID from response
 */
function extractViewerUserId(data: unknown): string | null {
  try {
    // Common paths where viewer ID appears
    const obj = data as Record<string, unknown>;
    const dataObj = obj?.data as Record<string, unknown>;

    // Try viewer context
    const viewer = dataObj?.viewer as Record<string, unknown>;
    if (viewer?.id) return String(viewer.id);

    // Try user_results path (common in timeline responses)
    const userResults = findNestedValue(data, 'user_results');
    if (userResults) {
      const userResult = (userResults as Record<string, unknown>)?.result as Record<string, unknown>;
      const restId = userResult?.rest_id;
      if (restId) return String(restId);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find timeline instructions in response data
 */
function findTimelineInstructions(data: unknown): unknown[] | null {
  try {
    const obj = data as Record<string, unknown>;
    const dataObj = obj?.data as Record<string, unknown>;

    if (!dataObj) return null;

    // Try various paths where instructions appear
    const paths = [
      // Home timeline
      ['home', 'home_timeline_urt', 'instructions'],
      // User tweets
      ['user', 'result', 'timeline_v2', 'timeline', 'instructions'],
      // Tweet detail
      ['tweetResult', 'result', 'timeline', 'instructions'],
      // Search
      ['search_by_raw_query', 'search_timeline', 'timeline', 'instructions'],
      // Lists
      ['list', 'tweets_timeline', 'timeline', 'instructions'],
      // Communities
      ['communityResults', 'result', 'ranked_community_timeline', 'timeline', 'instructions'],
      // Bookmarks
      ['bookmark_timeline_v2', 'timeline', 'instructions'],
    ];

    for (const path of paths) {
      let current: unknown = dataObj;
      for (const key of path) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[key];
        } else {
          current = undefined;
          break;
        }
      }
      if (Array.isArray(current)) {
        return current;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Process a timeline entry and extract tweet/profile data
 */
function processEntry(entry: unknown, result: ParsedData): void {
  try {
    if (!entry || typeof entry !== 'object') return;

    const entryObj = entry as Record<string, unknown>;

    // Get content from entry
    const content = entryObj.content as Record<string, unknown>;
    if (!content) return;

    // Handle different entry types
    const entryType = content.entryType || content.__typename;

    if (entryType === 'TimelineTimelineItem') {
      // Single tweet entry
      const itemContent = content.itemContent as Record<string, unknown>;
      processTweetContent(itemContent, result);
    } else if (entryType === 'TimelineTimelineModule') {
      // Module with multiple items (conversations, threads)
      const items = content.items as unknown[];
      if (Array.isArray(items)) {
        for (const item of items) {
          const itemObj = item as Record<string, unknown>;
          const itemContent = (itemObj?.item as Record<string, unknown>)?.itemContent as Record<string, unknown>;
          processTweetContent(itemContent, result);
        }
      }
    }
  } catch (error) {
    // Silent fail for individual entries
    console.error('[Postweaver] Error processing entry:', error);
  }
}

/**
 * Process tweet content and extract tweet/profile
 */
function processTweetContent(itemContent: unknown, result: ParsedData): void {
  try {
    if (!itemContent || typeof itemContent !== 'object') return;

    const content = itemContent as Record<string, unknown>;
    const itemType = content.itemType || content.__typename;

    if (itemType !== 'TimelineTweet') return;

    // Get tweet results
    const tweetResults = content.tweet_results as Record<string, unknown>;
    if (!tweetResults) return;

    // Handle both 'result' and direct structure
    const tweetResult = (tweetResults.result || tweetResults) as Record<string, unknown>;
    if (!tweetResult) return;

    // Skip tombstones (deleted tweets)
    if (tweetResult.__typename === 'TweetTombstone') return;

    // Handle TweetWithVisibilityResults wrapper
    let actualTweet = tweetResult;
    if (tweetResult.__typename === 'TweetWithVisibilityResults') {
      actualTweet = tweetResult.tweet as Record<string, unknown>;
    }

    if (!actualTweet) return;

    // Extract tweet data
    const tweet = extractTweet(actualTweet);
    if (tweet) {
      result.tweets.push(tweet);
    }

    // Extract author profile
    const profile = extractProfile(actualTweet);
    if (profile) {
      // Avoid duplicates
      if (!result.profiles.some(p => p.id === profile.id)) {
        result.profiles.push(profile);
      }
    }

    // Handle quoted tweet
    const quotedStatus = actualTweet.quoted_status_result as Record<string, unknown>;
    if (quotedStatus?.result) {
      const quotedTweet = extractTweet(quotedStatus.result as Record<string, unknown>);
      if (quotedTweet) {
        result.tweets.push(quotedTweet);
      }
      const quotedProfile = extractProfile(quotedStatus.result as Record<string, unknown>);
      if (quotedProfile && !result.profiles.some(p => p.id === quotedProfile.id)) {
        result.profiles.push(quotedProfile);
      }
    }
  } catch (error) {
    console.error('[Postweaver] Error processing tweet content:', error);
  }
}

/**
 * Extract user screen_name from tweet data with multiple fallback paths
 * Twitter's API structure varies across endpoints and changes over time
 */
function extractUserScreenName(tweetData: Record<string, unknown>): string {
  const tweetCore = tweetData.core as Record<string, unknown> | undefined;
  const coreUserResults = tweetCore?.user_results as Record<string, unknown> | undefined;
  const coreUserResult = coreUserResults?.result as Record<string, unknown> | undefined;

  // Path 1: core.user_results.result.core.screen_name (CORRECT - Twitter's actual structure)
  const resultCore = coreUserResult?.core as Record<string, unknown> | undefined;
  if (resultCore?.screen_name) {
    return String(resultCore.screen_name);
  }

  // Path 2: core.user_results.result.legacy.screen_name (fallback)
  const coreUserLegacy = coreUserResult?.legacy as Record<string, unknown> | undefined;
  if (coreUserLegacy?.screen_name) {
    return String(coreUserLegacy.screen_name);
  }

  // Path 3: user_results.result.core.screen_name (without tweet core wrapper)
  const userResults = tweetData.user_results as Record<string, unknown> | undefined;
  const userResult = userResults?.result as Record<string, unknown> | undefined;
  const userResultCore = userResult?.core as Record<string, unknown> | undefined;
  if (userResultCore?.screen_name) {
    return String(userResultCore.screen_name);
  }

  // Path 4: user_results.result.legacy.screen_name
  const userLegacy = userResult?.legacy as Record<string, unknown> | undefined;
  if (userLegacy?.screen_name) {
    return String(userLegacy.screen_name);
  }

  // Path 5: Direct screen_name on result object
  if (coreUserResult?.screen_name) {
    return String(coreUserResult.screen_name);
  }

  // Log failure for debugging
  console.warn('[Postweaver] Could not extract screen_name');

  return '';
}

/**
 * Extract Tweet from GraphQL result object
 */
function extractTweet(tweetData: Record<string, unknown>): Tweet | null {
  try {
    const legacy = tweetData.legacy as Record<string, unknown>;
    if (!legacy?.id_str) return null;

    const core = tweetData.core as Record<string, unknown>;
    const userResults = core?.user_results as Record<string, unknown>;
    const userResult = userResults?.result as Record<string, unknown>;
    const userLegacy = userResult?.legacy as Record<string, unknown>;

    // Get view count from views object
    const views = tweetData.views as Record<string, unknown>;
    const viewCount = views?.count ? parseInt(String(views.count), 10) : 0;

    // Calculate views per minute
    const createdAt = legacy.created_at as string;
    let viewsPerMinute: number | null = null;
    if (createdAt && viewCount > 0) {
      try {
        // Convert Twitter date format to Date object
        // Twitter uses: "Wed Oct 10 20:19:24 +0000 2018"
        const timestamp = new Date(createdAt);
        if (!isNaN(timestamp.getTime())) {
          viewsPerMinute = calculateViewsPerMinute(viewCount, timestamp);
        }
      } catch {
        viewsPerMinute = null;
      }
    }

    // Extract entities
    const entities = legacy.entities as Record<string, unknown>;
    const extendedEntities = legacy.extended_entities as Record<string, unknown>;

    const tweet: Tweet = {
      id: String(legacy.id_str),
      authorId: String(legacy.user_id_str || userResult?.rest_id || ''),
      authorHandle: extractUserScreenName(tweetData),
      text: String(legacy.full_text || ''),
      createdAt: String(legacy.created_at || ''),
      capturedAt: Date.now(),

      // Engagement metrics
      views: viewCount,
      likes: parseInt(String(legacy.favorite_count || 0), 10),
      retweets: parseInt(String(legacy.retweet_count || 0), 10),
      replies: parseInt(String(legacy.reply_count || 0), 10),
      quotes: parseInt(String(legacy.quote_count || 0), 10),
      bookmarks: parseInt(String(legacy.bookmark_count || 0), 10),

      // Content metadata
      mediaUrls: extractMediaUrls(extendedEntities || entities),
      hashtags: extractHashtags(entities),
      mentions: extractMentions(entities),
      urls: extractUrls(entities),

      // Relationships
      isReply: Boolean(legacy.in_reply_to_status_id_str),
      replyToTweetId: legacy.in_reply_to_status_id_str
        ? String(legacy.in_reply_to_status_id_str)
        : null,
      isRetweet: Boolean(legacy.retweeted_status_result),
      retweetOfId: getRetweetId(legacy),
      isQuote: Boolean(legacy.is_quote_status),
      quotedTweetId: legacy.quoted_status_id_str
        ? String(legacy.quoted_status_id_str)
        : null,

      viewsPerMinute,
    };

    return tweet;
  } catch (error) {
    console.error('[Postweaver] Error extracting tweet:', error);
    return null;
  }
}

/**
 * Extract Profile from GraphQL result object
 */
function extractProfile(tweetData: Record<string, unknown>): Profile | null {
  try {
    const core = tweetData.core as Record<string, unknown>;
    const userResults = core?.user_results as Record<string, unknown>;
    const userResult = userResults?.result as Record<string, unknown>;

    if (!userResult?.rest_id) return null;

    const legacy = userResult.legacy as Record<string, unknown>;
    if (!legacy) return null;

    const profile: Profile = {
      id: String(userResult.rest_id),
      handle: extractUserScreenName(tweetData),
      name: String(legacy.name || ''),
      bio: String(legacy.description || ''),
      avatarUrl: String(legacy.profile_image_url_https || '').replace('_normal', '_400x400'),
      bannerUrl: legacy.profile_banner_url ? String(legacy.profile_banner_url) : null,

      followers: parseInt(String(legacy.followers_count || 0), 10),
      following: parseInt(String(legacy.friends_count || 0), 10),
      tweetCount: parseInt(String(legacy.statuses_count || 0), 10),

      location: legacy.location ? String(legacy.location) : null,
      website: extractWebsiteUrl(legacy),
      joinedAt: legacy.created_at ? String(legacy.created_at) : null,
      isVerified: Boolean(legacy.verified),
      isBlueVerified: Boolean(userResult.is_blue_verified),

      capturedAt: Date.now(),
    };

    return profile;
  } catch (error) {
    console.error('[Postweaver] Error extracting profile:', error);
    return null;
  }
}

// Helper functions for entity extraction

function extractMediaUrls(entities: unknown): string[] {
  try {
    const ent = entities as Record<string, unknown>;
    const media = ent?.media as unknown[];
    if (!Array.isArray(media)) return [];

    return media
      .map(m => {
        const mediaObj = m as Record<string, unknown>;
        return String(mediaObj.media_url_https || mediaObj.url || '');
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractHashtags(entities: unknown): string[] {
  try {
    const ent = entities as Record<string, unknown>;
    const hashtags = ent?.hashtags as unknown[];
    if (!Array.isArray(hashtags)) return [];

    return hashtags
      .map(h => String((h as Record<string, unknown>).text || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractMentions(entities: unknown): string[] {
  try {
    const ent = entities as Record<string, unknown>;
    const mentions = ent?.user_mentions as unknown[];
    if (!Array.isArray(mentions)) return [];

    return mentions
      .map(m => String((m as Record<string, unknown>).screen_name || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractUrls(entities: unknown): string[] {
  try {
    const ent = entities as Record<string, unknown>;
    const urls = ent?.urls as unknown[];
    if (!Array.isArray(urls)) return [];

    return urls
      .map(u => String((u as Record<string, unknown>).expanded_url || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractWebsiteUrl(legacy: Record<string, unknown>): string | null {
  try {
    const entities = legacy.entities as Record<string, unknown>;
    const url = entities?.url as Record<string, unknown>;
    const urls = url?.urls as unknown[];
    if (!Array.isArray(urls) || urls.length === 0) return null;

    return String((urls[0] as Record<string, unknown>).expanded_url || '') || null;
  } catch {
    return null;
  }
}

function getRetweetId(legacy: Record<string, unknown>): string | null {
  try {
    const retweetedStatus = legacy.retweeted_status_result as Record<string, unknown>;
    const result = retweetedStatus?.result as Record<string, unknown>;
    const rtLegacy = result?.legacy as Record<string, unknown>;
    return rtLegacy?.id_str ? String(rtLegacy.id_str) : null;
  } catch {
    return null;
  }
}

function findNestedValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];

  for (const k of Object.keys(record)) {
    const result = findNestedValue(record[k], key);
    if (result !== undefined) return result;
  }

  return undefined;
}
