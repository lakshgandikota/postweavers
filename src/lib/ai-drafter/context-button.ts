/**
 * Context-basket button: a small ⊕ injected into every post's action row
 * on X. Clicking it adds that post/reply to the drafting context basket, so
 * the next draft can weave in posts the user hand-picked from anywhere in
 * the UI (the thread, quote tweets, search results, other conversations).
 *
 * Same performance discipline as DraftButtonInjector: vanilla DOM,
 * rAF-debounced MutationObserver, cleanly removable.
 */

import { addToContextBasket, getContextBasket } from '../storage';
import { parseTweetArticle } from './reply-context';

const INJECTED_ATTR = 'data-pw-ctx-btn';

export class ContextButtonInjector {
  private observer: MutationObserver | null = null;
  private scheduled = false;

  constructor(private enabled: boolean = true) {}

  initialize(): void {
    console.log('[Postweaver] Context button injector initialized');
    this.injectButtons();
    this.observer = new MutationObserver(() => this.scheduleInject());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private scheduleInject(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.injectButtons();
    });
  }

  private injectButtons(): void {
    if (!this.enabled) return;

    const articles = document.querySelectorAll<HTMLElement>(
      `article[data-testid="tweet"]:not([${INJECTED_ATTR}])`
    );
    articles.forEach((article) => {
      article.setAttribute(INJECTED_ATTR, 'true');
      // The action row (reply/repost/like/views) is the article's role=group
      const actionRow = article.querySelector<HTMLElement>('[role="group"]');
      if (!actionRow) return;
      actionRow.appendChild(this.createButton(article));
    });
  }

  private createButton(article: HTMLElement): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Add this post as drafting context (PostWeavers)';
    button.textContent = '⊕';
    button.setAttribute('data-pw-ctx-trigger', 'true');
    Object.assign(button.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      marginLeft: '4px',
      border: 'none',
      borderRadius: '9999px',
      background: 'transparent',
      color: 'rgb(113, 118, 123)',
      font: '600 15px system-ui, sans-serif',
      cursor: 'pointer',
      flexShrink: '0',
    } as CSSStyleDeclaration);

    button.addEventListener('mouseenter', () => {
      if (button.textContent === '⊕') {
        button.style.color = 'rgb(29, 155, 240)';
        button.style.background = 'rgba(29, 155, 240, 0.1)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.textContent === '⊕') {
        button.style.color = 'rgb(113, 118, 123)';
        button.style.background = 'transparent';
      }
    });

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parsed = parseTweetArticle(article);
      if (!parsed) {
        this.flash(button, '?', 'rgb(217, 83, 79)');
        return;
      }
      const basket = await addToContextBasket({
        authorHandle: parsed.authorHandle,
        text: parsed.text,
      });
      this.flash(button, '✓', 'rgb(0, 186, 124)');
      console.log(`[Postweaver] Context gathered (${basket.length} in basket)`);
    });

    // Show already-collected state on inject (best-effort)
    void this.markIfCollected(button, article);

    return button;
  }

  private async markIfCollected(button: HTMLElement, article: HTMLElement): Promise<void> {
    const parsed = parseTweetArticle(article);
    if (!parsed) return;
    const basket = await getContextBasket();
    if (basket.some((s) => s.text === parsed.text && s.authorHandle === parsed.authorHandle)) {
      button.textContent = '✓';
      button.style.color = 'rgb(0, 186, 124)';
    }
  }

  private flash(button: HTMLElement, glyph: string, color: string): void {
    button.textContent = glyph;
    button.style.color = color;
    button.style.background = 'transparent';
  }

  updateSettings(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.injectButtons();
    } else {
      this.removeButtons();
    }
  }

  private removeButtons(): void {
    document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach((article) => {
      article.removeAttribute(INJECTED_ATTR);
      article.querySelector('[data-pw-ctx-trigger]')?.remove();
    });
  }

  cleanup(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.removeButtons();
    console.log('[Postweaver] Context button injector cleaned up');
  }
}
