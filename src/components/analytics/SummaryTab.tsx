import React from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { SummaryCard } from './SummaryCard';
import { EngagementChart } from './EngagementChart';
import { SkeletonChart, SkeletonCard } from './SkeletonChart';
import { EmptyState } from './EmptyState';
import type { DateRange } from '../../types/analytics';

interface SummaryTabProps {
  dateRange: DateRange;
}

/**
 * Combined summary overview showing both user's tweets and feed analytics
 * Provides quick snapshot of all captured data
 */
export function SummaryTab({ dateRange }: SummaryTabProps) {
  const ownData = useAnalytics(dateRange, true); // User's own tweets
  const feedData = useAnalytics(dateRange, false); // Feed tweets

  // Loading state - wait for both queries
  if (ownData.loading || feedData.loading) {
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

  // Error state - show if either query failed
  if (ownData.error || feedData.error) {
    return (
      <EmptyState
        title="Failed to load analytics"
        message={
          ownData.error?.message ||
          feedData.error?.message ||
          'An error occurred while fetching analytics.'
        }
      />
    );
  }

  // Check if any data exists
  const hasOwnData = ownData.summary && ownData.summary.totalTweets > 0;
  const hasFeedData = feedData.summary && feedData.summary.totalTweets > 0;
  const hasAnyData = hasOwnData || hasFeedData;

  // Empty state - no data at all
  if (!hasAnyData) {
    return (
      <EmptyState
        title="No data captured yet"
        message="Browse X.com to start building your analytics. Your tweets and feed data will appear here."
      />
    );
  }

  // Content state - display combined summary
  return (
    <div className="p-4 space-y-4">
      {/* Your Tweets section */}
      {hasOwnData && (
        <div>
          <div className="text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-2">
            Your Tweets
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard
              label="Total"
              value={ownData.summary!.totalTweets}
              size="compact"
            />
            <SummaryCard
              label="Engagement Rate"
              value={`${ownData.summary!.engagementRate.toFixed(2)}%`}
              size="compact"
            />
          </div>
        </div>
      )}

      {/* Feed section */}
      {hasFeedData && (
        <div>
          <div className="text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-2">
            Feed
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard
              label="Captured"
              value={feedData.summary!.totalTweets}
              size="compact"
            />
            <SummaryCard
              label="Avg Engagement"
              value={`${feedData.summary!.engagementRate.toFixed(2)}%`}
              size="compact"
            />
          </div>
        </div>
      )}

      {/* Combined chart section */}
      <div>
        <div className="text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-2">
          Activity Over Time
        </div>
        {/* Show own tweets chart if available, otherwise feed chart */}
        {hasOwnData && ownData.chartData.length > 0 ? (
          <EngagementChart data={ownData.chartData} type="line" height={250} />
        ) : hasFeedData && feedData.chartData.length > 0 ? (
          <EngagementChart data={feedData.chartData} type="line" height={250} />
        ) : (
          <EmptyState
            title="No chart data"
            message="Data will appear here as you capture more tweets."
          />
        )}
      </div>
    </div>
  );
}
