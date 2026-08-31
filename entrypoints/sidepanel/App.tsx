import { useState, useEffect } from 'react';
import { useSettings } from '../../src/hooks/useSettings';
import { useTheme } from '../../src/hooks/useTheme';
import { FilterControls } from '../../src/components/FilterControls';
import { BadgeControls } from '../../src/components/BadgeControls';
import { CaptureControls } from '../../src/components/CaptureControls';
import { AiDetectionControls } from '../../src/components/AiDetectionControls';
import { AnalyticsDashboard } from '../../src/components/analytics';
import { AiReplyPanel, DrafterSettings, SyncAccount } from '../../src/components/drafter';
import { ContextPanel } from '../../src/components/context';
import {
  getAiDrafterSettings,
  updateAiDrafterSettings,
  subscribeToAiDrafterSettings,
} from '../../src/lib/storage';
import type { AiDrafterSettings } from '../../src/types/ai-drafter';

/**
 * Collapsible section component for organizing settings
 */
function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-x-border-light dark:border-x-border-dark">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      >
        <span className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
          {title}
        </span>
        <svg
          className={`w-4 h-4 text-x-secondary-light dark:text-x-secondary-dark transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/**
 * Toggle switch component
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'default',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'default' | 'large';
}) {
  const sizeClasses = size === 'large' ? 'w-14 h-8' : 'w-11 h-6';
  const dotSizeClasses = size === 'large' ? 'w-6 h-6' : 'w-5 h-5';
  const translateClasses = size === 'large' ? 'translate-x-6' : 'translate-x-5';

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
        ${checked ? 'bg-x-accent' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${sizeClasses}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow-lg ring-0
          transition duration-200 ease-in-out
          ${checked ? translateClasses : 'translate-x-0'}
          ${dotSizeClasses}
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
 * Feature toggle row with label and coming soon badge
 */
function FeatureToggle({
  label,
  enabled,
  onChange,
  comingSoon = false,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-x-text-light dark:text-x-text-dark">{label}</span>
        {comingSoon && (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-800 text-x-secondary-light dark:text-x-secondary-dark">
            Soon
          </span>
        )}
      </div>
      <ToggleSwitch checked={enabled} onChange={onChange} disabled={comingSoon} />
    </div>
  );
}

/**
 * Self-loading wrapper so the drafter settings can live in the Settings tab
 * without spinning up the whole drafter hook (streaming, target, etc.).
 */
function AiDraftingSettings() {
  const [drafterSettings, setDrafterSettings] = useState<AiDrafterSettings | null>(null);

  useEffect(() => {
    getAiDrafterSettings().then(setDrafterSettings);
    return subscribeToAiDrafterSettings(setDrafterSettings);
  }, []);

  if (!drafterSettings) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-5 h-5 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <DrafterSettings settings={drafterSettings} onUpdate={updateAiDrafterSettings} />;
}

/** Same self-loading pattern for the Context tab (persona lives in drafter settings) */
function ContextTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [drafterSettings, setDrafterSettings] = useState<AiDrafterSettings | null>(null);

  useEffect(() => {
    getAiDrafterSettings().then(setDrafterSettings);
    return subscribeToAiDrafterSettings(setDrafterSettings);
  }, []);

  if (!drafterSettings) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-5 h-5 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ContextPanel
      settings={drafterSettings}
      onUpdateSettings={updateAiDrafterSettings}
      onOpenSettings={onOpenSettings}
    />
  );
}

/**
 * Side panel App component
 * Notion-like clean sidebar with collapsible sections
 */
export default function App() {
  const { settings, update, loading } = useSettings();
  const { theme, loading: themeLoading } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activePanel, setActivePanel] = useState<'settings' | 'composer' | 'context'>('composer');

  // Apply theme class to document
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const effectiveTheme = settings.theme === 'auto' ? theme : settings.theme;
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
  }, [settings.theme, theme, mounted]);

  // Listen for COMPOSE_FOCUSED message to auto-switch to Composer tab
  useEffect(() => {
    const handleMessage = (message: { type: string; context?: unknown }) => {
      if (message.type === 'COMPOSE_FOCUSED') {
        // Check if auto-switch is enabled (from composer settings)
        // For now, always switch - settings check will be added
        setActivePanel('composer');
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  if (loading || themeLoading) {
    return (
      <div className="min-h-screen bg-x-bg-light dark:bg-x-bg-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-x-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const effectiveTheme = settings.theme === 'auto' ? theme : settings.theme;

  return (
    <div className={`min-h-screen flex flex-col bg-x-bg-light dark:bg-x-bg-dark ${effectiveTheme === 'dark' ? 'dark' : ''}`}>
      {/* Header with tabs - Sticky. No logo row: Chrome's side-panel chrome
          already shows the "Postweaver" title above this. */}
      <header className="sticky top-0 z-10 border-b border-x-border-light dark:border-x-border-dark bg-x-bg-light dark:bg-x-bg-dark">
        {/* Tab navigation */}
        <div className="flex">
          {(
            [
              { id: 'composer', label: 'Composer' },
              { id: 'context', label: 'Context' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activePanel === id
                  ? 'text-x-text-light dark:text-x-text-dark border-x-accent'
                  : 'text-x-secondary-light dark:text-x-secondary-dark border-transparent hover:text-x-text-light dark:hover:text-x-text-dark'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto">
        {activePanel === 'settings' && (
          <>
        {/* Master Toggle Section */}
        <div className="px-4 py-4 border-b border-x-border-light dark:border-x-border-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-x-text-light dark:text-x-text-dark">
                Extension Status
              </h2>
              <p className={`text-xs mt-0.5 ${settings.enabled ? 'text-green-600 dark:text-green-500' : 'text-x-secondary-light dark:text-x-secondary-dark'}`}>
                {settings.enabled ? 'Active' : 'Paused'}
              </p>
            </div>
            <ToggleSwitch
              checked={settings.enabled}
              onChange={(enabled) => update({ enabled })}
              size="large"
            />
          </div>
        </div>

        {/* Account Section */}
        <CollapsibleSection title="Account" defaultOpen={true}>
          <SyncAccount />
        </CollapsibleSection>

        {/* AI Drafting Section */}
        <CollapsibleSection title="AI Drafting" defaultOpen={true}>
          <AiDraftingSettings />
        </CollapsibleSection>

        {/* Appearance Section */}
        <CollapsibleSection title="Appearance" defaultOpen={false}>
          <div>
            <label className="block text-xs font-medium text-x-secondary-light dark:text-x-secondary-dark mb-2">
              Theme
            </label>
            <ToggleGroup
              options={['auto', 'light', 'dark'] as const}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              labels={{ auto: 'Auto', light: 'Light', dark: 'Dark' }}
            />
          </div>
        </CollapsibleSection>

        {/* Feed Filtering Section */}
        <CollapsibleSection title="Feed Filtering" defaultOpen={false}>
          <FilterControls />
        </CollapsibleSection>

        {/* Engagement Metrics Section */}
        <CollapsibleSection title="Engagement Metrics" defaultOpen={false}>
          <BadgeControls />
        </CollapsibleSection>

        {/* Data Capture Section */}
        <CollapsibleSection title="Data Capture" defaultOpen={false}>
          <CaptureControls />
        </CollapsibleSection>

        {/* AI Reply Detection Section */}
        <CollapsibleSection title="AI Reply Detection" defaultOpen={false}>
          <AiDetectionControls />
        </CollapsibleSection>

        {/* Analytics Dashboard Section */}
        <CollapsibleSection title="Analytics" defaultOpen={false}>
          <AnalyticsDashboard />
        </CollapsibleSection>

        {/* Features Section */}
        <CollapsibleSection title="Features" defaultOpen={true}>
          <div className="divide-y divide-x-border-light dark:divide-x-border-dark">
            <FeatureToggle
              label="Text Formatting"
              enabled={settings.features.textFormatting}
              onChange={(enabled) =>
                update({ features: { ...settings.features, textFormatting: enabled } })
              }
              comingSoon
            />
            <FeatureToggle
              label="Engagement Metrics"
              enabled={settings.features.engagementMetrics}
              onChange={(enabled) =>
                update({ features: { ...settings.features, engagementMetrics: enabled } })
              }
            />
          </div>
        </CollapsibleSection>
          </>
        )}
        {activePanel === 'composer' && (
          <div className="p-4">
            <AiReplyPanel
              onOpenSettings={() => setActivePanel('settings')}
              onOpenContext={() => setActivePanel('context')}
            />
          </div>
        )}
        {activePanel === 'context' && (
          <div className="p-4">
            <ContextTab onOpenSettings={() => setActivePanel('settings')} />
          </div>
        )}
      </main>

      {/* Footer - Sticky */}
      <footer className="sticky bottom-0 px-4 py-3 border-t border-x-border-light dark:border-x-border-dark bg-x-bg-light dark:bg-x-bg-dark">
        <div className="flex items-center justify-between text-xs text-x-secondary-light dark:text-x-secondary-dark">
          <span>v{settings.version}</span>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-mono">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Shift+S
            </kbd>
            <span>to toggle</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
