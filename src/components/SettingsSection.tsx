import { useState, useCallback, type ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  disabled?: boolean;
  badge?: string;
  defaultExpanded?: boolean;
}

/**
 * Collapsible settings section with X.com-matching styling
 * Shows "Coming soon" overlay when disabled
 */
export function SettingsSection({
  title,
  children,
  collapsible = true,
  disabled = false,
  badge,
  defaultExpanded = true,
}: SettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = useCallback(() => {
    if (collapsible && !disabled) {
      setIsExpanded((prev) => !prev);
    }
  }, [collapsible, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <div
      className={`
        border-b border-x-border-light dark:border-x-border-dark
        ${disabled ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div
        role={collapsible && !disabled ? 'button' : undefined}
        tabIndex={collapsible && !disabled ? 0 : undefined}
        aria-expanded={collapsible ? isExpanded : undefined}
        onClick={handleToggle}
        onKeyDown={collapsible && !disabled ? handleKeyDown : undefined}
        className={`
          flex items-center justify-between px-4 py-3
          ${
            collapsible && !disabled
              ? 'cursor-pointer hover:bg-x-border-light/50 dark:hover:bg-x-border-dark/50'
              : ''
          }
          ${disabled ? 'cursor-not-allowed' : ''}
        `}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-x-text-light dark:text-x-text-dark">
            {title}
          </h3>
          {badge && (
            <span className="rounded-full bg-x-accent/10 px-2 py-0.5 text-xs font-medium text-x-accent">
              {badge}
            </span>
          )}
          {disabled && (
            <span className="rounded-full bg-x-secondary-light/20 dark:bg-x-secondary-dark/30 px-2 py-0.5 text-xs text-x-secondary-light dark:text-x-secondary-dark">
              Coming soon
            </span>
          )}
        </div>

        {collapsible && !disabled && (
          <svg
            className={`
              h-4 w-4 text-x-secondary-light dark:text-x-secondary-dark
              transition-transform duration-200
              ${isExpanded ? 'rotate-180' : ''}
            `}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </div>

      {/* Content */}
      {isExpanded && !disabled && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
