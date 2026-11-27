import katex from 'katex';
import { escapeHtml } from './canvas-sanitize.mjs';
import { renderInlineMathHtml } from './inline-katex.mjs';

const DISPLAY_MATH_RE = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g;

/**
 * Render comment plain text safely with inline $...$ and block $$...$$ KaTeX support.
 * Raw HTML tags are escaped while intentional line breaks map to <br />.
 * @param {string | null | undefined} content
 * @returns {string}
 */
export function renderCommentHtml(content) {
  const raw = String(content ?? '');
  if (raw === '[deleted]') {
    return '<p class="comment-deleted">این دیدگاه حذف شده است.</p>';
  }

  let out = '';
  let lastIndex = 0;
  DISPLAY_MATH_RE.lastIndex = 0;

  /** @param {string} segment */
  const appendProse = (segment) => {
    if (!segment) return;
    const trimmed = segment.replace(/^\r?\n+|\r?\n+$/g, '');
    if (!trimmed) return;
    const htmlLines = trimmed.split(/\r?\n/).map((line) => renderInlineMathHtml(line));
    out += `<p class="comment-paragraph">${htmlLines.join('<br />')}</p>`;
  };

  for (const match of raw.matchAll(DISPLAY_MATH_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      appendProse(raw.slice(lastIndex, start));
    }
    const formula = (match[1] ?? '').trim();
    if (formula) {
      const katexHtml = katex.renderToString(formula, {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore',
      });
      out += `<div class="comment-display-math" dir="ltr">${katexHtml}</div>`;
    } else {
      appendProse(escapeHtml(match[0]));
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < raw.length) {
    appendProse(raw.slice(lastIndex));
  }

  return out || '<p class="comment-paragraph"></p>';
}

/**
 * Filter threaded comments by resolution status without mutating the source array.
 * @template {{ resolved?: boolean }} T
 * @param {readonly T[]} threads
 * @param {'all' | 'open' | 'resolved'} [filter]
 * @returns {{ items: T[], counts: { all: number, open: number, resolved: number } }}
 */
export function filterCommentThreads(threads, filter = 'all') {
  const list = Array.isArray(threads) ? threads : [];
  let open = 0;
  let resolved = 0;
  for (const entry of list) {
    if (entry?.resolved) resolved++;
    else open++;
  }
  const counts = { all: list.length, open, resolved };
  if (filter === 'open') return { items: list.filter((entry) => !entry?.resolved), counts };
  if (filter === 'resolved') return { items: list.filter((entry) => Boolean(entry?.resolved)), counts };
  return { items: [...list], counts };
}
