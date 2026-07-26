/**
 * Composer module barrel export
 * Character counting, compose detection, and text insertion into X's editor
 */

// Character counter
export { analyzeCharacterCount } from './character-counter';

// Compose detector
export { ComposeDetector } from './compose-detector';

// Text inserter
export {
  insertTemplateText,
  focusComposeBox,
  getComposeBoxText,
} from './template-inserter';

// Re-export types for convenience
export type {
  ComposerSettings,
  CharCountResult,
  ComposeContext,
} from '../../types/composer';

export { DEFAULT_COMPOSER_SETTINGS } from '../../types/composer';
