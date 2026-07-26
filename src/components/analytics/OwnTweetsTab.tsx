import React from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { SummaryCard } from './SummaryCard';
import { EngagementChart } from './EngagementChart';
import { SkeletonChart, SkeletonCard } from './SkeletonChart';
import { EmptyState } from './EmptyState';
import type { DateRange } from '../../types/analytics';

interface OwnTweetsTabProps {
  dateRange: DateRange;
}

/**
 * Displays user's own tweet analytics with summary cards and engagement chart
 */
export function OwnTweetsTab({ dateRange }: OwnTweetsTabProps) {
  const { loading, error, summary, chartData } = useAnalytics(
    dateRange,
    true // isOwnTweets
  );

  // Loading state with skeleton placeholders
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonChart />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        title="Failed to load analytics"
        message={error.message || 'An error occurred while fetching your tweet analytics.'}
      />
    );
  }

  // Empty state - no tweets captured
  if (!summary || summary.totalTweets === 0) {
    return (
      <EmptyState
        title="No tweets captured yet"
        message="Start browsing X.com to capture your tweets. Data will appear here as you post and scroll."
      />
    );
  }

  // Content state - display analytics
  return (
    <div className="p-4 space-y-4">
      {/* Summary cards grid */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total Tweets" value={summary.totalTweets} />
        <SummaryCard
          label="Total Views"
          value={summary.totalViews.toLocaleString()}
        />
        <SummaryCard
          label="Avg Views/Min"
          value={summary.avgViewsPerMin.toFixed(1)}
        />
        <SummaryCard
          label="Engagement Rate"
          value={`${summary.engagementRate.toFixed(2)}%`}
        />
      </div>

      {/* Engagement chart */}
      <EngagementChart data={chartData} type="line" height={250} />
    </div>
  );
}
