import type { ExtensionSettings } from '../types/settings';
import type { FilterSettings } from '../types/filters';
import type { BadgeSettings } from '../types/metrics';
import type { CaptureSettings } from '../types/capture';
import type { AiDetectionSettings } from '../types/ai-detection';
import type { ComposerSettings } from '../types/composer';
import type { AiDrafterSettings, ContextSnippet } from '../types/ai-drafter';
import { DEFAULT_AI_DRAFTER_SETTINGS, CONTEXT_BASKET_LIMIT } from '../types/ai-drafter';
import { DEFAULT_FILTER_SETTINGS } from '../types/filters';
import { DEFAULT_BADGE_SETTINGS } from '../types/metrics';
import { DEFAULT_CAPTURE_SETTINGS } from '../types/capture';
import { DEFAULT_AI_DETECTION_SETTINGS } from '../types/ai-detection';
import { DEFAULT_COMPOSER_SETTINGS } from '../types/composer';

/**
 * Default settings for Postweaver
 * Note: enabled is false by default (opt-in activation per CONTEXT.md)
 */
export const DEFAULTS: ExtensionSettings = {
  enabled: false,
  theme: 'auto',
  features: {
    textFormatting: false,
    feedFiltering: false,
    engagementMetrics: false,
    dataCapture: true, // Enabled by default - capture starts when accordion accessed
    aiDetection: true, // Enabled by default
    composer: true, // Enabled by default - composer with character count and templates
  },
  version: '0.1.0',
  lastUpdated: Date.now(),
};

const STORAGE_KEY = 'postweaver_settings';
const FILTER_STORAGE_KEY = 'postweaver_filters';
const BADGE_STORAGE_KEY = 'postweaver_badges';
const CAPTURE_STORAGE_KEY = 'postweaver_capture';
const AI_DETECTION_STORAGE_KEY = 'postweaver_ai_detection';
const COMPOSER_STORAGE_KEY = 'postweaver_composer';
const AI_DRAFTER_STORAGE_KEY = 'postweaver_ai_drafter';
const CONTEXT_BASKET_KEY = 'postweaver_context_basket';

// ============================================================================
// Context Basket Storage (hand-picked posts used as extra drafting context)
// ============================================================================

export async function getContextBasket(): Promise<ContextSnippet[]> {
  const result = await chrome.storage.local.get(CONTEXT_BASKET_KEY);
  return (result[CONTEXT_BASKET_KEY] as ContextSnippet[] | undefined) ?? [];
}

/**
 * Add a snippet to the basket (deduped by id, capped at the limit — oldest
 * dropped first). Returns the new basket.
 */
export async function addToContextBasket(
  snippet: Omit<ContextSnippet, 'id' | 'addedAt'>
): Promise<ContextSnippet[]> {
  const id = `${snippet.authorHandle}:${simpleHash(snippet.text)}`;
  const basket = await getContextBasket();
  if (basket.some((s) => s.id === id)) return basket;

  const next = [...basket, { ...snippet, id, addedAt: Date.now() }];
  while (next.length > CONTEXT_BASKET_LIMIT) next.shift();
  await chrome.storage.local.set({ [CONTEXT_BASKET_KEY]: next });
  return next;
}

export async function removeFromContextBasket(id: string): Promise<ContextSnippet[]> {
  const basket = (await getContextBasket()).filter((s) => s.id !== id);
  await chrome.storage.local.set({ [CONTEXT_BASKET_KEY]: basket });
  return basket;
}

export async function clearContextBasket(): Promise<void> {
  await chrome.storage.local.set({ [CONTEXT_BASKET_KEY]: [] });
}

export function subscribeToContextBasket(
  callback: (basket: ContextSnippet[]) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(CONTEXT_BASKET_KEY in changes)) return;
    callback((changes[CONTEXT_BASKET_KEY]?.newValue as ContextSnippet[] | undefined) ?? []);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Tiny non-crypto hash for snippet identity */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Get current extension settings from chrome.storage.local
 * Always merges with DEFAULTS to handle missing keys from migrations
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

  if (!stored) {
    return { ...DEFAULTS };
  }

  // Deep merge to handle nested features object
  return {
    ...DEFAULTS,
    ...stored,
    features: {
      ...DEFAULTS.features,
      ...stored.features,
    },
  };
}

