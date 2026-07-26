/**
 * Metrics module barrel export
 *
 * Exports badge engine, rendering utilities, and icon data.
 */

export { MetricsBadgeEngine } from './metrics-engine';
export {
  formatViewsPerMin,
  getTierFromValue,
  getTierClasses,
  BADGE_ICONS,
  renderBadgeHTML,
} from './badge-renderer';
export type { BadgeIconType } from './badge-renderer';
