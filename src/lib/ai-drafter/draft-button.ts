/**
 * In-page AI draft button + popover
 *
 * Injects a "Draft" button into X.com's compose toolbar. Because the click
 * originates in the page (not the side panel), the page keeps focus and
 * insertion into X's Draft.js editor works reliably — this is the native,
 * ReplyGuy-style path that also sidesteps the side-panel focus problem.
 *
 * Vanilla DOM by design: this runs on every X page alongside MutationObserver
 * work, so it stays out of the React bundle. The popover lives in a shadow
 * root for full CSS isolation from X's styles.
 */

import type {
  ContextToggles,
  DraftPortMessage,
  DraftRequest,
  ReplyStrategy,
} from '../../types/ai-drafter';
import { DRAFT_PORT_NAME, STRATEGY_LABELS } from '../../types/ai-drafter';
import { getAiDrafterSettings, getContextBasket } from '../storage';
import { extractReplyTarget } from './reply-context';
import { insertTemplateText, focusComposeBox } from '../composer/template-inserter';

/** Marks toolbars we've already injected into */
const INJECTED_ATTR = 'data-pw-draft-btn';

/** Provider display names for the "add your key" banner */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

/** The subset of strategies offered in the compact in-page menu */
const QUICK_STRATEGIES: ReplyStrategy[] = [
  'agree_add',
  'contrarian',
  'insight',
  'humor',
  'bait_question',
  'custom',
];

export class DraftButtonInjector {
  private observer: MutationObserver | null = null;
  private scheduled = false;

  // Popover state
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private port: chrome.runtime.Port | null = null;
  private draft = '';

  constructor(private enabled: boolean = true) {}

  initialize(): void {
    console.log('[Postweaver] Draft button injector initialized');
    this.injectButtons();

    // X mutates the DOM constantly; debounce injection to one pass per frame
    this.observer = new MutationObserver(() => this.scheduleInject());
    this.observer.observe(document.body, { childList: true, subtree: true });

    // Reposition/close the popover on scroll or resize
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
    if (this.host) this.closePopover();
  };

  /**
   * Find compose toolbars that lack our button and inject one.
   */
  private injectButtons(): void {
    if (!this.enabled) return;

    const toolbars = document.querySelectorAll<HTMLElement>('[data-testid="toolBar"]');
    toolbars.forEach((toolbar) => {
      if (toolbar.hasAttribute(INJECTED_ATTR)) return;

      // Only inject next to an actual compose box
      const composeRoot = toolbar.closest('[role="dialog"], main, [data-testid="primaryColumn"]');
      const hasCompose = composeRoot?.querySelector('[data-testid^="tweetTextarea_"]');
      if (!hasCompose) return;

      toolbar.setAttribute(INJECTED_ATTR, 'true');
      const button = this.createButton();
      // Prepend so it sits before X's media/emoji controls
      toolbar.insertBefore(button, toolbar.firstChild);
    });
  }

  private createButton(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Draft an AI reply (Postweaver)';
    button.textContent = '✦ Draft';
    button.setAttribute('data-pw-draft-trigger', 'true');
    // Inline styles: a single element in X's light DOM, so avoid a stylesheet
    Object.assign(button.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      height: '32px',
      padding: '0 12px',
      marginRight: '4px',
      border: '1px solid rgb(29, 155, 240)',
      borderRadius: '9999px',
      background: 'transparent',
      color: 'rgb(29, 155, 240)',
      font: '600 13px system-ui, sans-serif',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(29, 155, 240, 0.1)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openPopover(button);
    });

