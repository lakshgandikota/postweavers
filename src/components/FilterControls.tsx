import { useState, useEffect } from 'react';
import type { FilterSettings, KeywordMode, HideMethod } from '../types/filters';
import {
  getFilterSettings,
  updateFilterSettings,
  subscribeToFilterSettings,
} from '../lib/storage';

/**
 * Hook to manage filter settings with real-time sync
 */
function useFilterSettings() {
  const [settings, setSettings] = useState<FilterSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial settings
    getFilterSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    // Subscribe to changes
    const unsubscribe = subscribeToFilterSettings(setSettings);
    return unsubscribe;
  }, []);

  const update = async (updates: Partial<FilterSettings>) => {
    await updateFilterSettings(updates);
  };

  return { settings, update, loading };
}

/**
 * Toggle switch component for filter controls
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-x-accent focus:ring-offset-2
        w-11 h-6
        ${checked ? 'bg-x-accent' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow-lg ring-0
          transition duration-200 ease-in-out w-5 h-5
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

/**
 * Toggle button group for mutually exclusive options
 */
function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all
            ${
              value === option
                ? 'bg-white dark:bg-gray-700 text-x-text-light dark:text-x-text-dark shadow-sm'
                : 'text-x-secondary-light dark:text-x-secondary-dark hover:text-x-text-light dark:hover:text-x-text-dark'
            }
          `}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

/**
 * Numeric threshold input with enable/disable checkbox
 * null value indicates disabled state
 */
function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  min = 0,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  min?: number;
  step?: number;
}) {
  const isEnabled = value !== null;

  const handleCheckboxChange = (checked: boolean) => {
    if (checked) {
      // Enable with default value based on min
      onChange(min > 0 ? min : step);
    } else {
      // Disable
      onChange(null);
    }
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseFloat(e.target.value);
    if (!isNaN(numValue) && numValue >= min) {
      onChange(numValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => handleCheckboxChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-x-accent focus:ring-x-accent"
        />
        <label className="text-sm text-x-text-light dark:text-x-text-dark">
          {label}
        </label>
      </div>
      {isEnabled && (
        <input
          type="number"
          value={value ?? ''}
          onChange={handleValueChange}
          min={min}
          step={step}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800 text-x-text-light dark:text-x-text-dark
            focus:outline-none focus:ring-2 focus:ring-x-accent focus:border-transparent"
        />
      )}
    </div>
  );
}

/**
 * Keyword list management with add/remove functionality
 */
function KeywordInput({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const keyword = inputValue.trim().toLowerCase();
      if (!keywords.includes(keyword)) {
        onChange([...keywords, keyword]);
      }
      setInputValue('');
    }
  };

  const removeKeyword = (keywordToRemove: string) => {
    onChange(keywords.filter((k) => k !== keywordToRemove));
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add keyword and press Enter"
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800 text-x-text-light dark:text-x-text-dark
          focus:outline-none focus:ring-2 focus:ring-x-accent focus:border-transparent"
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium
                rounded-full bg-gray-100 dark:bg-gray-800 text-x-text-light dark:text-x-text-dark"
            >
              {keyword}
              <button
                type="button"
                onClick={() => removeKeyword(keyword)}
                className="w-4 h-4 flex items-center justify-center rounded-full
                  hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label={`Remove ${keyword}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Filter Controls component for Side Panel
 * Allows users to configure all filter settings with immediate application
 */
export function FilterControls() {
  const { settings, update, loading } = useFilterSettings();

  if (loading || !settings) {
    return (
      <div className="p-4 text-sm text-x-secondary-light dark:text-x-secondary-dark">
        Loading filter settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Master toggle for filters */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
          Enable Filtering
        </span>
        <ToggleSwitch
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </div>

      {settings.enabled && (
        <>
          {/* Views per minute threshold */}
          <NumberInput
            label="Min views/min"
            value={settings.minViewsPerMinute}
            onChange={(v) => update({ minViewsPerMinute: v })}
            placeholder="e.g., 10"
            min={0}
          />

          {/* Max replies threshold */}
          <NumberInput
            label="Max replies"
            value={settings.maxReplies}
            onChange={(v) => update({ maxReplies: v })}
            placeholder="e.g., 100"
            min={0}
          />

          {/* Max age threshold */}
          <NumberInput
            label="Max age (hours)"
            value={settings.maxAgeHours}
            onChange={(v) => update({ maxAgeHours: v })}
            placeholder="e.g., 24"
            min={1}
          />

          {/* Keyword filter section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-x-text-light dark:text-x-text-dark">
              Keywords
            </label>
            <ToggleGroup
              options={['off', 'allowlist', 'blocklist'] as const}
              value={settings.keywordMode}
              onChange={(mode) => update({ keywordMode: mode as KeywordMode })}
              labels={{ off: 'Off', allowlist: 'Show only', blocklist: 'Hide' }}
            />
            {settings.keywordMode !== 'off' && (
              <KeywordInput
                keywords={settings.keywords}
                onChange={(keywords) => update({ keywords })}
              />
            )}
          </div>

          {/* Hide method selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-x-text-light dark:text-x-text-dark">
              Hidden posts
            </label>
            <ToggleGroup
              options={['hide', 'dim', 'overlay'] as const}
              value={settings.hideMethod}
              onChange={(method) => update({ hideMethod: method as HideMethod })}
              labels={{ hide: 'Hide', dim: 'Dim', overlay: 'Overlay' }}
            />
          </div>

          {/* Show filter reason toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-x-text-light dark:text-x-text-dark">
              Show filter reason
            </span>
            <ToggleSwitch
              checked={settings.showFilterReason}
              onChange={(show) => update({ showFilterReason: show })}
            />
          </div>
        </>
      )}
    </div>
  );
}
