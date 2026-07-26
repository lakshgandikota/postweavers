// injectScript moved to interceptor-loader.content.ts
import type { ExtensionMessage } from '../src/types/messages';
import type { ExtensionSettings } from '../src/types/settings';
import { PostFilterEngine, NavigationDetector } from '../src/lib/filters';
import { MetricsBadgeEngine } from '../src/lib/metrics';
import { DataCaptureEngine } from '../src/lib/data-capture';
import { AiDetectionEngine } from '../src/lib/ai-detection/ai-detection-engine';
import { ComposeDetector, insertTemplateText, focusComposeBox } from '../src/lib/composer';
import { extractReplyTarget, DraftButtonInjector, ContextButtonInjector } from '../src/lib/ai-drafter';
import {
  getSettings,
  subscribeToSettings,
  getFilterSettings,
  subscribeToFilterSettings,
  getBadgeSettings,
  subscribeToBadgeSettings,
  getCaptureSettings,
  subscribeToCaptureSettings,
  getAiDetectionSettings,
  subscribeToAiDetectionSettings,
  getComposerSettings,
  subscribeToComposerSettings,
  getAiDrafterSettings,
  subscribeToAiDrafterSettings,
} from '../src/lib/storage';

/**
 * Track initialization state
 */
let isInitialized = false;

/**
 * Filter engine module-level state
 */
let filterEngine: PostFilterEngine | null = null;
let navigationDetector: NavigationDetector | null = null;
let unsubscribeFilters: (() => void) | null = null;

/**
 * Badge engine module-level state
 */
let badgeEngine: MetricsBadgeEngine | null = null;
let unsubscribeBadges: (() => void) | null = null;
let unsubscribeExtensionSettings: (() => void) | null = null;

/**
 * Capture engine module-level state
 */
let captureEngine: DataCaptureEngine | null = null;
let unsubscribeCapture: (() => void) | null = null;
// interceptorInjected flag moved to interceptor-loader.content.ts

/**
 * AI detection engine module-level state
 */
let aiDetectionEngine: AiDetectionEngine | null = null;
let unsubscribeAiDetection: (() => void) | null = null;

/**
 * Compose detector module-level state
 */
let composeDetector: ComposeDetector | null = null;
let unsubscribeComposer: (() => void) | null = null;

/**
 * AI draft button injector module-level state
 */
let draftButtonInjector: DraftButtonInjector | null = null;
let contextButtonInjector: ContextButtonInjector | null = null;
let unsubscribeAiDrafter: (() => void) | null = null;

/**
 * Initialize the extension on X.com
 * Called when extension is enabled
 */
async function initializeExtension(): Promise<void> {
  if (isInitialized) {
    console.log('[Postweaver] Already initialized, skipping');
    return;
  }

  console.log('[Postweaver] Initializing...');
  isInitialized = true;

  console.log('[Postweaver] Extension active on', window.location.hostname);

  // Initialize filter engine if on a filterable page
  await initializeFiltering();

  // Initialize badge engine
  await initializeBadges();

  // Initialize data capture
  await initializeCapture();

  // Initialize AI detection
  await initializeAiDetection();

  // Initialize composer
  await initializeComposer();

  // Initialize the in-page AI draft button
  await initializeAiDrafter();
}

/**
 * Initialize filter engine and navigation detection
 */
async function initializeFiltering(): Promise<void> {
  // Get filter settings
  const filterSettings = await getFilterSettings();
  console.log('[Postweaver] Filter settings loaded:', filterSettings.enabled);

  // Only initialize filtering on filterable pages
  if (!NavigationDetector.isFilterablePage()) {
    console.log('[Postweaver] Not a filterable page, skipping filter initialization');
    // Still set up navigation detector to detect when we navigate to a filterable page
    setupNavigationDetector();
    setupFilterSubscription();
    return;
  }

  // Create and initialize filter engine if filters are enabled
  if (filterSettings.enabled) {
    filterEngine = new PostFilterEngine(filterSettings);
    filterEngine.initialize();
    console.log('[Postweaver] Filter engine started');
  }

  // Set up navigation detector
  setupNavigationDetector();

  // Subscribe to filter settings changes
  setupFilterSubscription();
}

/**
 * Set up navigation detector to re-filter on page changes
 */
