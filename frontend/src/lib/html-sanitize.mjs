import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';

const htmlParser = unified().use(rehypeParse, { fragment: true });
const htmlSerializer = unified().use(rehypeStringify, { allowDangerousHtml: false });

const VOID_TAGS = new Set(['br', 'hr', 'wbr']);

const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'button',
  'code',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'iframe',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'rp',
  'rt',
  'ruby',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'wbr',
]);

/**
 * Validate hyperlink targets after stripping ASCII control characters and whitespace.
 * @param {unknown} rawHref
 * @returns {string | null}
 */
export function isSafeHref(rawHref) {
  if (typeof rawHref !== 'string') return null;
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ASCII control characters used to obfuscate URI schemes
  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (
    normalized.startsWith('https://') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('#')
  ) {
    return trimmed;
  }
  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return trimmed;
  }
  return null;
}

/**
 * Allow only external HTTP(S) origins inside user-authored raw HTML iframes.
 * Internal `/vault/` PDF embeds are generated directly as HAST elements in markdown.mjs.
 * @param {unknown} rawSrc
 * @returns {string | null}
 */
export function isSafeIframeSrc(rawSrc) {
  if (typeof rawSrc !== 'string') return null;
  const trimmed = rawSrc.trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ASCII control characters before checking URL scheme
  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (normalized.startsWith('https://') || normalized.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

/** @param {Record<string, unknown>} props @param {string} tag */
function sanitizeElementProperties(props, tag) {
  /** @type {Record<string, unknown>} */
  const out = {};

  if (tag === 'iframe') {
    const safeSrc = isSafeIframeSrc(props.src);
    if (!safeSrc) return null;
    out.src = safeSrc;
    if (props.width != null && /^\d{1,4}(?:%|px)?$/i.test(String(props.width).trim())) {
      out.width = String(props.width).trim();
    }
    if (props.height != null && /^\d{1,4}(?:%|px)?$/i.test(String(props.height).trim())) {
      out.height = String(props.height).trim();
    }
    if (typeof props.title === 'string' && props.title.trim()) {
      out.title = props.title.trim().slice(0, 200);
    }
    out.sandbox = 'allow-scripts allow-popups';
    out.loading = 'lazy';
    out.referrerPolicy = 'no-referrer';
    return out;
  }

  if (typeof props.dir === 'string' && ['ltr', 'rtl', 'auto'].includes(props.dir.toLowerCase())) {
    out.dir = props.dir.toLowerCase();
  }
  if (typeof props.lang === 'string' && /^[a-zA-Z-]{2,16}$/.test(props.lang.trim())) {
    out.lang = props.lang.trim();
  }
  if (typeof props.title === 'string' && props.title.trim()) {
    out.title = props.title.trim().slice(0, 200);
  }
  if (Array.isArray(props.className)) {
    const safeClasses = props.className
      .map((c) => String(c).trim())
      .filter((c) => /^[a-zA-Z0-9_-]+$/.test(c));
    if (safeClasses.length) out.className = safeClasses;
  }

  if (tag === 'a') {
    const safeHref = isSafeHref(props.href);
    if (safeHref) {
      out.href = safeHref;
    }
    if (props.target === '_blank') {
      out.target = '_blank';
      out.rel = ['noopener', 'noreferrer'];
    }
  } else if (tag === 'details') {
    if (props.open !== undefined && props.open !== false) {
      out.open = true;
    }
  } else if (tag === 'th' || tag === 'td') {
    if (typeof props.align === 'string' && ['left', 'right', 'center'].includes(props.align.toLowerCase())) {
      out.align = props.align.toLowerCase();
    }
    for (const spanKey of ['colSpan', 'rowSpan']) {
      const val = Number(props[spanKey]);
      if (Number.isInteger(val) && val >= 1 && val <= 100) {
        out[spanKey] = val;
      }
    }
  }

  return out;
}

/** @param {any} node @returns {any} */
function sanitizeHastNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'text') {
    return { type: 'text', value: String(node.value ?? '') };
  }
  if (node.type !== 'element') {
    return null;
  }
  const tag = String(node.tagName || '').toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    return null;
  }
  const properties = sanitizeElementProperties(node.properties || {}, tag);
  if (properties === null) {
    return null;
  }
  const children = Array.isArray(node.children)
    ? node.children.map(sanitizeHastNode).filter(Boolean)
    : [];
  return {
    type: 'element',
    tagName: tag,
    properties,
    children,
  };
}

/**
 * Sanitize a raw HTML fragment node from remark-rehype using WHATWG HTML parsing.
 * Preserves split inline opening/closing tags (e.g. `<kbd>` ... `</kbd>`) while dropping all
 * unsafe elements, event handlers, obfuscated URIs, and privileged iframe flags.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeRawHtml(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const pureClose = trimmed.match(/^<\/\s*([a-zA-Z][a-zA-Z0-9-]*)\s*>$/);
  if (pureClose) {
    const closeTag = pureClose[1].toLowerCase();
    if (ALLOWED_TAGS.has(closeTag) && !VOID_TAGS.has(closeTag)) {
      return `</${closeTag}>`;
    }
    return '';
  }

  const parsed = htmlParser.parse(raw);
  const children = (parsed.children || []).map(sanitizeHastNode).filter(Boolean);
  if (!children.length) return '';

  const serialized = htmlSerializer.stringify({ type: 'root', children });

  // If Markdown emitted a lone opening tag (e.g. `<kbd>` or `<details open>`) matched by a later
  // closing `raw` node, strip the auto-closed ending tag that rehype-stringify appended.
  const isLoneOpening = !raw.includes('</') && !/\/>\s*$/.test(trimmed);
  if (
    isLoneOpening &&
    children.length === 1 &&
    children[0].type === 'element' &&
    children[0].children.length === 0 &&
    !VOID_TAGS.has(children[0].tagName)
  ) {
    const closeSuffix = `</${children[0].tagName}>`;
    if (serialized.endsWith(closeSuffix)) {
      return serialized.slice(0, -closeSuffix.length);
    }
  }

  return serialized;
}
