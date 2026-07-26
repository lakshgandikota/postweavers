import React from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Empty state placeholder with optional action button
 */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {/* Icon container */}
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>

      {/* Title */}
      <div className="text-sm font-medium text-x-primary-light dark:text-x-primary-dark mb-2">
        {title}
      </div>

      {/* Message */}
      <div className="text-xs text-x-secondary-light dark:text-x-secondary-dark text-center max-w-xs mb-4">
        {message}
      </div>

      {/* Optional action button */}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-x-accent text-white hover:bg-x-accent/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