function setupNavigationDetector(): void {
  if (navigationDetector) {
    return; // Already set up
  }

  navigationDetector = new NavigationDetector(async () => {
    console.log('[Postweaver] Navigation detected');

    const isFilterable = NavigationDetector.isFilterablePage();
    const filterSettings = await getFilterSettings();
    const badgeSettings = await getBadgeSettings();
    const aiDetectionSettings = await getAiDetectionSettings();
    const extensionSettings = await getSettings();
    const badgeFeatureEnabled = extensionSettings.features.engagementMetrics;
    const aiDetectionFeatureEnabled = extensionSettings.features.aiDetection;

    // Handle filter engine lifecycle
    filterEngine = handleEngineLifecycle({
      isFilterable,
      engine: filterEngine,
      settings: filterSettings,
      isEnabled: (s) => s.enabled,
      createEngine: (s) => new PostFilterEngine(s),
      onReprocess: (e) => e.filterAllPosts(),
      engineName: 'filter engine',
    });

    // Handle badge engine lifecycle (requires both feature flag AND badge enabled)
    badgeEngine = handleEngineLifecycle({
      isFilterable,
      engine: badgeEngine,
      settings: badgeSettings,
      isEnabled: (s) => badgeFeatureEnabled && s.enabled,
      createEngine: (s) => new MetricsBadgeEngine(s),
      onReprocess: (e) => e.processAllPosts(),
      engineName: 'badge engine',
    });

    // Handle AI detection engine lifecycle (requires both feature flag AND AI detection enabled)
    aiDetectionEngine = handleEngineLifecycle({
      isFilterable,
      engine: aiDetectionEngine,
      settings: aiDetectionSettings,
      isEnabled: (s) => aiDetectionFeatureEnabled && s.enabled,
      createEngine: (s) => new AiDetectionEngine(s),
      onReprocess: (e) => e.processAllPosts(),
      engineName: 'AI detection engine',
    });
  });

  navigationDetector.initialize();
}

/**
 * Subscribe to filter settings changes
 */
function setupFilterSubscription(): void {
  if (unsubscribeFilters) {
    return; // Already subscribed
  }

  unsubscribeFilters = subscribeToFilterSettings((newSettings) => {
    console.log('[Postweaver] Filter settings changed:', newSettings);

    if (filterEngine) {
      if (newSettings.enabled) {
        // Engine exists, settings enabled - update settings
        filterEngine.updateSettings(newSettings);
      } else {
        // Engine exists, settings disabled - cleanup
        filterEngine.cleanup();
        filterEngine = null;
      }
    } else if (newSettings.enabled && NavigationDetector.isFilterablePage()) {
      // No engine, settings enabled, on filterable page - create engine
      filterEngine = new PostFilterEngine(newSettings);
      filterEngine.initialize();
    }
  });
}

/**
 * Initialize badge engine and subscription
 */
async function initializeBadges(): Promise<void> {
  const badgeSettings = await getBadgeSettings();
  const extensionSettings = await getSettings();

  // Check both feature flag AND badge-specific enabled flag
  const featureEnabled = extensionSettings.features.engagementMetrics;

  console.log('[Postweaver] Badge settings loaded:', {
    featureEnabled,
    badgeEnabled: badgeSettings.enabled,
  });

  if (!NavigationDetector.isFilterablePage()) {
    console.log('[Postweaver] Not a filterable page, skipping badge initialization');
    setupBadgeSubscription();
    setupExtensionSettingsSubscription();
    return;
  }

  // Only create engine if both feature flag AND badge settings are enabled
  if (featureEnabled && badgeSettings.enabled) {
    badgeEngine = new MetricsBadgeEngine(badgeSettings);
    badgeEngine.initialize();
    console.log('[Postweaver] Badge engine started');
  }

  setupBadgeSubscription();
  setupExtensionSettingsSubscription();
}

/**
 * Subscribe to badge settings changes
 */
function setupBadgeSubscription(): void {
  if (unsubscribeBadges) {
    return; // Already subscribed
  }

  unsubscribeBadges = subscribeToBadgeSettings(async (newSettings) => {
    console.log('[Postweaver] Badge settings changed:', newSettings);

    // Get current feature flag state
    const extensionSettings = await getSettings();
    const featureEnabled = extensionSettings.features.engagementMetrics;

    if (badgeEngine) {
      if (featureEnabled && newSettings.enabled) {
        // Engine exists, both enabled - update settings
        badgeEngine.updateSettings(newSettings);
      } else {
        // Engine exists, either disabled - cleanup
        badgeEngine.cleanup();
        badgeEngine = null;
      }
    } else if (featureEnabled && newSettings.enabled && NavigationDetector.isFilterablePage()) {
      // No engine, both enabled, on filterable page - create engine
      badgeEngine = new MetricsBadgeEngine(newSettings);
      badgeEngine.initialize();
    }
  });
}

