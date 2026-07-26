import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  getDailyAggregates,
  fillDateGaps,
  aggregateTotals,
} from '../lib/analytics';
import type {
  DateRange,
  DailyStats,
  AnalyticsSummary,
  ChartDataPoint,
} from '../types/analytics';

/**
 * Hook return type
 */
interface UseAnalyticsResult {
  loading: boolean;
  error: Error | null;
  summary: AnalyticsSummary | null;
  dailyStats: DailyStats[];
  chartData: ChartDataPoint[];
}

/**
 * React hook for fetching and aggregating analytics data
 *
 * @param dateRange - Start and end dates for analytics query
 * @param isOwnTweets - Whether to fetch user's own tweets (true) or feed tweets (false)
 * @returns Analytics data with loading and error states
 */
export function useAnalytics(
  dateRange: DateRange,
  isOwnTweets: boolean
): UseAnalyticsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchAnalytics() {
      setLoading(true);
      setError(null);

      try {
        // Fetch daily aggregates for date range
        const aggregates = await getDailyAggregates(
          dateRange.start,
          dateRange.end,
          isOwnTweets
        );

        if (!mounted) return;

        // Fill date gaps for continuous time series
        const filledData = fillDateGaps(
          aggregates,
          dateRange.start,
          dateRange.end
        );

        // Calculate summary totals
        const totals = aggregateTotals(filledData);

        // Calculate average views per minute
        // Use average of daily viewsPerMinute values, or calculate from total
        const avgViewsPerMin =
          filledData.length > 0
            ? filledData.reduce((sum, d) => {
                const dailyViewsPerMin =
                  d.totalViews > 0 ? d.totalViews / 1440 : 0; // 1440 minutes per day
                return sum + dailyViewsPerMin;
              }, 0) / filledData.length
            : 0;

        // Calculate engagement rate
        const engagementRate =
          (totals.totalViews || 0) > 0
            ? ((totals.totalEngagements || 0) / (totals.totalViews || 0)) * 100
            : 0;

        const summaryData: AnalyticsSummary = {
          totalTweets: totals.totalTweets || 0,
          totalViews: totals.totalViews || 0,
          totalEngagements: totals.totalEngagements || 0,
          avgViewsPerMin,
          engagementRate,
        };

        setSummary(summaryData);
        setDailyStats(filledData);
      } catch (err) {
        if (!mounted) return;

        setError(
          err instanceof Error ? err : new Error('Failed to fetch analytics')
        );
        setSummary(null);
        setDailyStats([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();

    return () => {
      mounted = false;
    };
  }, [dateRange.start, dateRange.end, isOwnTweets]);

  // Transform daily stats to chart data with memoization
  const chartData = useMemo(
    () =>
      dailyStats.map((d) => ({
        date: format(new Date(d.date), 'MMM d'),
        views: d.totalViews,
        likes: d.totalLikes,
        retweets: d.totalRetweets,
        engagementRate:
          d.totalViews > 0
            ? ((d.totalLikes +
                d.totalRetweets +
                d.totalReplies +
                d.totalQuotes +
                d.totalBookmarks) /
                d.totalViews) *
              100
            : 0,
      })),
    [dailyStats]
  );

  return {
    loading,
    error,
    summary,
    dailyStats,
    chartData,
  };
}
