import React from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { SummaryCard } from './SummaryCard';
import { EngagementChart } from './EngagementChart';
import { SkeletonChart, SkeletonCard } from './SkeletonChart';
import { EmptyState } from './EmptyState';
import type { DateRange } from '../../types/analytics';

interface FeedTabProps {
  dateRange: DateRange;
}

/**
 * Displays feed tweet analytics focused on content inspiration
 * Shows what's most actionable for creating engaging content
 */
export function FeedTab({ dateRange }: FeedTabProps) {
  const { loading, error, summary, dailyStats, chartData } = useAnalytics(
    dateRange,
    false // isOwnTweets - fetch others' tweets
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
        message={error.message || 'An error occurred while fetching feed analytics.'}
      />
    );
  }

  // Empty state - no feed data captured
  if (!summary || summary.totalTweets === 0) {
    return (
      <EmptyState
        title="No feed data captured yet"
        message="Browse your X.com timeline to capture tweets from others. Data will appear here to inspire your content."
      />
    );
  }

  // Calculate top views per minute from daily stats
  const topViewsPerMin =
    dailyStats.length > 0
      ? Math.max(
          ...dailyStats.map((d) =>
            d.totalViews > 0 ? d.totalViews / 1440 : 0 // 1440 minutes per day
          )
        )
      : 0;

  // Content state - display analytics
  return (
    <div className="p-4 space-y-4">
      {/* Summary cards grid - focused on content inspiration metrics */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Tweets Captured" value={summary.totalTweets} />
        <SummaryCard
          label="Total Views"
          value={summary.totalViews.toLocaleString()}
        />
        <SummaryCard
          label="Avg Engagement"
          value={`${summary.engagementRate.toFixed(2)}%`}
        />
        <SummaryCard
          label="Top Views/Min"
          value={topViewsPerMin.toFixed(1)}
        />
      </div>

      {/* Engagement chart */}
      <EngagementChart data={chartData} type="line" height={250} />
    </div>
  );
}
