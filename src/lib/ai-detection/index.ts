/**
 * AI Detection module
 *
 * Provides heuristic-based detection of AI-generated replies
 * and visual badges for suspected AI content.
 */

export { analyzeText, DETECTION_SIGNALS } from './heuristic-analyzer';
export { renderAiBadgeHTML } from './ai-badge-renderer';
export { AiDetectionEngine } from './ai-detection-engine';
