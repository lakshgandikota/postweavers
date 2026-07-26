import { useState, useEffect } from 'react';
import type { BadgeSettings } from '../types/metrics';
import {
  getBadgeSettings,
  updateBadgeSettings,
  subscribeToBadgeSettings,
} from '../lib/storage';

/**
 * Hook to manage badge settings with real-time sync
 */
function useBadgeSettings() {
  const [settings, setSettings] = useState<BadgeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBadgeSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    const unsubscribe = subscribeToBadgeSettings(setSettings);
    return unsubscribe;
  }, []);

  const update = async (updates: Partial<BadgeSettings>) => {
    await updateBadgeSettings(updates);
  };

  return { settings, update, loading };
}

/**
 * Toggle switch component for badge controls
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
 * Numeric threshold input component
 */
function ThresholdInput({
  label,
  value,
  onChange,
  helperText,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helperText: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-x-text-light dark:text-x-text-dark">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          if (!isNaN(num) && num >= 0) onChange(num);
        }}
        min={0}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800 text-x-text-light dark:text-x-text-dark
          focus:outline-none focus:ring-2 focus:ring-x-accent focus:border-transparent"
      />
      <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
        {helperText}
      </p>
    </div>
  );
}

/**
 * Badge Controls component for Side Panel
 * Allows users to enable/disable badges and configure tier thresholds
 */
export function BadgeControls() {
  const { settings, update, loading } = useBadgeSettings();

  if (loading || !settings) {
    return (
      <div className="p-4 text-sm text-x-secondary-light dark:text-x-secondary-dark">
        Loading badge settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Master toggle for badges */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
          Enable Badges
        </span>
        <ToggleSwitch
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </div>

      {settings.enabled && (
        <>
          {/* Show/hide badges toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-x-text-light dark:text-x-text-dark">
              Show badges on posts
            </span>
            <ToggleSwitch
              checked={settings.showBadges}
              onChange={(showBadges) => update({ showBadges })}
            />
          </div>

          {/* Tier thresholds section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-x-text-light dark:text-x-text-dark">
              Performance Tiers
            </label>

            <ThresholdInput
              label="Low threshold"
              value={settings.thresholds.low}
              onChange={(low) => update({
                thresholds: { ...settings.thresholds, low }
              })}
              helperText="Below this = red badge"
            />

            <ThresholdInput
              label="Medium threshold"
              value={settings.thresholds.medium}
              onChange={(medium) => update({
                thresholds: { ...settings.thresholds, medium }
              })}
              helperText="Below this = yellow, above = green"
            />

            {/* Visual tier preview */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Preview:
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                Low
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300">
                Medium
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                High
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