/**
 * Update extension settings with partial updates
 * Merges with existing settings and updates lastUpdated timestamp
 */
export async function updateSettings(
  updates: Partial<ExtensionSettings>
): Promise<void> {
  const current = await getSettings();

  const newSettings: ExtensionSettings = {
    ...current,
    ...updates,
    features: {
      ...current.features,
      ...updates.features,
    },
    lastUpdated: Date.now(),
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: newSettings });
}

/**
 * Reset all settings to defaults
 */
export async function resetSettings(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...DEFAULTS, lastUpdated: Date.now() },
  });
}

/**
 * Subscribe to settings changes
 * Callback is invoked whenever settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToSettings(
  callback: (settings: ExtensionSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: ExtensionSettings = {
        ...DEFAULTS,
        ...change.newValue,
        features: {
          ...DEFAULTS.features,
          ...change.newValue.features,
        },
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// AI Drafter Settings Storage
// ============================================================================

/**
 * Get current AI drafter settings from chrome.storage.local
 * Always merges with DEFAULT_AI_DRAFTER_SETTINGS to handle missing keys from migrations
 */
export async function getAiDrafterSettings(): Promise<AiDrafterSettings> {
  const result = await chrome.storage.local.get(AI_DRAFTER_STORAGE_KEY);
  const stored = result[AI_DRAFTER_STORAGE_KEY] as Partial<AiDrafterSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_AI_DRAFTER_SETTINGS };
  }

  // Deep merge to handle nested contextDefaults object
  return {
    ...DEFAULT_AI_DRAFTER_SETTINGS,
    ...stored,
    contextDefaults: {
      ...DEFAULT_AI_DRAFTER_SETTINGS.contextDefaults,
      ...stored.contextDefaults,
    },
  };
}

/**
 * Update AI drafter settings with partial updates
 * Merges with existing settings
 */
export async function updateAiDrafterSettings(
  updates: Partial<AiDrafterSettings>
): Promise<void> {
  const current = await getAiDrafterSettings();

  const newSettings: AiDrafterSettings = {
    ...current,
    ...updates,
    contextDefaults: {
      ...current.contextDefaults,
      ...updates.contextDefaults,
    },
  };

  await chrome.storage.local.set({ [AI_DRAFTER_STORAGE_KEY]: newSettings });
}

/**
 * Subscribe to AI drafter settings changes
 * Callback is invoked whenever AI drafter settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToAiDrafterSettings(
  callback: (settings: AiDrafterSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(AI_DRAFTER_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[AI_DRAFTER_STORAGE_KEY];
    if (change?.newValue) {
      const settings: AiDrafterSettings = {
        ...DEFAULT_AI_DRAFTER_SETTINGS,
        ...change.newValue,
        contextDefaults: {
          ...DEFAULT_AI_DRAFTER_SETTINGS.contextDefaults,
          ...change.newValue.contextDefaults,
        },
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// Filter Settings Storage
// ============================================================================

/**
 * Get current filter settings from chrome.storage.local
 * Always merges with DEFAULT_FILTER_SETTINGS to handle missing keys from migrations
 */
export async function getFilterSettings(): Promise<FilterSettings> {
  const result = await chrome.storage.local.get(FILTER_STORAGE_KEY);
  const stored = result[FILTER_STORAGE_KEY] as Partial<FilterSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_FILTER_SETTINGS };
  }

  // Merge with defaults to handle any missing keys
  return {
    ...DEFAULT_FILTER_SETTINGS,
    ...stored,
    // Ensure keywords array exists
    keywords: stored.keywords ?? DEFAULT_FILTER_SETTINGS.keywords,
  };
}

/**
 * Update filter settings with partial updates
 * Merges with existing settings
 */