/**
 * Subscribe to extension settings to handle feature flag changes
 */
function setupExtensionSettingsSubscription(): void {
  if (unsubscribeExtensionSettings) {
    return; // Already subscribed
  }

  unsubscribeExtensionSettings = subscribeToSettings((extensionSettings) => {
    const featureEnabled = extensionSettings.features.engagementMetrics;
    console.log('[Postweaver] Extension settings changed, engagementMetrics:', featureEnabled);

    getBadgeSettings().then((badgeSettings) => {
      if (badgeEngine && !featureEnabled) {
        // Feature disabled - cleanup engine
        console.log('[Postweaver] Feature disabled, cleaning up badge engine');
        badgeEngine.cleanup();
        badgeEngine = null;
      } else if (
        !badgeEngine &&
        featureEnabled &&
        badgeSettings.enabled &&
        NavigationDetector.isFilterablePage()
      ) {
        // Feature enabled - create engine if badge settings also enabled
        console.log('[Postweaver] Feature enabled, creating badge engine');
        badgeEngine = new MetricsBadgeEngine(badgeSettings);
        badgeEngine.initialize();
      }
    });

    // Handle data capture feature flag changes
    const captureFeatureEnabled = extensionSettings.features.dataCapture;
    console.log('[Postweaver] Extension settings changed, dataCapture:', captureFeatureEnabled);

    getCaptureSettings().then(async (captureSettings) => {
      if (captureEngine && !captureFeatureEnabled) {
        // Feature disabled - cleanup engine
        console.log('[Postweaver] Data capture feature disabled, cleaning up capture engine');
        captureEngine.cleanup();
        captureEngine = null;
      } else if (!captureEngine && captureFeatureEnabled && captureSettings.enabled) {
        // Feature enabled - create engine if capture settings also enabled
        // Interceptor is already injected at document_start by interceptor-loader.content.ts
        console.log('[Postweaver] Data capture feature enabled, creating capture engine');
        captureEngine = new DataCaptureEngine(captureSettings);
        captureEngine.initialize();
      }
    });

    // Handle AI detection feature flag changes
    const aiDetectionFeatureEnabled = extensionSettings.features.aiDetection;
    console.log('[Postweaver] Extension settings changed, aiDetection:', aiDetectionFeatureEnabled);

    getAiDetectionSettings().then(async (aiDetectionSettings) => {
      if (aiDetectionEngine && !aiDetectionFeatureEnabled) {
        // Feature disabled - cleanup engine
        console.log('[Postweaver] AI detection feature disabled, cleaning up AI detection engine');
        aiDetectionEngine.cleanup();
        aiDetectionEngine = null;
      } else if (
        !aiDetectionEngine &&
        aiDetectionFeatureEnabled &&
        aiDetectionSettings.enabled &&
        NavigationDetector.isFilterablePage()
      ) {
        // Feature enabled - create engine if AI detection settings also enabled
        console.log('[Postweaver] AI detection feature enabled, creating AI detection engine');
        aiDetectionEngine = new AiDetectionEngine(aiDetectionSettings);
        aiDetectionEngine.initialize();
      }
    });

    // Handle composer feature flag changes
    const composerFeatureEnabled = extensionSettings.features.composer;
    console.log('[Postweaver] Extension settings changed, composer:', composerFeatureEnabled);

    getComposerSettings().then((composerSettings) => {
      if (composeDetector && !composerFeatureEnabled) {
        console.log('[Postweaver] Composer feature disabled, cleaning up compose detector');
        composeDetector.cleanup();
        composeDetector = null;
      } else if (!composeDetector && composerFeatureEnabled && composerSettings.enabled) {
        console.log('[Postweaver] Composer feature enabled, creating compose detector');
        composeDetector = new ComposeDetector(true);
        composeDetector.initialize();
      }
    });
  });
}

// Interceptor injection moved to interceptor-loader.content.ts (runs at document_start)

/**
 * Initialize data capture engine
 */
