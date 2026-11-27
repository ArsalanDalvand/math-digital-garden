/**
 * Escape untrusted text before HTML attribute/body rendering in Obsidian Canvas views.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Validate external link targets for canvas `link` nodes, rejecting `javascript:`, `data:`, etc.
 * @param {unknown} rawUrl
 * @returns {string | null}
 */
export function safeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ASCII control characters before checking URL scheme
  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase();
  if (
    normalized.startsWith('https://') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('mailto:')
  ) {
    return trimmed;
  }
  return null;
}
