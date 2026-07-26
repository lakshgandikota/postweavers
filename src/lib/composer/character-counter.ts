import twitterText from 'twitter-text';
import type { CharCountResult } from '../../types/composer';

/**
 * Analyze character count for tweet text using Twitter's weighted algorithm
 *
 * Twitter uses a weighted character counting system:
 * - Most characters count as 1
 * - Emojis and some Unicode characters count as 2
 * - URLs are counted as 23 characters regardless of actual length
 * - Mentions and hashtags count their full length
 *
 * Color thresholds:
 * - Green: 0-260 characters (safe zone)
 * - Yellow: 261-280 characters (warning zone)
 * - Red: >280 characters (invalid)
 *
 * @param text - Tweet text to analyze
 * @returns Character count result with color indicator
 */
export function analyzeCharacterCount(text: string): CharCountResult {
  // Use twitter-text library for accurate weighted character counting
  const parsed = twitterText.parseTweet(text);
  const count = parsed.weightedLength;
  const remaining = 280 - count;
  const valid = count <= 280;

  // Determine color based on thresholds
  let color: 'green' | 'yellow' | 'red';
  if (count > 280) {
    color = 'red';
  } else if (count > 260) {
    color = 'yellow';
  } else {
    color = 'green';
  }

  return {
    count,
    remaining,
    valid,
    color,
  };
}