async function initializeCapture(): Promise<void> {
  const captureSettings = await getCaptureSettings();
  const extensionSettings = await getSettings();

  // Check both feature flag AND capture-specific enabled flag
  const featureEnabled = extensionSettings.features.dataCapture;

  // Interceptor is injected at document_start by interceptor-loader.content.ts
  // This ensures XHR is overridden before X.com's scripts run

  // Only create engine if both feature flag AND capture settings are enabled
  if (featureEnabled && captureSettings.enabled) {
    captureEngine = new DataCaptureEngine(captureSettings);
    captureEngine.initialize();
  }

  setupCaptureSubscription();
}

/**
 * Subscribe to capture settings changes
 */
function setupCaptureSubscription(): void {
  if (unsubscribeCapture) {
    return; // Already subscribed
  }

  unsubscribeCapture = subscribeToCaptureSettings(async (newSettings) => {
    console.log('[Postweaver] Capture settings changed:', newSettings);

    // Get current feature flag state
    const extensionSettings = await getSettings();
    const featureEnabled = extensionSettings.features.dataCapture;

    if (captureEngine) {
      if (featureEnabled && newSettings.enabled) {
        // Engine exists, both enabled - update settings
        captureEngine.updateSettings(newSettings);
      } else {
        // Engine exists, either disabled - cleanup
        captureEngine.cleanup();
        captureEngine = null;
      }
    } else if (featureEnabled && newSettings.enabled) {
      // No engine, both enabled - create engine
      // Interceptor is already injected at document_start by interceptor-loader.content.ts
      captureEngine = new DataCaptureEngine(newSettings);
      captureEngine.initialize();
    }
  });
}

/**
 * Initialize AI detection engine
 */
async function initializeAiDetection(): Promise<void> {
  const aiDetectionSettings = await getAiDetectionSettings();
  const extensionSettings = await getSettings();

  // Check both feature flag AND AI detection-specific enabled flag
  const featureEnabled = extensionSettings.features.aiDetection;

  console.log('[Postweaver] AI detection settings loaded:', {
    featureEnabled,
    aiDetectionEnabled: aiDetectionSettings.enabled,
  });

  if (!NavigationDetector.isFilterablePage()) {
    console.log('[Postweaver] Not a filterable page, skipping AI detection initialization');
    setupAiDetectionSubscription();
    return;
  }

  // Only create engine if both feature flag AND AI detection settings are enabled
  if (featureEnabled && aiDetectionSettings.enabled) {
    aiDetectionEngine = new AiDetectionEngine(aiDetectionSettings);
    aiDetectionEngine.initialize();
    console.log('[Postweaver] AI detection engine started');
  }

  setupAiDetectionSubscription();
}

/**
 * Subscribe to AI detection settings changes
 */
function setupAiDetectionSubscription(): void {
  if (unsubscribeAiDetection) {
    return; // Already subscribed
  }

  unsubscribeAiDetection = subscribeToAiDetectionSettings(async (newSettings) => {
    console.log('[Postweaver] AI detection settings changed:', newSettings);

    // Get current feature flag state
    const extensionSettings = await getSettings();
    const featureEnabled = extensionSettings.features.aiDetection;

    if (aiDetectionEngine) {
      if (featureEnabled && newSettings.enabled) {
        // Engine exists, both enabled - update settings
        aiDetectionEngine.updateSettings(newSettings);
      } else {
        // Engine exists, either disabled - cleanup
        aiDetectionEngine.cleanup();
        aiDetectionEngine = null;
      }
    } else if (featureEnabled && newSettings.enabled && NavigationDetector.isFilterablePage()) {
      // No engine, both enabled, on filterable page - create engine
      aiDetectionEngine = new AiDetectionEngine(newSettings);
      aiDetectionEngine.initialize();
    }
  });
}

/**
 * Initialize compose detector
 */
async function initializeComposer(): Promise<void> {
  const composerSettings = await getComposerSettings();
  const extensionSettings = await getSettings();

  // Check both feature flag AND composer-specific enabled flag
  const featureEnabled = extensionSettings.features.composer;

  console.log('[Postweaver] Composer settings loaded:', {
    featureEnabled,
    composerEnabled: composerSettings.enabled,
  });

  // Create and initialize compose detector if both feature flag AND composer settings are enabled
  if (featureEnabled && composerSettings.enabled) {
    composeDetector = new ComposeDetector(true);
    composeDetector.initialize();
    console.log('[Postweaver] Compose detector started');
  }

  setupComposerSubscription();
}

