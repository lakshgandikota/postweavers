/**
 * Analytics module barrel export
 * Provides clean imports for all analytics functionality
 */

// Query functions
export { getTweetsInRange, getDailyAggregates } from './queries';

// Aggregation utilities
export { aggregateDailyStats, fillDateGaps, aggregateTotals } from './aggregation';

// Metric calculations
export {
  calculateEngagementRate,
  calculateAverageEngagementRate,
  calculateViewsPerMinute,
} from './metrics';
