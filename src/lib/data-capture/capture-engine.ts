import type { CaptureSettings } from '../../types/capture';
import { parseGraphQLResponse, setLoggedInUserId, isOwnUserId } from './index';

/**
 * Message received from MAIN world interceptor
 */
interface GraphQLMessage {
  type: 'POSTWEAVER_GRAPHQL_RESPONSE';
  payload: {
    url: string;
    operationName: string;
    data: unknown;
    timestamp: number;
  };
}

/**
 * DataCaptureEngine handles the capture pipeline:
 * 1. Receives GraphQL data from MAIN world interceptor via postMessage
 * 2. Parses tweets and profiles using the parser
 * 3. Stores data in IndexedDB using the db module
 */
export class DataCaptureEngine {
  private settings: CaptureSettings;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private captureCount = 0;

  constructor(settings: CaptureSettings) {
    this.settings = settings;
  }

  /**
   * Initialize the capture engine
   * - Sets up postMessage listener for GraphQL responses
   */
  initialize(): void {
    if (!this.settings.enabled) {
      console.log('[Postweaver] Data capture disabled, skipping initialization');
      return;
    }

    // Set up message listener for MAIN world interceptor
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);

    console.log('[Postweaver] Data capture engine initialized');
  }

  /**
   * Clean up the capture engine
   */
  cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    console.log(`[Postweaver] Data capture engine cleaned up (captured ${this.captureCount} tweets this session)`);
    this.captureCount = 0;
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: CaptureSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = newSettings;

    if (!wasEnabled && newSettings.enabled) {
      // Was disabled, now enabled - initialize
      this.initialize();
    } else if (wasEnabled && !newSettings.enabled) {
      // Was enabled, now disabled - cleanup
      this.cleanup();
    }
  }

  /**
   * Handle incoming postMessage from MAIN world interceptor
   */
  private handleMessage(event: MessageEvent): void {
    // Only accept messages from same window
    if (event.source !== window) return;

    // Check message type
    const message = event.data as GraphQLMessage;
    if (message?.type !== 'POSTWEAVER_GRAPHQL_RESPONSE') return;

    // Process asynchronously to not block the page
    this.processGraphQLResponse(message.payload).catch((error) => {
      console.error('[Postweaver] Error processing GraphQL response:', error);
    });
  }

  /**
   * Process a GraphQL response and store data
   */
  private async processGraphQLResponse(payload: {
    url: string;
    operationName: string;
    data: unknown;
    timestamp: number;
  }): Promise<void> {
    try {
      // Parse the response
      const parsed = parseGraphQLResponse(payload.operationName, payload.data);

      // Update logged-in user ID if found
      if (parsed.loggedInUserId) {
        setLoggedInUserId(parsed.loggedInUserId);
      }

      for (const tweet of parsed.tweets) {
        try {
          const isOwn = isOwnUserId(tweet.authorId);

          // Check capture settings
          if (isOwn && !this.settings.captureOwnTweets) {
            console.log('[Postweaver] Skipping own tweet (disabled):', tweet.id);
            continue;
          }
          if (!isOwn && !this.settings.captureOthersTweets) {
            console.log('[Postweaver] Skipping other tweet (disabled):', tweet.id);
            continue;
          }

          // Send to background for storage (extension context)
          await chrome.runtime.sendMessage({
            type: 'STORE_TWEET',
            tweet,
            isOwnTweet: isOwn,
          });
          this.captureCount++;
        } catch (error) {
          // Silent fail for individual tweets - log and continue
          console.error('[Postweaver] Failed to store tweet:', tweet.id, error);
        }
      }

      // Store profiles
      if (this.settings.captureProfiles) {
        for (const profile of parsed.profiles) {
          try {
            // Send profile to background for storage
            await chrome.runtime.sendMessage({
              type: 'STORE_PROFILE',
              profile,
            });

            // Send profile snapshot for history tracking
            await chrome.runtime.sendMessage({
              type: 'STORE_PROFILE_SNAPSHOT',
              snapshot: {
                profileId: profile.id,
                timestamp: Date.now(),
                followers: profile.followers,
                following: profile.following,
                tweetCount: profile.tweetCount,
              },
            });
          } catch (error) {
            // Silent fail for individual profiles
            console.error('[Postweaver] Failed to store profile:', profile.id, error);
          }
        }
      }
    } catch (error) {
      // Log but don't throw - capture should be resilient
      console.error('[Postweaver] Error in processGraphQLResponse:', error);
    }
  }

  /**
   * Get current session capture count
   */
  getCaptureCount(): number {
    return this.captureCount;
  }
}
