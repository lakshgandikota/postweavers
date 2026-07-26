import React from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import type { DateRange, DatePreset } from '../../types/analytics';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const presets: Array<{ id: DatePreset; label: string }> = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'all', label: 'All' },
];

/**
 * Date range preset selector for analytics filtering
 */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const handlePresetClick = (preset: DatePreset) => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (preset) {
      case '7d':
        start = startOfDay(subDays(now, 7));
        end = endOfDay(now);
        break;
      case '30d':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        break;
      case '90d':
        start = startOfDay(subDays(now, 90));
        end = endOfDay(now);
        break;
      case 'all':
        start = new Date(0); // Unix epoch
        end = endOfDay(now);
        break;
    }

    onChange({ start, end });
  };

  // Determine active preset based on current value
  const getActivePreset = (): DatePreset | null => {
    const now = new Date();
    const daysDiff = Math.floor(
      (value.end.getTime() - value.start.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (value.start.getTime() === new Date(0).getTime()) return 'all';
    if (daysDiff <= 8) return '7d';
    if (daysDiff <= 31) return '30d';
    if (daysDiff <= 91) return '90d';
    return null;
  };

  const activePreset = getActivePreset();

  return (
    <div className="inline-flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
      {presets.map((preset) => {
        const isActive = activePreset === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-white dark:bg-gray-700 text-x-primary-light dark:text-x-primary-dark shadow-sm'
                : 'text-x-secondary-light dark:text-x-secondary-dark hover:text-x-primary-light dark:hover:text-x-primary-dark'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
