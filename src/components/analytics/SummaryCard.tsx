import React from 'react';

interface SummaryCardProps {
  label: string;
  value: string | number;
  change?: {
    value: number; // Percentage
    direction: 'up' | 'down';
  };
  size?: 'default' | 'compact';
}

/**
 * Metric display card with optional change indicator
 */
export function SummaryCard({
  label,
  value,
  change,
  size = 'default',
}: SummaryCardProps) {
  const formattedValue =
    typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
        {label}
      </div>
      <div
        className={`font-semibold text-x-primary-light dark:text-x-primary-dark ${
          size === 'default' ? 'text-xl' : 'text-lg'
        } mt-1`}
      >
        {formattedValue}
      </div>
      {change && (
        <div
          className={`flex items-center gap-1 mt-2 text-xs font-medium ${
            change.direction === 'up'
              ? 'text-green-600 dark:text-green-500'
              : 'text-red-600 dark:text-red-500'
          }`}
        >
          <span>{change.direction === 'up' ? '↑' : '↓'}</span>
          <span>{Math.abs(change.value).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
