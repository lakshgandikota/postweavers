import { memo } from 'react';
import type { CharCountResult } from '../../types/composer';

interface CharacterCountProps {
  charCount: CharCountResult;
  className?: string;
}

/**
 * Character count display component.
 * Shows count/280 with color coding:
 * - Green: 0-260 characters
 * - Yellow: 261-280 characters (warning)
 * - Red: >280 characters (over limit)
 */
export const CharacterCount = memo(function CharacterCount({
  charCount,
  className = '',
}: CharacterCountProps) {
  const { count, color, valid } = charCount;

  const colorClasses = {
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    red: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className={`flex items-center gap-1 text-sm font-mono ${className}`}>
      <span className={colorClasses[color]}>
        {count}
      </span>
      <span className="text-x-secondary-light dark:text-x-secondary-dark">/</span>
      <span className="text-x-secondary-light dark:text-x-secondary-dark">280</span>
      {!valid && (
        <span className="ml-1 text-xs text-red-500">
          (over limit)
        </span>
      )}
    </div>
  );
});