/**
 * Subscribe to composer settings changes
 */
function setupComposerSubscription(): void {
  if (unsubscribeComposer) {
    return; // Already subscribed
  }

  unsubscribeComposer = subscribeToComposerSettings(async (newSettings) => {
    console.log('[Postweaver] Composer settings changed:', newSettings);

    // Get current feature flag state
    const extensionSettings = await getSettings();
    const featureEnabled = extensionSettings.features.composer;

    if (composeDetector) {
      if (featureEnabled && newSettings.enabled) {
        // Engine exists, both enabled - update settings
        composeDetector.updateSettings(true);
      } else {
        // Engine exists, either disabled - cleanup
        composeDetector.cleanup();
        composeDetector = null;
      }
    } else if (featureEnabled && newSettings.enabled) {
      // No engine, both enabled - create engine
      composeDetector = new ComposeDetector(true);
      composeDetector.initialize();
    }
  });
}

/**
 * Initialize the in-page AI draft button injector
 */
async function initializeAiDrafter(): Promise<void> {
  const drafterSettings = await getAiDrafterSettings();

  console.log('[Postweaver] AI drafter settings loaded:', {
    enabled: drafterSettings.enabled,
  });

  if (drafterSettings.enabled) {
    draftButtonInjector = new DraftButtonInjector(true);
    draftButtonInjector.initialize();
    contextButtonInjector = new ContextButtonInjector(true);
    contextButtonInjector.initialize();
    console.log('[Postweaver] Draft + context button injectors started');
  }

  setupAiDrafterSubscription();
}

/**
 * Subscribe to AI drafter settings changes
 */
function setupAiDrafterSubscription(): void {
  if (unsubscribeAiDrafter) {
    return; // Already subscribed
  }

  unsubscribeAiDrafter = subscribeToAiDrafterSettings((newSettings) => {
    console.log('[Postweaver] AI drafter settings changed, enabled:', newSettings.enabled);

    if (draftButtonInjector) {
      if (newSettings.enabled) {
        draftButtonInjector.updateSettings(true);
        contextButtonInjector?.updateSettings(true);
      } else {
        draftButtonInjector.cleanup();
        draftButtonInjector = null;
        contextButtonInjector?.cleanup();
        contextButtonInjector = null;
      }
    } else if (newSettings.enabled) {
      draftButtonInjector = new DraftButtonInjector(true);
      draftButtonInjector.initialize();
      contextButtonInjector = new ContextButtonInjector(true);
      contextButtonInjector.initialize();
    }
  });
}

/**
 * Handle engine lifecycle on navigation
 * Reduces duplication between filter and badge engine handling
 */
function handleEngineLifecycle<TSettings, TEngine extends { initialize(): void; cleanup(): void }>(
  options: {
    isFilterable: boolean;
    engine: TEngine | null;
    settings: TSettings;
    isEnabled: (settings: TSettings) => boolean;
    createEngine: (settings: TSettings) => TEngine;
    onReprocess: (engine: TEngine) => void;
    engineName: string;
  }
): TEngine | null {
  const { isFilterable, engine, settings, isEnabled, createEngine, onReprocess, engineName } = options;

  if (isFilterable && engine) {
    console.log(`[Postweaver] Re-processing ${engineName} after navigation`);
    onReprocess(engine);
    return engine;
  } else if (!isFilterable && engine) {
    console.log(`[Postweaver] Left filterable page, cleaning up ${engineName}`);
    engine.cleanup();
    return null;
  } else if (isFilterable && !engine && isEnabled(settings)) {
    console.log(`[Postweaver] Entered filterable page, initializing ${engineName}`);
    const newEngine = createEngine(settings);
    newEngine.initialize();
    return newEngine;
  }
  return engine;
}

/**
 * Clean up the extension
 * Called when extension is disabled
 */
