import { useCallback } from 'react';

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

/**
 * Accessible toggle switch component matching X.com aesthetic
 * Blue (#1d9bf0) when enabled, gray when disabled
 */
export function ToggleSwitch({
  enabled,
  onChange,
  disabled = false,
  label,
  id,
}: ToggleSwitchProps) {
  const toggleId = id || `toggle-${label?.toLowerCase().replace(/\s+/g, '-') || 'switch'}`;

  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!enabled);
    }
  }, [disabled, enabled, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onChange(!enabled);
      }
    },
    [disabled, enabled, onChange]
  );

  return (
    <div className="flex items-center justify-between gap-3">
      {label && (
        <label
          htmlFor={toggleId}
          className={`text-sm font-medium select-none ${
            disabled
              ? 'text-x-secondary-light dark:text-x-secondary-dark cursor-not-allowed'
              : 'text-x-text-light dark:text-x-text-dark cursor-pointer'
          }`}
        >
          {label}
        </label>
      )}
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label || 'Toggle'}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0
          rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-x-accent focus-visible:ring-offset-2
          focus-visible:ring-offset-x-bg-light dark:focus-visible:ring-offset-x-bg-dark
          ${
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer'
          }
          ${
            enabled
              ? 'bg-x-accent'
              : 'bg-x-secondary-light dark:bg-x-secondary-dark'
          }
        `}
      >
        <span
          aria-hidden="true"
          className={`
            pointer-events-none inline-block h-5 w-5
            transform rounded-full bg-white shadow-lg ring-0
            transition duration-200 ease-in-out
            ${enabled ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}
