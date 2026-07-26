/**
 * Badge renderer utilities for engagement metrics display
 *
 * Provides formatting, styling, and rendering utilities for engagement badges.
 * The badge HTML is injected into x.com's DOM, where no Tailwind stylesheet
 * exists — so all styling must be inline. Solid pill backgrounds with white
 * text stay readable on all three X themes (light, dim, lights-out).
 */

import type { TierThresholds, BadgeTier } from '../../types/metrics';

/** Icon type for badge display */
export type BadgeIconType = 'down' | 'right' | 'up' | 'unknown';

/** Tier style information including background, text color, and icon */
interface TierClasses {
  /** Background CSS color */
  bg: string;
  /** Text CSS color */
  text: string;
  /** Icon identifier */
  icon: BadgeIconType;
}

/**
 * Compact number formatter using Intl.NumberFormat
 * Reused across all formatViewsPerMin calls for performance
 */
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * SVG path data for badge icons
 * Based on Heroicons stroke icons
 */
export const BADGE_ICONS: Record<BadgeIconType, string> = {
  down: 'M19 14l-7 7m0 0l-7-7m7 7V3', // Heroicons arrow-down
  right: 'M17 8l4 4m0 0l-4 4m4-4H3', // Heroicons arrow-right
  up: 'M5 10l7-7m0 0l7 7m-7-7v18', // Heroicons arrow-up
  unknown:
    'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01', // Heroicons question-mark-circle partial
};

/**
 * Format views per minute value for display
 *
 * @param value - Views per minute value (null if unknown)
 * @returns Formatted string like "1.2K/min", "<1/min", or "?/min"
 */
export function formatViewsPerMin(value: number | null): string {
  if (value === null) {
    return '?/min';
  }

  if (value < 1) {
    return '<1/min';
  }

  return `${compactFormatter.format(Math.round(value))}/min`;
}

/**
 * Determine tier based on value and thresholds
 *
 * @param value - Views per minute value (null if unknown)
 * @param thresholds - User-configured tier thresholds
 * @returns Badge tier classification
 */
export function getTierFromValue(
  value: number | null,
  thresholds: TierThresholds
): BadgeTier {
  if (value === null) {
    return 'unknown';
  }

  if (value < thresholds.low) {
    return 'low';
  }

  if (value < thresholds.medium) {
    return 'medium';
  }

  return 'high';
}

/**
 * Get CSS colors and icon for a badge tier
 * Solid backgrounds + white text: ≥4.5:1 contrast on any page theme
 *
 * @param tier - Badge tier
 * @returns Object with bg, text colors and icon identifier
 */
export function getTierClasses(tier: BadgeTier): TierClasses {
  switch (tier) {
    case 'low':
      return { bg: '#dc2626', text: '#ffffff', icon: 'down' };
    case 'medium':
      return { bg: '#b45309', text: '#ffffff', icon: 'right' };
    case 'high':
      return { bg: '#15803d', text: '#ffffff', icon: 'up' };
    case 'unknown':
    default:
      return { bg: '#52525b', text: '#ffffff', icon: 'unknown' };
  }
}

/**
 * Render complete badge inner HTML with icon, text, and tier styling
 *
 * This is the key function that combines all utilities to produce
 * the actual badge content that gets inserted into the DOM.
 *
 * @param value - Views per minute value (null if unknown)
 * @param thresholds - User-configured tier thresholds
 * @returns Complete badge inner HTML string
 */
export function renderBadgeHTML(
  value: number | null,
  thresholds: TierThresholds
): string {
  const text = formatViewsPerMin(value);
  const tier = getTierFromValue(value, thresholds);
  const classes = getTierClasses(tier);
  const iconPath = BADGE_ICONS[classes.icon];

  // Explicit width/height: without them an inline SVG defaults to 300x150
  const svgIcon = `<svg width="11" height="11" style="flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPath}"></path></svg>`;

  const pillStyle = [
    'display:inline-flex',
    'align-items:center',
    'gap:3px',
    'padding:2px 8px',
    'border-radius:999px',
    'font-size:11px',
    'font-weight:700',
    'line-height:1.3',
    `background:${classes.bg}`,
    `color:${classes.text}`,
  ].join(';');

  return `<span style="${pillStyle}">${svgIcon}<span>${text}</span></span>`;
}
