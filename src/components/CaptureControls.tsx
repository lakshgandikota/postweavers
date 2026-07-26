import { useState, useEffect, useCallback } from 'react';
import type { CaptureSettings } from '../types/capture';
import {
  getCaptureSettings,
  updateCaptureSettings,
  subscribeToCaptureSettings,
} from '../lib/storage';
import {
  exportTweetsAsJSON,
  exportTweetsAsCSV,
  exportProfilesAsJSON,
  clearAllData,
  getStorageStats,
  getTweetsCapturedToday,
} from '../lib/db';

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * CaptureControls component for data capture settings
 */
export function CaptureControls() {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [stats, setStats] = useState<{
    tweetsToday: number;
    totalTweets: number;
    totalProfiles: number;
    storageUsed: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load settings and stats
  useEffect(() => {
    getCaptureSettings().then(setSettings);
    loadStats();

    const unsubscribe = subscribeToCaptureSettings(setSettings);
    return () => unsubscribe();
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(loadStats, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [storageStats, ownToday, othersToday] = await Promise.all([
        getStorageStats(),
        getTweetsCapturedToday(true),
        getTweetsCapturedToday(false),
      ]);

      setStats({
        tweetsToday: ownToday + othersToday,
        totalTweets: storageStats.tweetsCount,
        totalProfiles: storageStats.profilesCount,
        storageUsed: formatBytes(storageStats.storageUsedBytes),
      });
    } catch (error) {
      console.error('[Postweaver] Failed to load capture stats:', error);
    }
  }, []);

  const handleToggle = useCallback(
    (key: keyof CaptureSettings, value: boolean) => {
      updateCaptureSettings({ [key]: value });
    },
    []
  );

  const handleExport = useCallback(
    async (type: 'tweets-json' | 'tweets-csv' | 'profiles-json') => {
      setIsExporting(true);
      try {
        switch (type) {
          case 'tweets-json':
            await exportTweetsAsJSON();
            break;
          case 'tweets-csv':
            await exportTweetsAsCSV();
            break;
          case 'profiles-json':
            await exportProfilesAsJSON();
            break;
        }
      } catch (error) {
        console.error('[Postweaver] Export failed:', error);
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const handleClearData = useCallback(async () => {
    try {
      await clearAllData();
      setShowClearConfirm(false);
      loadStats();
    } catch (error) {
      console.error('[Postweaver] Clear data failed:', error);
    }
  }, [loadStats]);

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-4 h-4 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Display */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
            Status
          </span>
          <span
            className={`text-xs font-medium ${settings.enabled ? 'text-green-600 dark:text-green-500' : 'text-orange-600 dark:text-orange-500'}`}
          >
            {settings.enabled ? 'Capturing' : 'Paused'}
          </span>
        </div>
        {stats && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Tweets today
              </span>
              <span className="text-xs font-medium text-x-text-light dark:text-x-text-dark">
                {stats.tweetsToday.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Total tweets
              </span>
              <span className="text-xs font-medium text-x-text-light dark:text-x-text-dark">
                {stats.totalTweets.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Profiles
              </span>
              <span className="text-xs font-medium text-x-text-light dark:text-x-text-dark">
                {stats.totalProfiles.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
                Storage used
              </span>
              <span className="text-xs font-medium text-x-text-light dark:text-x-text-dark">
                {stats.storageUsed}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between py-2">
        <div>
          <span className="text-sm text-x-text-light dark:text-x-text-dark">
            Enable Capture
          </span>
          <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
            Capture tweets from your feed
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => handleToggle('enabled', !settings.enabled)}
          className={`
            relative inline-flex w-11 h-6 shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-x-accent focus:ring-offset-2
            ${settings.enabled ? 'bg-x-accent' : 'bg-gray-200 dark:bg-gray-700'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block w-5 h-5 rounded-full bg-white shadow-lg ring-0
              transition duration-200 ease-in-out
              ${settings.enabled ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* Capture Options */}
      <div className="space-y-2 border-t border-x-border-light dark:border-x-border-dark pt-3">
        <CaptureToggle
          label="Own tweets"
          description="Capture your own posts"
          checked={settings.captureOwnTweets}
          onChange={(v) => handleToggle('captureOwnTweets', v)}
          disabled={!settings.enabled}
        />
        <CaptureToggle
          label="Others' tweets"
          description="Capture tweets from others"
          checked={settings.captureOthersTweets}
          onChange={(v) => handleToggle('captureOthersTweets', v)}
          disabled={!settings.enabled}
        />
        <CaptureToggle
          label="Profiles"
          description="Capture profile data"
          checked={settings.captureProfiles}
          onChange={(v) => handleToggle('captureProfiles', v)}
          disabled={!settings.enabled}
        />
      </div>

      {/* Retention Setting */}
      <div className="border-t border-x-border-light dark:border-x-border-dark pt-3">
        <label className="block text-sm text-x-text-light dark:text-x-text-dark mb-1">
          Data retention
        </label>
        <select
          value={settings.retentionDays}
          onChange={(e) =>
            updateCaptureSettings({ retentionDays: parseInt(e.target.value, 10) })
          }
          className="w-full px-3 py-2 text-sm rounded-lg border border-x-border-light dark:border-x-border-dark bg-white dark:bg-gray-800 text-x-text-light dark:text-x-text-dark focus:outline-none focus:ring-2 focus:ring-x-accent"
        >
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>1 year</option>
          <option value={730}>2 years</option>
        </select>
        <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark mt-1">
          Older data is automatically deleted
        </p>
      </div>

      {/* Export Buttons */}
      <div className="border-t border-x-border-light dark:border-x-border-dark pt-3 space-y-2">
        <label className="block text-sm text-x-text-light dark:text-x-text-dark mb-2">
          Export data
        </label>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            onClick={() => handleExport('tweets-json')}
            disabled={isExporting}
          >
            Tweets (JSON)
          </ExportButton>
          <ExportButton
            onClick={() => handleExport('tweets-csv')}
            disabled={isExporting}
          >
            Tweets (CSV)
          </ExportButton>
          <ExportButton
            onClick={() => handleExport('profiles-json')}
            disabled={isExporting}
          >
            Profiles (JSON)
          </ExportButton>
        </div>
      </div>

      {/* Clear Data Button */}
      <div className="border-t border-x-border-light dark:border-x-border-dark pt-3">
        {!showClearConfirm ? (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            Clear All Data
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">
              This will permanently delete all captured tweets and profiles.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClearData}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-3 py-2 text-sm font-medium text-x-text-light dark:text-x-text-dark bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Toggle component for capture options
 */
function CaptureToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${disabled ? 'opacity-50' : ''}`}
    >
      <div>
        <span className="text-sm text-x-text-light dark:text-x-text-dark">
          {label}
        </span>
        <p className="text-xs text-x-secondary-light dark:text-x-secondary-dark">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-x-accent focus:ring-offset-2
          ${checked ? 'bg-x-accent' : 'bg-gray-200 dark:bg-gray-700'}
          ${disabled ? 'cursor-not-allowed' : ''}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block w-4 h-4 rounded-full bg-white shadow ring-0
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

/**
 * Export button component
 */
function ExportButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        px-3 py-1.5 text-xs font-medium rounded-lg border border-x-border-light dark:border-x-border-dark
        text-x-text-light dark:text-x-text-dark bg-white dark:bg-gray-800
        hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  );
}
