import { useState, useEffect } from 'react';
import type { AiDetectionSettings } from '../types/ai-detection';
import {
  getAiDetectionSettings,
  updateAiDetectionSettings,
  subscribeToAiDetectionSettings,
} from '../lib/storage';
import { renderAiBadgeHTML } from '../lib/ai-detection/ai-badge-renderer';

/**
 * Hook to manage AI detection settings with real-time sync
 */
function useAiDetectionSettings() {
  const [settings, setSettings] = useState<AiDetectionSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAiDetectionSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    const unsubscribe = subscribeToAiDetectionSettings(setSettings);
    return unsubscribe;
  }, []);

  const update = async (updates: Partial<AiDetectionSettings>) => {
    await updateAiDetectionSettings(updates);
  };

  return { settings, update, loading };
}

/**
 * Toggle switch component for AI detection controls
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
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        w-11 h-6
        ${checked ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700'}
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
 * Threshold slider component with labels
 */
function ThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const labels = [
    { value: 0.5, label: 'Sensitive' },
    { value: 0.7, label: 'Balanced' },
    { value: 0.9, label: 'Conservative' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-x-text-light dark:text-x-text-dark">
          Detection threshold
        </label>
        <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
          {Math.round(value * 100)}%
        </span>
      </div>

      <input
        type="range"
        min="0.5"
        max="0.9"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
      />

      <div className="flex justify-between text-xs text-x-secondary-light dark:text-x-secondary-dark">
        {labels.map((item) => (
          <span key={item.value}>{item.label}</span>
        ))}
      </div>

      <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
        Higher threshold = fewer false positives, more AI replies may be missed
      </p>
    </div>
  );
}

/**
 * AI Detection Controls component for Side Panel
 * Allows users to enable/disable AI detection and configure threshold
 */
export function AiDetectionControls() {
  const { settings, update, loading } = useAiDetectionSettings();

  if (loading || !settings) {
    return (
      <div className="p-4 text-sm text-x-secondary-light dark:text-x-secondary-dark">
        Loading AI detection settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Master toggle for AI detection */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
          Enable AI Detection
        </span>
        <ToggleSwitch
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </div>

      {settings.enabled && (
        <>
          {/* Threshold slider */}
          <ThresholdSlider
            value={settings.threshold}
            onChange={(threshold) => update({ threshold })}
          />

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

          {/* Badge preview */}
          {settings.showBadges && (
            <div className="pt-2 border-t border-x-border-light dark:border-x-border-dark">
              <div className="flex items-center gap-2">
                <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                  Badge preview:
                </span>
                <span
                  dangerouslySetInnerHTML={{ __html: renderAiBadgeHTML(0.85) }}
                />
              </div>
              <p className="mt-2 text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Detects replies to your posts that may be AI-generated
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
