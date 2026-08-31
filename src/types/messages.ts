import type { ExtensionSettings } from './settings';
import type { Tweet, Profile, ProfileSnapshot } from './capture';
import type { ReplyTarget } from './ai-drafter';

/**
 * Compose context types
 */
export type ComposeContext = {
  type: 'new_tweet' | 'reply' | 'quote';
  /** The tweet being replied to, when extractable from the page */
  target?: ReplyTarget | null;
};

/**
 * Extension message types for communication between contexts
 * (background, content script, popup, sidebar)
 */
export type ExtensionMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'TOGGLE_ENABLED' }
  | { type: 'GET_THEME' }
  | { type: 'SETTINGS_CHANGED'; settings: ExtensionSettings }
  | { type: 'OPEN_SIDEBAR' }
  | { type: 'STORE_TWEET'; tweet: Tweet; isOwnTweet: boolean }
  | { type: 'STORE_PROFILE'; profile: Profile }
  | { type: 'STORE_PROFILE_SNAPSHOT'; snapshot: ProfileSnapshot }
  | { type: 'OPEN_TWEET_TAB'; url: string }
  | { type: 'COMPOSE_FOCUSED'; context: ComposeContext }
  | { type: 'COMPOSE_BLURRED' }
  | { type: 'COMPOSE_TEXT_CHANGED'; text: string }
  | { type: 'GET_COMPOSE_TEXT' }
  | { type: 'GET_REPLY_CONTEXT' }
  | { type: 'INSERT_DRAFT'; content: string }
  | { type: 'LEARN_VOICE' }
  | { type: 'LINK_GOOGLE' }
  | { type: 'GET_SYNC_STATUS' }
  | { type: 'GET_BILLING' }
  | { type: 'SYNC_NOW' };

/**
 * Type-safe response types based on message type
 */
export type MessageResponse<T extends ExtensionMessage['type']> =
  T extends 'GET_SETTINGS' ? ExtensionSettings :
  T extends 'GET_THEME' ? { theme: 'light' | 'dark' } :
  T extends 'TOGGLE_ENABLED' ? { enabled: boolean } :
  T extends 'STORE_TWEET' ? { success: boolean } :
  T extends 'STORE_PROFILE' ? { success: boolean } :
  T extends 'STORE_PROFILE_SNAPSHOT' ? { success: boolean } :
  T extends 'OPEN_TWEET_TAB' ? { success: boolean } :
  T extends 'GET_COMPOSE_TEXT' ? { text: string; focused: boolean } :
  T extends 'GET_REPLY_CONTEXT' ? { target: import('./ai-drafter').ReplyTarget | null } :
  T extends 'INSERT_DRAFT' ? { success: boolean } :
  T extends 'LEARN_VOICE' ? { success: boolean; profile?: string; sourceCount?: number; error?: string } :
  T extends 'LINK_GOOGLE' ? { success: boolean; email?: string; linked?: boolean; error?: string } :
  T extends 'GET_SYNC_STATUS' ? { email: string | null; redirectUri: string } :
  T extends 'GET_BILLING' ? import('../lib/firebase/billing').BillingStatus :
  T extends 'SYNC_NOW' ? { ok: boolean; email: string | null; syncedAt: number } :
  { success: boolean };

/**
 * Helper type to extract message by type
 */
export type MessageOfType<T extends ExtensionMessage['type']> = Extract<
  ExtensionMessage,
  { type: T }
>;
