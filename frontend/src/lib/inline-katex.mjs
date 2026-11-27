import katex from 'katex';
import { escapeHtml } from './canvas-sanitize.mjs';

const INLINE_MATH_RE =
  /(\\\$)|(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$((?:\\.|[^$\n\\])+?)(?<!\\)\$/g;

/**
 * Render prose strings containing inline $...$ or $$...$$ LaTeX formulas
 * into HTML-safe markup for slogans and card summaries.
 * @param {string | undefined | null} text
 * @returns {string}
 */
export function renderInlineMathHtml(text) {
  if (!text || typeof text !== 'string') return '';
  let out = '';
  let lastIndex = 0;
  INLINE_MATH_RE.lastIndex = 0;

  for (const match of text.matchAll(INLINE_MATH_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out += escapeHtml(text.slice(lastIndex, start));
    }
    if (match[1]) {
      out += '$';
    } else {
      const formula = (match[2] ?? match[3] ?? '').trim();
      out += formula
        ? katex.renderToString(formula, { throwOnError: false, strict: 'ignore' })
        : escapeHtml(match[0]);
    }
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    out += escapeHtml(text.slice(lastIndex));
  }
  return out;
}

/**
 * Filter out internal editorial/workflow status tags (e.g. `status/ready`, `status-draft`)
 * while retaining reader-facing topic tags.
 * @param {unknown} tags
 * @returns {string[]}
 */
export function filterDisplayTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag) => typeof tag === 'string' && tag.trim() && !/^status([/-]|$)/i.test(tag.trim()));
}
