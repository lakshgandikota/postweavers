/**
 * Context button: a small ⊕ injected into every post's action row on X.
 * Clicking it opens a compact menu with two destinations for the post:
 *
 *   1. "Use for next draft": the one-shot context basket.
 *   2. "Save to topic": a durable, synced topic pool (see src/types/topics.ts),
 *      so a sharp reply seen today informs every future draft on that subject.
 *
 * Same performance discipline as DraftButtonInjector: vanilla DOM,
 * rAF-debounced MutationObserver, cleanly removable. The menu lives in a
 * shadow root for CSS isolation from X.
 */

import { addToContextBasket, getContextBasket } from '../storage';
import { addTopicEntry, createTopic, getTopics, topicHasPost } from '../topics';
import type { Topic } from '../../types/topics';
import { parseTweetArticle } from './reply-context';

const INJECTED_ATTR = 'data-pw-ctx-btn';

const GREY = 'rgb(113, 118, 123)';
const BLUE = 'rgb(29, 155, 240)';
const GREEN = 'rgb(0, 186, 124)';

export class ContextButtonInjector {
  private observer: MutationObserver | null = null;
  private scheduled = false;

  // Menu state
  private host: HTMLElement | null = null;
  private menuAnchor: HTMLElement | null = null;

  constructor(private enabled: boolean = true) {}

  initialize(): void {
    console.log('[Postweaver] Context button injector initialized');
    this.injectButtons();
    this.observer = new MutationObserver(() => this.scheduleInject());
    this.observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', this.handleReflow, true);
    window.addEventListener('resize', this.handleReflow, true);
  }