    return button;
  }

  // ---- Popover ---------------------------------------------------------

  private async openPopover(anchor: HTMLElement): Promise<void> {
    // Toggle off if already open from this anchor
    if (this.host) {
      this.closePopover();
      return;
    }

    const target = extractReplyTarget();
    const settings = await getAiDrafterSettings();
    const basketCount = (await getContextBasket()).length;

    this.draft = '';

    // Shadow-root host, positioned near the button
    const host = document.createElement('div');
    host.setAttribute('data-pw-draft-popover', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483647',
    } as CSSStyleDeclaration);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = this.popoverHtml(
      settings.provider,
      settings.defaultStrategy,
      settings.keyMode === 'managed' || !!settings.apiKey,
      target?.authorHandle ?? null,
      basketCount
    );
    document.body.appendChild(host);

    this.host = host;
    this.shadow = shadow;
    this.positionPopover(anchor);
    this.wirePopover(settings.defaultStrategy, settings.contextDefaults, target);

    // Close on outside click / Escape
    setTimeout(() => document.addEventListener('mousedown', this.handleOutsideClick), 0);
    document.addEventListener('keydown', this.handleKeydown);
  }

  private positionPopover(anchor: HTMLElement): void {
    if (!this.host) return;
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    // Prefer above the toolbar; fall back below if not enough room
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const preferAbove = rect.top > 380;
    this.host.style.left = `${left}px`;
    this.host.style.width = `${width}px`;
    if (preferAbove) {
      this.host.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      this.host.style.top = 'auto';
    } else {
      this.host.style.top = `${rect.bottom + 8}px`;
      this.host.style.bottom = 'auto';
    }
  }

  private popoverHtml(
    provider: string,
    defaultStrategy: ReplyStrategy,
    hasKey: boolean,
    handle: string | null,
    basketCount = 0
  ): string {
    const strategyOptions = QUICK_STRATEGIES.map(
      (s) =>
        `<option value="${s}"${s === defaultStrategy ? ' selected' : ''}>${STRATEGY_LABELS[s]}</option>`
    ).join('');

    const noKeyBanner = hasKey
      ? ''
      : `<div class="banner">Add your ${PROVIDER_NAMES[provider] ?? 'provider'} API key in the Postweaver side panel to draft.</div>`;

    return /* html */ `
      <style>
        :host { all: initial; }
        .card {
          font: 13px system-ui, -apple-system, sans-serif;
          color: #0f1419;
          background: #fff;
          border: 1px solid #cfd9de;
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.2);
          padding: 12px;
          box-sizing: border-box;
        }
        @media (prefers-color-scheme: dark) {
          .card { color: #e7e9ea; background: #000; border-color: #2f3336; }
          textarea, select { background: #16181c; color: #e7e9ea; border-color: #2f3336; }
          .draft { background: #16181c; border-color: #2f3336; }
        }
        .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .title { font-weight: 700; }
        .sub { font-size: 11px; opacity: 0.6; }
        select, textarea {
          width: 100%; box-sizing: border-box;
          border: 1px solid #cfd9de; border-radius: 8px;
          padding: 6px 8px; font: inherit; margin-bottom: 8px;
          background: #fff; color: inherit; resize: vertical;
        }
        .actions { display: flex; gap: 8px; align-items: center; }
        button.primary {
          background: rgb(29,155,240); color: #fff; border: none;
          border-radius: 9999px; padding: 6px 14px; font-weight: 600; cursor: pointer;
        }
        button.primary:disabled { opacity: 0.5; cursor: default; }
        button.ghost {
          background: transparent; border: 1px solid #cfd9de; color: inherit;
          border-radius: 9999px; padding: 6px 12px; cursor: pointer;
        }
        .draft {
          margin-top: 8px; border: 1px solid #cfd9de; border-radius: 8px;
          padding: 8px; min-height: 56px; white-space: pre-wrap; background: #f7f9f9;
        }
        .meta { font-size: 11px; opacity: 0.6; margin-left: auto; }
        .banner { font-size: 12px; color: #b45309; margin-bottom: 8px; }
        .err { color: #d33; font-size: 12px; margin-top: 6px; }
        .hidden { display: none; }
      </style>
      <div class="card">
        <div class="row">
          <span class="title">✦ Draft reply</span>
          <span class="sub">${handle ? '@' + handle : 'no post detected'}</span>
        </div>
        ${noKeyBanner}
        ${basketCount > 0 ? `<div class="banner" style="color:#1d9bf0">⊕ ${basketCount} gathered post${basketCount === 1 ? '' : 's'} included as context</div>` : ''}
        <select id="pw-strategy">${strategyOptions}</select>
        <textarea id="pw-intent" rows="2" placeholder="Your rough thought (optional)"></textarea>
        <div class="actions">
          <button class="primary" id="pw-generate"${hasKey ? '' : ' disabled'}>Generate</button>
          <span class="meta" id="pw-meta"></span>
        </div>
        <div class="draft hidden" id="pw-draft"></div>
        <div class="err hidden" id="pw-err"></div>
        <div class="actions hidden" id="pw-postactions" style="margin-top:8px">
          <button class="primary" id="pw-insert">Insert</button>
          <button class="ghost" id="pw-copy">Copy</button>
          <button class="ghost" id="pw-shorter">Shorter</button>
          <button class="ghost" id="pw-punchier">Punchier</button>
          <span class="meta" id="pw-count"></span>
        </div>
      </div>
    `;
  }

  private wirePopover(
    defaultStrategy: ReplyStrategy,
    contextDefaults: ContextToggles,
    target: DraftRequest['target']
  ): void {
    const shadow = this.shadow;
    if (!shadow) return;

    const $ = <T extends HTMLElement>(id: string) => shadow.getElementById(id) as T | null;
    const generateBtn = $<HTMLButtonElement>('pw-generate');
    const intentEl = $<HTMLTextAreaElement>('pw-intent');
    const strategyEl = $<HTMLSelectElement>('pw-strategy');
    const draftEl = $<HTMLDivElement>('pw-draft');
    const errEl = $<HTMLDivElement>('pw-err');
    const metaEl = $<HTMLSpanElement>('pw-meta');
    const postActions = $<HTMLDivElement>('pw-postactions');
    const insertBtn = $<HTMLButtonElement>('pw-insert');
    const copyBtn = $<HTMLButtonElement>('pw-copy');
    const countEl = $<HTMLSpanElement>('pw-count');

    const runDraft = (refine: { current: string; instruction: string } | null) => {
      const strategy = (strategyEl?.value as ReplyStrategy) || defaultStrategy;
      const request: DraftRequest = {
        intent: intentEl?.value ?? '',
        strategy,
        context: contextDefaults,
        target: target ?? null,
        refine,
      };

      this.draft = '';
      if (draftEl) {
        draftEl.textContent = '';
        draftEl.classList.remove('hidden');
      }
      errEl?.classList.add('hidden');
      postActions?.classList.add('hidden');
      if (metaEl) metaEl.textContent = 'drafting…';
      if (generateBtn) generateBtn.disabled = true;

      this.startStream(
        request,
        (chunk) => {
          this.draft += chunk;
          if (draftEl) draftEl.textContent = this.draft;
        },
        (metrics) => {
          if (metaEl) metaEl.textContent = `${(metrics.ttftMs / 1000).toFixed(1)}s to first token`;
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Redraft';
          }
          postActions?.classList.remove('hidden');
          if (countEl) countEl.textContent = `${this.draft.length}/280`;
        },
        (error) => {
          if (errEl) {
            errEl.textContent = error;
            errEl.classList.remove('hidden');
          }
          if (metaEl) metaEl.textContent = '';
          if (generateBtn) generateBtn.disabled = false;
        }
      );
    };

    generateBtn?.addEventListener('click', () => runDraft(null));

    $<HTMLButtonElement>('pw-shorter')?.addEventListener('click', () => {
      if (this.draft.trim()) {
        runDraft({
          current: this.draft.trim(),
          instruction: 'Make it shorter: cut it down hard, one punchy sentence',
        });
      }
    });

    $<HTMLButtonElement>('pw-punchier')?.addEventListener('click', () => {
      if (this.draft.trim()) {
        runDraft({
          current: this.draft.trim(),
          instruction: 'Make it punchier and more direct, with more energy',
        });
      }
    });

    insertBtn?.addEventListener('click', async () => {
      // Disable during the async insert so a double-click can't append twice
      if (insertBtn.disabled) return;
      insertBtn.disabled = true;
      try {
        focusComposeBox();
        const ok = await insertTemplateText(this.draft.trim());
        if (ok) {
          this.closePopover();
        } else if (errEl) {
          errEl.textContent = 'Could not insert. Is the reply box still open?';
          errEl.classList.remove('hidden');
        }
      } finally {
        insertBtn.disabled = false;
      }
    });

    copyBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.draft.trim()).catch(() => {});
    });
  }

  private startStream(
    request: DraftRequest,
    onChunk: (text: string) => void,
    onDone: (metrics: { ttftMs: number; totalMs: number }) => void,
    onError: (error: string) => void
  ): void {
    this.port?.disconnect();
    const port = chrome.runtime.connect({ name: DRAFT_PORT_NAME });
    this.port = port;

    port.onMessage.addListener((message: DraftPortMessage) => {
      if (message.type === 'CHUNK') onChunk(message.text);
      else if (message.type === 'DONE') {
        onDone({ ttftMs: message.ttftMs, totalMs: message.totalMs });
        port.disconnect();
        if (this.port === port) this.port = null;
      } else if (message.type === 'ERROR') {
        onError(message.error);
        port.disconnect();
        if (this.port === port) this.port = null;
      }
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError?.message;
      if (this.port === port) {
        this.port = null;
        if (lastError) onError(`Lost connection to background worker (${lastError}). Reload the extension.`);
      }
    });

    port.postMessage({ type: 'DRAFT', request });
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.host && !e.composedPath().includes(this.host)) {
      // Ignore clicks on the trigger button (it toggles itself)
      const path = e.composedPath();
      if (path.some((el) => (el as HTMLElement)?.getAttribute?.('data-pw-draft-trigger'))) return;
      this.closePopover();
    }
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closePopover();
  };

  private closePopover(): void {
    this.port?.disconnect();
    this.port = null;
    document.removeEventListener('mousedown', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleKeydown);
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.draft = '';
  }

  // ---- Lifecycle -------------------------------------------------------

  updateSettings(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.injectButtons();
    } else {
      this.removeButtons();
      this.closePopover();
    }
  }

  private removeButtons(): void {
    document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach((toolbar) => {
      toolbar.removeAttribute(INJECTED_ATTR);
      toolbar.querySelector('[data-pw-draft-trigger]')?.remove();
    });
  }

  cleanup(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('scroll', this.handleReflow, true);
    window.removeEventListener('resize', this.handleReflow, true);
    this.removeButtons();
    this.closePopover();
    console.log('[Postweaver] Draft button injector cleaned up');
  }
}
