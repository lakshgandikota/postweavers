/**
 * AI badge renderer for suspected AI-generated replies
 *
 * Displays a subtle robot icon badge with confidence tooltip.
 * Uses purple accent color (distinctive but not alarming per CONTEXT.md).
 */

/**
 * Robot SVG icon path data
 * Simple bot/AI icon - robot face with antenna
 */
const ROBOT_ICON_PATH =
  'M12 2a1 1 0 0 1 1 1v1h2a3 3 0 0 1 3 3v2h1a1 1 0 1 1 0 2h-1v2a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-2H5a1 1 0 1 1 0-2h1V7a3 3 0 0 1 3-3h2V3a1 1 0 0 1 1-1zM9 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-5 4a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2h-4z';

/**
 * Render AI badge HTML with robot icon and confidence tooltip
 *
 * @param confidence - Detection confidence score (0-1)
 * @returns Complete badge inner HTML string
 */
export function renderAiBadgeHTML(confidence: number): string {
  const confidencePercent = Math.round(confidence * 100);

  // Injected into x.com's DOM where no Tailwind exists — style inline.
  // Solid purple pill + white text reads on all three X themes.
  const svgIcon = `<svg width="11" height="11" style="flex-shrink:0" fill="currentColor" viewBox="0 0 24 24"><path d="${ROBOT_ICON_PATH}"></path></svg>`;

  const pillStyle = [
    'display:inline-flex',
    'align-items:center',
    'gap:3px',
    'padding:2px 8px',
    'border-radius:999px',
    'font-size:11px',
    'font-weight:700',
    'line-height:1.3',
    'background:#6d28d9',
    'color:#ffffff',
    'cursor:help',
  ].join(';');

  // Tooltip with confidence percentage
  const tooltip = `Possibly AI-generated (${confidencePercent}% confidence)`;

  return `<span style="${pillStyle}" title="${tooltip}">${svgIcon}<span>AI?</span></span>`;
}