export async function updateFilterSettings(
  updates: Partial<FilterSettings>
): Promise<void> {
  const current = await getFilterSettings();

  const newSettings: FilterSettings = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({ [FILTER_STORAGE_KEY]: newSettings });
}

/**
 * Reset filter settings to defaults
 */
export async function resetFilterSettings(): Promise<void> {
  await chrome.storage.local.set({
    [FILTER_STORAGE_KEY]: { ...DEFAULT_FILTER_SETTINGS },
  });
}

/**
 * Subscribe to filter settings changes
 * Callback is invoked whenever filter settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToFilterSettings(
  callback: (settings: FilterSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(FILTER_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[FILTER_STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: FilterSettings = {
        ...DEFAULT_FILTER_SETTINGS,
        ...change.newValue,
        keywords: change.newValue.keywords ?? DEFAULT_FILTER_SETTINGS.keywords,
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// Badge Settings Storage
// ============================================================================

/**
 * Get current badge settings from chrome.storage.local
 * Always merges with DEFAULT_BADGE_SETTINGS to handle missing keys from migrations
 */
export async function getBadgeSettings(): Promise<BadgeSettings> {
  const result = await chrome.storage.local.get(BADGE_STORAGE_KEY);
  const stored = result[BADGE_STORAGE_KEY] as Partial<BadgeSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_BADGE_SETTINGS };
  }

  // Merge with defaults to handle any missing keys
  return {
    ...DEFAULT_BADGE_SETTINGS,
    ...stored,
    // Deep merge thresholds
    thresholds: {
      ...DEFAULT_BADGE_SETTINGS.thresholds,
      ...stored.thresholds,
    },
  };
}

/**
 * Update badge settings with partial updates
 * Merges with existing settings
 */
export async function updateBadgeSettings(
  updates: Partial<BadgeSettings>
): Promise<void> {
  const current = await getBadgeSettings();

  const newSettings: BadgeSettings = {
    ...current,
    ...updates,
    // Deep merge thresholds if provided
    thresholds: {
      ...current.thresholds,
      ...updates.thresholds,
    },
  };

  await chrome.storage.local.set({ [BADGE_STORAGE_KEY]: newSettings });
}

/**
 * Reset badge settings to defaults
 */
export async function resetBadgeSettings(): Promise<void> {
  await chrome.storage.local.set({
    [BADGE_STORAGE_KEY]: { ...DEFAULT_BADGE_SETTINGS },
  });
}

/**
 * Subscribe to badge settings changes
 * Callback is invoked whenever badge settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToBadgeSettings(
  callback: (settings: BadgeSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(BADGE_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[BADGE_STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: BadgeSettings = {
        ...DEFAULT_BADGE_SETTINGS,
        ...change.newValue,
        thresholds: {
          ...DEFAULT_BADGE_SETTINGS.thresholds,
          ...change.newValue.thresholds,
        },
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// Capture Settings Storage
// ============================================================================

/**
 * Get current capture settings from chrome.storage.local
 * Always merges with DEFAULT_CAPTURE_SETTINGS to handle missing keys from migrations
 */
export async function getCaptureSettings(): Promise<CaptureSettings> {
  const result = await chrome.storage.local.get(CAPTURE_STORAGE_KEY);
  const stored = result[CAPTURE_STORAGE_KEY] as Partial<CaptureSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_CAPTURE_SETTINGS };
  }

  // Merge with defaults to handle any missing keys
  return {
    ...DEFAULT_CAPTURE_SETTINGS,
    ...stored,
  };
}

/**
 * Update capture settings with partial updates
 * Merges with existing settings
 */
export async function updateCaptureSettings(
  updates: Partial<CaptureSettings>
): Promise<void> {
  const current = await getCaptureSettings();

  const newSettings: CaptureSettings = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({ [CAPTURE_STORAGE_KEY]: newSettings });
}

/**
 * Reset capture settings to defaults
 */
export async function resetCaptureSettings(): Promise<void> {
  await chrome.storage.local.set({
    [CAPTURE_STORAGE_KEY]: { ...DEFAULT_CAPTURE_SETTINGS },
  });
}