function cleanupExtension(): void {
  if (!isInitialized) {
    console.log('[Postweaver] Not initialized, nothing to clean up');
    return;
  }

  console.log('[Postweaver] Cleaning up...');

  // Cleanup filter engine
  if (filterEngine) {
    filterEngine.cleanup();
    filterEngine = null;
  }

  // Cleanup badge engine
  if (badgeEngine) {
    badgeEngine.cleanup();
    badgeEngine = null;
  }

  // Cleanup capture engine
  if (captureEngine) {
    captureEngine.cleanup();
    captureEngine = null;
  }

  // Cleanup AI detection engine
  if (aiDetectionEngine) {
    aiDetectionEngine.cleanup();
    aiDetectionEngine = null;
  }

  // Cleanup compose detector
  if (composeDetector) {
    composeDetector.cleanup();
    composeDetector = null;
  }

  // Cleanup AI draft button injector
  if (draftButtonInjector) {
    draftButtonInjector.cleanup();
    draftButtonInjector = null;
  }

  // Cleanup context button injector
  if (contextButtonInjector) {
    contextButtonInjector.cleanup();
    contextButtonInjector = null;
  }

  // Cleanup navigation detector
  if (navigationDetector) {
    navigationDetector.cleanup();
    navigationDetector = null;
  }

  // Unsubscribe from filter settings
  if (unsubscribeFilters) {
    unsubscribeFilters();
    unsubscribeFilters = null;
  }

  // Unsubscribe from badge settings
  if (unsubscribeBadges) {
    unsubscribeBadges();
    unsubscribeBadges = null;
  }

  // Unsubscribe from extension settings
  if (unsubscribeExtensionSettings) {
    unsubscribeExtensionSettings();
    unsubscribeExtensionSettings = null;
  }

  // Unsubscribe from capture settings
  if (unsubscribeCapture) {
    unsubscribeCapture();
    unsubscribeCapture = null;
  }

  // Unsubscribe from AI detection settings
  if (unsubscribeAiDetection) {
    unsubscribeAiDetection();
    unsubscribeAiDetection = null;
  }

  // Unsubscribe from composer settings
  if (unsubscribeComposer) {
    unsubscribeComposer();
    unsubscribeComposer = null;
  }

  // Unsubscribe from AI drafter settings
  if (unsubscribeAiDrafter) {
    unsubscribeAiDrafter();
    unsubscribeAiDrafter = null;
  }

  isInitialized = false;
}

/**
 * Detect X.com's current theme by checking background color
 * X.com uses dark backgrounds for dark mode
 */
function detectTheme(): 'light' | 'dark' {
  const bgColor = window.getComputedStyle(document.documentElement).backgroundColor;

  // Parse RGB values from background color
  const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match && match.length >= 4) {
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    // Calculate relative luminance (simple approach)
    // Dark themes typically have low RGB values
    const luminance = (r + g + b) / 3;
    return luminance < 128 ? 'dark' : 'light';
  }

  // Default to light if we can't detect
  return 'light';
}

/**
 * Handle incoming messages from background or popup
 */
function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  console.log('[Postweaver] Content script received:', message.type);

  switch (message.type) {
    case 'SETTINGS_CHANGED': {
      const settings = message.settings;
      console.log('[Postweaver] Settings changed, enabled:', settings.enabled);

      if (settings.enabled && !isInitialized) {
        initializeExtension();
      } else if (!settings.enabled && isInitialized) {
        cleanupExtension();
      }

      sendResponse({ success: true });
      return false;
    }

    case 'GET_THEME': {
      const theme = detectTheme();
      console.log('[Postweaver] Detected theme:', theme);
      sendResponse({ theme });
      return false;
    }

    case 'GET_REPLY_CONTEXT': {
      sendResponse({ target: extractReplyTarget() });
      return false;
    }

    case 'INSERT_DRAFT': {
      // Human-in-the-loop by design: this only writes text into the compose
      // box for the user to review; posting is always the user's click.
      const { content } = message as { type: string; content: string };
      focusComposeBox();
      insertTemplateText(content).then((success) => {
        sendResponse({ success });
      });
      return true; // Async response
    }

    default:
      // Unknown message type, don't respond
      return false;
  }
}

export default defineContentScript({
  matches: [
    '*://twitter.com/*',
    '*://x.com/*',
    '*://pro.twitter.com/*',
    '*://pro.x.com/*',
  ],
  runAt: 'document_idle',

  main() {
    console.log(`[Postweaver] Content script loaded on ${window.location.hostname}`);

    // Register message listener
    chrome.runtime.onMessage.addListener(handleMessage);

    // Check initial enabled state
    chrome.storage.local.get('postweaver_settings', (result) => {
      const settings = result['postweaver_settings'] as ExtensionSettings | undefined;

      if (settings?.enabled) {
        initializeExtension();
      } else {
        console.log('[Postweaver] Extension disabled');
      }
    });
  },
});
