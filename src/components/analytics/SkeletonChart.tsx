import React from 'react';

interface SkeletonChartProps {
  height?: number;
}

/**
 * Animated loading placeholder for charts
 */
export function SkeletonChart({ height = 250 }: SkeletonChartProps) {
  const barHeights = [60, 80, 45, 90, 70, 85, 50];

  return (
    <div
      className="animate-pulse bg-gray-200 dark:bg-gray-800 rounded-lg"
      style={{ height }}
    >
      <div className="h-full flex items-end justify-around px-4 pb-8">
        {barHeights.map((h, index) => (
          <div
            key={index}
            className="bg-gray-300 dark:bg-gray-700 rounded-t w-6"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Animated loading placeholder for summary cards
 */
export function SkeletonCard() {
  return (
    <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
  );
}
