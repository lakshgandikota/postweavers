/**
 * Data capture module barrel export
 *
 * Provides parsing, user context, and capture engine utilities for
 * capturing tweets and profiles from X.com GraphQL API responses.
 */

// Parser
export { parseGraphQLResponse } from './parser';
export type { ParsedData } from './parser';

// User context
export {
  setLoggedInUserId,
  getLoggedInUserId,
  isOwnUserId,
  clearLoggedInUserId,
  extractLoggedInUserIdFromDOM,
} from './user-context';

// Capture engine
export { DataCaptureEngine } from './capture-engine';
