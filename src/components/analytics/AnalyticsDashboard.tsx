import React, { useState, useCallback } from 'react';
import { subDays } from 'date-fns';
import type { DateRange } from '../../types/analytics';
import { DateRangeFilter } from './DateRangeFilter';
import { OwnTweetsTab } from './OwnTweetsTab';
import { FeedTab } from './FeedTab';
import { SummaryTab } from './SummaryTab';

type TabId = 'own' | 'feed' | 'summary';

/**
 * Simple refresh icon component
 */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

interface Tab {
  id: TabId;
  label: string;
}

const tabs: Tab[] = [
  { id: 'own', label: 'Your Tweets' },
  { id: 'feed', label: 'Feed' },
  { id: 'summary', label: 'Summary' },
];

/**
 * Main analytics dashboard with tabbed navigation and date filtering
 * Provides overview of captured tweet data with engagement metrics
 */
export function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('own');
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subDays(new Date(), 30), // Default to 30 days
    end: new Date(),
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    // Reset refreshing state after a short delay
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs and filter - NOT sticky inside accordion */}
      <div className="border-b border-x-border-light dark:border-x-border-dark">
        {/* Tab buttons */}
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-x-text-light dark:text-x-text-dark border-x-accent'
                    : 'text-x-secondary-light dark:text-x-secondary-dark border-transparent hover:text-x-text-light dark:hover:text-x-text-dark'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Date filter and refresh button */}
        <div className="px-3 py-2 flex items-center justify-center gap-2">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-full hover:bg-x-hover-light dark:hover:bg-x-hover-dark transition-colors ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            title="Refresh analytics"
            aria-label="Refresh analytics"
          >
            <RefreshIcon className="text-x-secondary-light dark:text-x-secondary-dark" />
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'own' && <OwnTweetsTab dateRange={dateRange} key={`own-${refreshKey}`} />}
        {activeTab === 'feed' && <FeedTab dateRange={dateRange} key={`feed-${refreshKey}`} />}
        {activeTab === 'summary' && <SummaryTab dateRange={dateRange} key={`summary-${refreshKey}`} />}
      </div>
    </div>
  );
}
