import { escapeHtml } from './canvas-sanitize.mjs';

/** @type {Record<string, string>} */
const BOOK_LABELS = {
  axler: 'جبر خطی آکسلر',
  'axler-linear-algebra-done-right': 'جبر خطی آکسلر',
  'abstract-algebra': 'جبر مجرد و ماتریس‌ها',
  'abstract-algebra-and-matrices': 'جبر مجرد و ماتریس‌ها',
};

/**
 * Resolve a book slug to its localized Persian display label.
 * @param {string | undefined | null} bookSlug
 * @returns {string}
 */
export function bookDisplayLabel(bookSlug) {
  if (!bookSlug || typeof bookSlug !== 'string') return '';
  const trimmed = bookSlug.trim();
  return BOOK_LABELS[trimmed] || trimmed;
}

/**
 * Convert Obsidian wikilinks and lightweight inline Markdown markup to readable plain text
 * for command-palette subtitles and search snippets.
 * @param {string | undefined | null} text
 * @returns {string}
 */
export function stripInlineMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/!?\[\[[^\]\n|]+\|([^\]\n]+)\]\]/g, '$1')
    .replace(/!?\[\[([^\]\n]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(\*\*|__|~~|==)([^\n]*?)\1/g, '$2')
    .replace(/(^|\s)\*([^*\n]+)\*(?=$|\s|[.,،؛:!؟])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} ch */
function normalizeChar(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if ((code >= 0x064b && code <= 0x065f) || code === 0x0670) return '';
  if (ch === 'ك') return 'ک';
  if (ch === 'ي') return 'ی';
  if (ch === 'آ' || ch === 'أ' || ch === 'إ') return 'ا';
  return ch.toLowerCase();
}

/** @param {string} text */
function buildNormalizedIndexMap(text) {
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const nc = normalizeChar(text[i]);
    if (!nc) continue;
    for (let k = 0; k < nc.length; k++) {
      norm += nc[k];
      map.push(i);
    }
  }
  return { norm, map };
}

/**
 * Strip markdown, HTML-escape unsafe markup, and highlight matching query terms cleanly.
 * @param {string | undefined | null} snippet
 * @param {string | undefined | null} query
 * @returns {string}
 */
export function formatSearchSnippetHtml(snippet, query = '') {
  const plain = stripInlineMarkdown(snippet);
  if (!plain) return '';

  const cleanQuery = typeof query === 'string' ? query.trim() : '';
  if (!cleanQuery) return escapeHtml(plain);

  const { norm: normText, map } = buildNormalizedIndexMap(plain);
  const fullPhrase = buildNormalizedIndexMap(cleanQuery).norm.trim();
  const words = cleanQuery
    .split(/\s+/u)
    .map((w) => buildNormalizedIndexMap(w).norm.trim())
    .filter((w) => w.length >= 2);

  const searchTerms = [];
  if (fullPhrase.length >= 2) searchTerms.push(fullPhrase);
  for (const w of words) {
    if (!searchTerms.includes(w)) searchTerms.push(w);
  }
  if (!searchTerms.length) return escapeHtml(plain);

  /** @type {Array<[number, number]>} */
  const ranges = [];
  for (const term of searchTerms) {
    let from = 0;
    while (from < normText.length) {
      const idx = normText.indexOf(term, from);
      if (idx === -1) break;
      const startOrig = map[idx];
      const endOrig = (map[idx + term.length - 1] ?? plain.length - 1) + 1;
      ranges.push([startOrig, endOrig]);
      from = idx + term.length;
    }
  }

  if (!ranges.length) return escapeHtml(plain);

  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  /** @type {Array<[number, number]>} */
  const merged = [];
  for (const [s, e] of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev[1]) {
      prev[1] = Math.max(prev[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  let html = '';
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) html += escapeHtml(plain.slice(cursor, s));
    html += `<mark class="search-hit">${escapeHtml(plain.slice(s, e))}</mark>`;
    cursor = e;
  }
  if (cursor < plain.length) html += escapeHtml(plain.slice(cursor));
  return html;
}

/**
 * Build `/search?...` URL with one filter parameter removed and pagination reset.
 * @param {{ q?: string; book?: string; kind?: string; track?: string; tag?: string }} params
 * @param {'q' | 'book' | 'kind' | 'track' | 'tag'} removeKey
 * @returns {string}
 */
export function buildSearchFilterHref(params, removeKey) {
  const next = new URLSearchParams();
  /** @type {Array<'q' | 'book' | 'kind' | 'track' | 'tag'>} */
  const keys = ['q', 'book', 'kind', 'track', 'tag'];
  for (const key of keys) {
    if (key === removeKey) continue;
    const val = params[key];
    if (typeof val === 'string' && val.trim()) {
      next.set(key, val.trim());
    }
  }
  const qs = next.toString();
  return qs ? `/search?${qs}` : '/search';
}