  private scheduleInject(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.injectButtons();
    });
  }

  private handleReflow = (): void => {
    if (this.host) this.closeMenu();
  };

  private injectButtons(): void {
    if (!this.enabled) return;

    const articles = document.querySelectorAll<HTMLElement>(
      `article[data-testid="tweet"]:not([${INJECTED_ATTR}])`
    );
    if (articles.length === 0) return;

    // One storage read per pass (not per article) to mark already-saved posts
    const collected = Promise.all([getContextBasket(), getTopics()]);
    articles.forEach((article) => {
      article.setAttribute(INJECTED_ATTR, 'true');
      // The action row (reply/repost/like/views) is the article's role=group
      const actionRow = article.querySelector<HTMLElement>('[role="group"]');
      if (!actionRow) return;
      actionRow.appendChild(this.createButton(article, collected));
    });
  }

  private createButton(
    article: HTMLElement,
    collected: Promise<[Awaited<ReturnType<typeof getContextBasket>>, Topic[]]>
  ): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Remember this post (PostWeavers): use it for the next draft, or save it to a topic';
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
      color: GREY,
      font: '600 15px system-ui, sans-serif',
      cursor: 'pointer',
      flexShrink: '0',
    } as CSSStyleDeclaration);

    button.addEventListener('mouseenter', () => {
      if (button.textContent === '⊕') {
        button.style.color = BLUE;
        button.style.background = 'rgba(29, 155, 240, 0.1)';
      }
    });
    button.addEventListener('mouseleave', () => {
      if (button.textContent === '⊕') {
        button.style.color = GREY;
        button.style.background = 'transparent';
      }
    });

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.openMenu(button, article);
    });

    // Show already-collected state on inject (best-effort)
    void this.markIfCollected(button, article, collected);

    return button;
  }

  private async markIfCollected(
    button: HTMLElement,
    article: HTMLElement,
    collected: Promise<[Awaited<ReturnType<typeof getContextBasket>>, Topic[]]>
  ): Promise<void> {
    const parsed = parseTweetArticle(article);
    if (!parsed) return;
    const [basket, topics] = await collected.catch(() => [[], []] as const);
    const inBasket = basket.some((s) => s.text === parsed.text && s.authorHandle === parsed.authorHandle);
    const inTopic = topics.some((t) => topicHasPost(t, parsed.authorHandle, parsed.text));
    if (inBasket || inTopic) this.flash(button, '✓', GREEN);
  }

  private flash(button: HTMLElement, glyph: string, color: string): void {
    button.textContent = glyph;
    button.style.color = color;
    button.style.background = 'transparent';
  }

  // ---- Menu ------------------------------------------------------------

  private async openMenu(anchor: HTMLElement, article: HTMLElement): Promise<void> {
    if (this.host && this.menuAnchor === anchor) {
      this.closeMenu();
      return;
    }
    this.closeMenu();

    const parsed = parseTweetArticle(article);
    if (!parsed) {
      this.flash(anchor, '?', 'rgb(217, 83, 79)');
      return;
    }
    const sourceUrl = article.querySelector<HTMLAnchorElement>('a[href*="/status/"] time')
      ?.closest('a')?.href;

    const [basket, topics] = await Promise.all([getContextBasket(), getTopics()]);
    const inBasket = basket.some((s) => s.text === parsed.text && s.authorHandle === parsed.authorHandle);

    const host = document.createElement('div');
    host.setAttribute('data-pw-ctx-menu', 'true');
    Object.assign(host.style, { position: 'fixed', zIndex: '2147483647' } as CSSStyleDeclaration);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = this.menuHtml(topics, inBasket, parsed.authorHandle);
    document.body.appendChild(host);
    this.host = host;
    this.menuAnchor = anchor;
    this.positionMenu(anchor);

    const $ = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T | null;
    const status = $('#pw-status');
    const say = (text: string, ok = true) => {
      if (!status) return;
      status.textContent = text;
      status.style.color = ok ? GREEN : 'rgb(217, 83, 79)';
    };

    $('#pw-basket')?.addEventListener('click', async () => {
      await addToContextBasket({ authorHandle: parsed.authorHandle, text: parsed.text });
      this.flash(anchor, '✓', GREEN);
      say('Added for the next draft');
      setTimeout(() => this.closeMenu(), 700);
    });

    shadow.querySelectorAll<HTMLButtonElement>('[data-topic-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-topic-id')!;
        const result = await addTopicEntry(id, {
          kind: 'post',
          text: parsed.text,
          authorHandle: parsed.authorHandle,
          ...(sourceUrl ? { sourceUrl } : {}),
        });
        if (!result) {
          say('That topic is gone. Reopen the menu.', false);
          return;
        }
        this.flash(anchor, '✓', GREEN);
        say(result.added ? `Saved to ${result.topic.name}` : `Already in ${result.topic.name}`);
        setTimeout(() => this.closeMenu(), 900);
      });
    });

    const newInput = $<HTMLInputElement>('#pw-new-name');
    const newBtn = $<HTMLButtonElement>('#pw-new-save');
    const saveToNew = async () => {
      const name = newInput?.value.trim() ?? '';
      if (!name) return;
      try {
        const topic = await createTopic(name);
        const result = await addTopicEntry(topic.id, {
          kind: 'post',
          text: parsed.text,
          authorHandle: parsed.authorHandle,
          ...(sourceUrl ? { sourceUrl } : {}),
        });
        this.flash(anchor, '✓', GREEN);
        say(`Saved to ${result?.topic.name ?? name}`);
        setTimeout(() => this.closeMenu(), 900);
      } catch (error) {
        say((error as Error)?.message ?? String(error), false);
      }
    };
    newBtn?.addEventListener('click', saveToNew);
    newInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void saveToNew();
      }
      e.stopPropagation(); // X has global key handlers
    });

    setTimeout(() => document.addEventListener('mousedown', this.handleOutsideClick), 0);
    document.addEventListener('keydown', this.handleKeydown);
  }

  private positionMenu(anchor: HTMLElement): void {
    if (!this.host) return;
    const rect = anchor.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.left - width + rect.width, window.innerWidth - width - 8));
    this.host.style.left = `${left}px`;
    this.host.style.width = `${width}px`;
    if (window.innerHeight - rect.bottom > 260) {
      this.host.style.top = `${rect.bottom + 6}px`;
      this.host.style.bottom = 'auto';
    } else {
      this.host.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      this.host.style.top = 'auto';
    }
  }

  private menuHtml(topics: Topic[], inBasket: boolean, handle: string): string {
    const escape = (s: string) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const topicRows = topics
      .map(
        (t) =>
          `<button class="item" data-topic-id="${escape(t.id)}">
             <span class="name">${escape(t.name)}</span>
             <span class="count">${t.entries.length}</span>
           </button>`
      )
      .join('');

    return /* html */ `
      <style>
        :host { all: initial; }
        .card {
          font: 13px system-ui, -apple-system, sans-serif;
          color: #0f1419; background: #fff;
          border: 1px solid #cfd9de; border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.2);
          padding: 6px; box-sizing: border-box;
        }
        .head { font-size: 11px; opacity: 0.6; padding: 4px 8px 6px; }
        .item {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; text-align: left; border: none; background: transparent; color: inherit;
          font: inherit; padding: 7px 8px; border-radius: 8px; cursor: pointer;
        }
        .item:hover { background: #f7f9f9; }
        .item .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .item .count { font-size: 11px; opacity: 0.55; }
        .item.primary { font-weight: 600; color: ${BLUE}; }
        .sep { border-top: 1px solid #eff3f4; margin: 4px 0; }
        .label { font-size: 11px; font-weight: 600; opacity: 0.6; padding: 4px 8px 2px; }
        .list { max-height: 150px; overflow-y: auto; }
        .new { display: flex; gap: 6px; padding: 4px 6px 2px; }
        input {
          flex: 1; min-width: 0; border: 1px solid #cfd9de; border-radius: 8px;
          padding: 5px 8px; font: inherit; background: #fff; color: inherit;
        }
        button.save {
          border: none; background: ${BLUE}; color: #fff; border-radius: 9999px;
          padding: 5px 10px; font: 600 12px system-ui, sans-serif; cursor: pointer;
        }
        .status { font-size: 11px; padding: 4px 8px 2px; min-height: 14px; }
        .empty { font-size: 11px; opacity: 0.6; padding: 2px 8px 4px; }

        @media (prefers-color-scheme: dark) {
          .card { color: #e7e9ea; background: #000; border-color: #2f3336; }
          .item:hover { background: #16181c; }
          input { background: #16181c; color: #e7e9ea; border-color: #2f3336; }
          .sep { border-color: #2f3336; }
        }
      </style>
      <div class="card">
        <div class="head">Post by @${escape(handle)}</div>
        <button class="item primary" id="pw-basket">
          <span class="name">${inBasket ? '✓ In the next draft' : 'Use for next draft'}</span>
        </button>
        <div class="sep"></div>
        <div class="label">Save to topic</div>
        ${topics.length > 0 ? `<div class="list">${topicRows}</div>` : `<div class="empty">No topics yet. Name one:</div>`}
        <div class="new">
          <input id="pw-new-name" type="text" placeholder="New topic…" maxlength="60">
          <button class="save" id="pw-new-save">Save</button>
        </div>
        <div class="status" id="pw-status"></div>
      </div>
    `;
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.host) return;
    const path = e.composedPath();
    if (path.includes(this.host)) return;
    if (this.menuAnchor && path.includes(this.menuAnchor)) return; // toggles itself
    this.closeMenu();
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeMenu();
  };

  private closeMenu(): void {
    document.removeEventListener('mousedown', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleKeydown);
    this.host?.remove();
    this.host = null;
    this.menuAnchor = null;
  }

  // ---- Lifecycle -------------------------------------------------------

  updateSettings(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.injectButtons();
    } else {
      this.removeButtons();
      this.closeMenu();
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
    window.removeEventListener('scroll', this.handleReflow, true);
    window.removeEventListener('resize', this.handleReflow, true);
    this.removeButtons();
    this.closeMenu();
    console.log('[Postweaver] Context button injector cleaned up');
  }
}