/**
 * Subscribe to capture settings changes
 * Callback is invoked whenever capture settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToCaptureSettings(
  callback: (settings: CaptureSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(CAPTURE_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[CAPTURE_STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: CaptureSettings = {
        ...DEFAULT_CAPTURE_SETTINGS,
        ...change.newValue,
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// AI Detection Settings Storage
// ============================================================================

/**
 * Get current AI detection settings from chrome.storage.local
 * Always merges with DEFAULT_AI_DETECTION_SETTINGS to handle missing keys from migrations
 */
export async function getAiDetectionSettings(): Promise<AiDetectionSettings> {
  const result = await chrome.storage.local.get(AI_DETECTION_STORAGE_KEY);
  const stored = result[AI_DETECTION_STORAGE_KEY] as Partial<AiDetectionSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_AI_DETECTION_SETTINGS };
  }

  // Merge with defaults to handle any missing keys
  return {
    ...DEFAULT_AI_DETECTION_SETTINGS,
    ...stored,
  };
}

/**
 * Update AI detection settings with partial updates
 * Merges with existing settings
 */
export async function updateAiDetectionSettings(
  updates: Partial<AiDetectionSettings>
): Promise<void> {
  const current = await getAiDetectionSettings();

  const newSettings: AiDetectionSettings = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({ [AI_DETECTION_STORAGE_KEY]: newSettings });
}

/**
 * Reset AI detection settings to defaults
 */
export async function resetAiDetectionSettings(): Promise<void> {
  await chrome.storage.local.set({
    [AI_DETECTION_STORAGE_KEY]: { ...DEFAULT_AI_DETECTION_SETTINGS },
  });
}

/**
 * Subscribe to AI detection settings changes
 * Callback is invoked whenever AI detection settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToAiDetectionSettings(
  callback: (settings: AiDetectionSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(AI_DETECTION_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[AI_DETECTION_STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: AiDetectionSettings = {
        ...DEFAULT_AI_DETECTION_SETTINGS,
        ...change.newValue,
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// Composer Settings Storage
// ============================================================================

/**
 * Get current composer settings from chrome.storage.local
 * Always merges with DEFAULT_COMPOSER_SETTINGS to handle missing keys from migrations
 */
export async function getComposerSettings(): Promise<ComposerSettings> {
  const result = await chrome.storage.local.get(COMPOSER_STORAGE_KEY);
  const stored = result[COMPOSER_STORAGE_KEY] as Partial<ComposerSettings> | undefined;

  if (!stored) {
    return { ...DEFAULT_COMPOSER_SETTINGS };
  }

  // Merge with defaults to handle any missing keys
  return {
    ...DEFAULT_COMPOSER_SETTINGS,
    ...stored,
  };
}

/**
 * Update composer settings with partial updates
 * Merges with existing settings
 */
export async function updateComposerSettings(
  updates: Partial<ComposerSettings>
): Promise<void> {
  const current = await getComposerSettings();

  const newSettings: ComposerSettings = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({ [COMPOSER_STORAGE_KEY]: newSettings });
}

/**
 * Reset composer settings to defaults
 */
export async function resetComposerSettings(): Promise<void> {
  await chrome.storage.local.set({
    [COMPOSER_STORAGE_KEY]: { ...DEFAULT_COMPOSER_SETTINGS },
  });
}

/**
 * Subscribe to composer settings changes
 * Callback is invoked whenever composer settings are updated (from any context)
 * Returns unsubscribe function
 */
export function subscribeToComposerSettings(
  callback: (settings: ComposerSettings) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local' || !(COMPOSER_STORAGE_KEY in changes)) {
      return;
    }

    const change = changes[COMPOSER_STORAGE_KEY];
    if (change?.newValue) {
      // Merge with defaults to handle any missing keys
      const settings: ComposerSettings = {
        ...DEFAULT_COMPOSER_SETTINGS,
        ...change.newValue,
      };
      callback(settings);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
