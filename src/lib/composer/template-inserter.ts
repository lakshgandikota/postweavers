/**
 * Text insertion into X.com's compose box
 *
 * Primary mechanism is a synthetic paste event (the only approach X's
 * Lexical-based editor handles exactly once), with a content-verified
 * execCommand fallback for plain contenteditables.
 */

/**
 * Insert text into the compose box (appends to existing content).
 *
 * @param text - The text to insert
 * @returns true if insertion succeeded, false otherwise
 */
export async function insertTemplateText(text: string): Promise<boolean> {
  // When the insert is triggered from the side panel, the page document has
  // lost focus — and execCommand('insertText') silently no-ops unless the
  // document is focused. Restore focus to the page window first.
  try {
    window.focus();
  } catch {
    // Ignore — some contexts disallow programmatic window focus
  }

  // Prefer the currently-focused editable; otherwise locate X's compose box
  let box = document.activeElement as HTMLElement | null;
  if (!box?.isContentEditable) {
    box = findComposeBox();
  }

  if (!box) {
    console.warn('[Postweaver] No compose box found for insertion');
    return false;
  }

  box.focus();

  // Move cursor to the end of existing content (we append, per CONTEXT.md)
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Add a separating space if there's existing content
  const existingText = box.textContent || '';
  const prefix = existingText.length > 0 && !existingText.endsWith(' ') ? ' ' : '';
  const insertText = prefix + text;

  if (!document.hasFocus()) {
    // execCommand needs document focus; window.focus() above doesn't always
    // restore it (browsers may refuse to steal OS focus). Log it as the
    // likely cause but still attempt insertion — on some Chrome versions
    // execCommand succeeds on a focused element regardless.
    console.warn('[Postweaver] Page document not focused; insertion may not take effect');
  }

  // Success is judged by CONTENT (occurrence count of a distinctive slice of
  // the new text), never by API return values.
  const firstLine = text.split('\n')[0] ?? text;
  const needle = firstLine.slice(0, 60);
  const countBefore = (box.textContent || '').split(needle).length - 1;
  const landed = () =>
    needle.length > 0 && (box!.textContent || '').split(needle).length - 1 > countBefore;

  // PRIMARY: synthetic paste. X's Lexical-based editor processes a single
  // execCommand('insertText') TWICE (its own beforeinput handling plus the
  // browser's native insertion — verified live: one call → text doubled).
  // A synthetic paste goes through the editor's paste pipeline exactly once,
  // and untrusted events trigger no browser default action, so it cannot
  // double-insert.
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', insertText);
    box.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    await settle();
    if (landed()) {
      console.log('[Postweaver] Draft inserted via paste event');
      return true;
    }
  } catch (e) {
    console.warn('[Postweaver] Paste-event insertion unavailable:', e);
  }

  // FALLBACK: execCommand, for plain contenteditables that ignore synthetic
  // paste. Only reached when the paste verifiably did not land (on X it
  // always lands, so the double-insert behavior above is never triggered).
  try {
    document.execCommand('insertText', false, insertText);
    await settle();
    if (landed()) {
      console.log('[Postweaver] Draft inserted via execCommand');
      return true;
    }
  } catch (e) {
    console.warn('[Postweaver] execCommand unavailable:', e);
  }

  console.warn('[Postweaver] Insertion did not take effect');
  return false;
}

/** Give the editor's framework a tick to reconcile before verifying */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Locate X.com's active compose box.
 * Tries the tweet textarea testids first, then any focused-region textbox,
 * then any contenteditable as a last resort.
 */
function findComposeBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      '[data-testid^="tweetTextarea_"][contenteditable="true"]'
    ) ??
    document.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]') ??
    document.querySelector<HTMLElement>('[contenteditable="true"]')
  );
}

/**
 * Focus the compose box if one exists.
 * Useful for auto-focus after template insertion per user preference.
 *
 * @returns true if focus succeeded, false if no compose box found
 */
export function focusComposeBox(): boolean {
  // Try to find the main compose box
  const composeBox = document.querySelector<HTMLElement>(
    '[contenteditable="true"][data-testid="tweetTextarea_0"], ' +
    '[contenteditable="true"][data-testid="tweetTextarea_0RichTextInputContainer"]'
  );

  if (composeBox) {
    composeBox.focus();
    return true;
  }

  // Fallback: find any focused contenteditable
  const activeEditable = document.querySelector<HTMLElement>('[contenteditable="true"]:focus');
  if (activeEditable) {
    activeEditable.focus();
    return true;
  }

  return false;
}

/**
 * Get the current text from the focused compose box.
 *
 * @returns The compose text, or empty string if no compose box focused
 */
export function getComposeBoxText(): string {
  const activeElement = document.activeElement as HTMLElement;

  if (activeElement?.isContentEditable) {
    return activeElement.textContent || '';
  }

  return '';
}
