/**
 * Helper to build a lookup function for notes in a shared/personal collection.
 * Resolves Markdown links (relative paths, filenames with/without .md) and Wiki-links.
 *
 * @param {Array<{id: string, title: string, path: string}>} notes
 * @param {string} baseUrl e.g. "/shared/TOKEN?note=" or "/library/"
 * @param {string} [currentNotePath=""] e.g. "01-getting-started/overview"
 */
export function buildNoteLinkResolver(notes, baseUrl, currentNotePath = '') {
  if (!notes || !notes.length) return () => null;

  const currentDir = currentNotePath && currentNotePath.includes('/')
    ? currentNotePath.split('/').slice(0, -1).join('/')
    : '';

  /** @type {Map<string, string>} */
  const map = new Map();

  /** @param {string} str */
  const normalizeKey = (str) => {
    try {
      str = decodeURIComponent(str || '');
    } catch {
      // Keep original if URI malformed
    }
    return str
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '') // strip leading ./ or /
      .replace(/\.(md|markdown)$/i, '') // strip .md
      .normalize('NFC')
      .toLowerCase();
  };

  for (const n of notes) {
    const id = n.id;
    const pathKey = normalizeKey(n.path);
    const titleKey = normalizeKey(n.title);
    const baseKey = normalizeKey(n.path.split('/').pop() || '');

    // 1. Full relative path without ext
    map.set(pathKey, id);
    // 2. Full relative path with .md
    map.set(pathKey + '.md', id);
    // 3. Basename without ext
    if (!map.has(baseKey)) map.set(baseKey, id);
    // 4. Basename with .md
    if (!map.has(baseKey + '.md')) map.set(baseKey + '.md', id);
    // 5. Title without ext
    if (!map.has(titleKey)) map.set(titleKey, id);
    // 6. Title with .md
    if (!map.has(titleKey + '.md')) map.set(titleKey + '.md', id);
    // 7. Title without spaces or dashes (flexible match for Persian titles)
    const collapsed = titleKey.replace(/[\s\-_]+/g, '');
    if (!map.has(collapsed)) map.set(collapsed, id);
  }

  /** @param {string} target */
  return function resolveLink(target) {
    if (!target) return null;
    const trimmed = target.trim();
    if (/^(https?|mailto|ftp):/i.test(trimmed)) return null;
    if (trimmed.startsWith('#')) return null;

    const [rawPath, anchor] = trimmed.split('#');
    const hashPart = anchor ? '#' + encodeURIComponent(anchor) : '';

    // First try relative to current directory if currentDir is present
    if (currentDir && (rawPath.startsWith('./') || rawPath.startsWith('../') || !rawPath.includes('/'))) {
      const parts = currentDir.split('/').filter(Boolean);
      const targetParts = rawPath.split('/').filter(Boolean);
      for (const p of targetParts) {
        if (p === '.') continue;
        if (p === '..') parts.pop();
        else parts.push(p);
      }
      const combined = parts.join('/');
      const combinedKey = normalizeKey(combined);
      if (map.has(combinedKey)) {
        return `${baseUrl}${map.get(combinedKey)}${hashPart}`;
      }
    }

    const key = normalizeKey(rawPath);
    if (map.has(key)) {
      return `${baseUrl}${map.get(key)}${hashPart}`;
    }

    // Basename fallback
    const base = key.split('/').pop() || '';
    if (map.has(base)) {
      return `${baseUrl}${map.get(base)}${hashPart}`;
    }

    // Collapsed spaces fallback
    const collapsed = key.replace(/[\s\-_]+/g, '');
    if (map.has(collapsed)) {
      return `${baseUrl}${map.get(collapsed)}${hashPart}`;
    }

    return null;
  };
}
