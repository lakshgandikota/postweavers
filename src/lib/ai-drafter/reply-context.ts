/**
 * Reply context extraction from X.com's DOM
 *
 * Read-only, on-demand extraction of the tweet being replied to (and its
 * thread) for AI draft context. No observers, no injected UI — called when
 * a compose box gains focus or when the side panel asks for a refresh.
 *
 * X.com's DOM is fragile; every selector here is a heuristic and every
 * failure path returns null/partial data rather than throwing.
 */

import type { ReplyTarget } from '../../types/ai-drafter';

/** Max preceding thread tweets to extract */
const MAX_THREAD_TWEETS = 5;

/**
 * Extract the reply target from the current page state.
 *
 * Two layouts are handled:
 * 1. Reply modal (clicked Reply from the timeline): the original tweet is
 *    rendered inside the dialog above the compose box.
 * 2. Status page (/status/ URL with inline reply box): the focal tweet is
 *    the target; preceding articles are thread context.
 *
 * Returns null when no plausible target is found.
 */
export function extractReplyTarget(): ReplyTarget | null {
  try {
    return extractFromDialog() ?? extractFromStatusPage();
  } catch (error) {
    console.warn('[Postweaver] Reply context extraction failed:', error);
    return null;
  }
}

/**
 * Reply modal: dialog contains the original tweet above the compose area
 */
function extractFromDialog(): ReplyTarget | null {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return null;

  // The dialog must actually contain a compose box, else it's some other modal
  if (!dialog.querySelector('[contenteditable="true"]')) return null;

  const article = dialog.querySelector('article[data-testid="tweet"]');
  const parsed = article ? parseTweetArticle(article) : null;
  if (!parsed) return null;

  return { ...parsed, thread: [] };
}

/**
 * Status page: the focal tweet is the target, preceding tweets are thread
 */
function extractFromStatusPage(): ReplyTarget | null {
  if (!/\/status\/\d+/.test(window.location.pathname)) return null;

  const articles = Array.from(
    document.querySelectorAll('article[data-testid="tweet"]')
  );
  if (articles.length === 0) return null;

  // X marks the focal tweet's article with tabindex="-1"; fall back to the
  // first article, which is the focal tweet when the thread has no ancestors
  const focalIndex = articles.findIndex((a) => a.getAttribute('tabindex') === '-1');
  const targetIndex = focalIndex >= 0 ? focalIndex : 0;
  const targetArticle = articles[targetIndex];
  if (!targetArticle) return null;

  const target = parseTweetArticle(targetArticle);
  if (!target) return null;

  const thread = articles
    .slice(Math.max(0, targetIndex - MAX_THREAD_TWEETS), targetIndex)
    .map(parseTweetArticle)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ authorHandle: t.authorHandle, text: t.text }));

  return { ...target, thread };
}

/**
 * Parse author + text out of a tweet <article>.
 * Exported for the context-basket button, which gathers arbitrary posts.
 */
export function parseTweetArticle(
  article: Element
): Omit<ReplyTarget, 'thread'> | null {
  const text =
    article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';

  const userName = article.querySelector('[data-testid="User-Name"]');
  if (!userName) return null;

  // User-Name contains the display name and an @handle span
  let authorHandle = '';
  let authorName = '';
  for (const span of Array.from(userName.querySelectorAll('span'))) {
    const content = span.textContent?.trim() ?? '';
    if (!authorHandle && content.startsWith('@')) {
      authorHandle = content.slice(1);
    } else if (!authorName && content && !content.startsWith('@') && content !== '·') {
      authorName = content;
    }
  }

  if (!authorHandle && !authorName) return null;
  if (!text) return null;

  const postedAt = article.querySelector('time')?.getAttribute('datetime') ?? null;

  return { authorHandle, authorName: authorName || authorHandle, text, postedAt };
}
