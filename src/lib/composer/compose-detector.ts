/**
 * ComposeDetector - Detects compose focus events on X.com
 *
 * Uses MutationObserver pattern to track contenteditable elements
 * and sends messages to Side Panel when compose is focused/blurred.
 */

import type { ComposeContext } from '../../types/messages';
import { extractReplyTarget } from '../ai-drafter/reply-context';

export class ComposeDetector {
  private observer: MutationObserver | null = null;
  private focusedBox: HTMLElement | null = null;
  private focusedContext: ComposeContext | null = null;

  constructor(private enabled: boolean = true) {}

  initialize(): void {
    // Log initialization
    console.log('[Postweaver] Compose detector initialized');

    // Attach listeners to existing compose boxes
    this.attachListeners();

    // Watch for new compose boxes (SPA navigation, modals opening)
    this.observer = new MutationObserver(() => {
      this.attachListeners();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private attachListeners(): void {
    // X.com uses contenteditable divs for compose
    // Query for all contenteditable elements
    const composeBoxes = document.querySelectorAll<HTMLElement>('[contenteditable="true"]');

    composeBoxes.forEach((box) => {
      // Skip if already attached (use data-pw-compose-listener attribute)
      if (box.hasAttribute('data-pw-compose-listener')) return;

      box.addEventListener('focus', () => this.handleFocus(box));
      box.addEventListener('blur', () => this.handleBlur(box));

      box.setAttribute('data-pw-compose-listener', 'true');
    });
  }

  private handleFocus(box: HTMLElement): void {
    if (!this.enabled) return;

    this.focusedBox = box;
    this.focusedContext = this.detectContext(box);

    console.log('[Postweaver] Compose focused:', this.focusedContext);

    // Send message to Side Panel
    chrome.runtime.sendMessage({
      type: 'COMPOSE_FOCUSED',
      context: this.focusedContext,
    }).catch((err) => {
      // Side panel may not be open - this is fine
      console.log('[Postweaver] Side panel not open:', err.message);
    });
  }

  private handleBlur(box: HTMLElement): void {
    if (this.focusedBox !== box) return;

    this.focusedBox = null;
    this.focusedContext = null;

    console.log('[Postweaver] Compose blurred');

    chrome.runtime.sendMessage({ type: 'COMPOSE_BLURRED' }).catch(() => {
      // Side panel may not be open - this is fine
    });
  }

  private detectContext(element: Element): ComposeContext {
    // Detection based on parent elements and data-testid attributes
    // Check for reply context (has reply indicator in thread)
    if (element.closest('[data-testid="reply"]') ||
        element.closest('[aria-label*="Reply"]')) {
      return { type: 'reply', target: extractReplyTarget() };
    }

    // Inline reply box on a status page has no reply testid, but the page
    // itself identifies the target tweet
    if (/\/status\/\d+/.test(window.location.pathname)) {
      const target = extractReplyTarget();
      if (target) {
        return { type: 'reply', target };
      }
    }

    // Check for quote tweet context
    if (element.closest('[data-testid="quoteTweet"]') ||
        element.closest('[data-testid="quote"]')) {
      return { type: 'quote' };
    }

    // Default to new tweet
    return { type: 'new_tweet' };
  }

  // Public method to get current compose text
  getComposeText(): string {
    return this.focusedBox?.textContent || '';
  }

  // Public method to check if compose is focused
  isFocused(): boolean {
    return this.focusedBox !== null;
  }

  // Public method to get focused element
  getFocusedBox(): HTMLElement | null {
    return this.focusedBox;
  }

  updateSettings(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.focusedBox = null;
      this.focusedContext = null;
    }
  }

  cleanup(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.focusedBox = null;
    this.focusedContext = null;

    // Remove all listener markers
    document.querySelectorAll('[data-pw-compose-listener]').forEach((el) => {
      el.removeAttribute('data-pw-compose-listener');
    });

    console.log('[Postweaver] Compose detector cleaned up');
  }
}
