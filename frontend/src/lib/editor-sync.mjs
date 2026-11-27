import { splitEditorMarkdown } from './editor.mjs';

/**
 * Determine whether a personal canonical fork has fallen behind canonical updates.
 * @param {{ canonical?: { current_hash?: string }, fork?: { base_hash?: string } | null } | null | undefined} data
 * @param {boolean} [isLibraryItem]
 * @returns {{ needed: boolean, canonicalHash?: string, baseHash?: string }}
 */
export function detectRebaseNeeded(data, isLibraryItem = false) {
  if (isLibraryItem || !data?.fork || !data?.canonical) {
    return { needed: false };
  }
  const canonicalHash = data.canonical.current_hash || '';
  const baseHash = data.fork.base_hash || '';
  if (!canonicalHash || !baseHash || canonicalHash === baseHash) {
    return { needed: false };
  }
  return { needed: true, canonicalHash, baseHash };
}

/**
 * Summarize line-level additions and removals between two Markdown revisions.
 * Uses bounded prefix/suffix trimming + LCS DP, falling back safely for very large diffs.
 * @param {string | null | undefined} baseText
 * @param {string | null | undefined} nextText
 * @returns {{ added: number, removed: number, changed: boolean }}
 */
export function summarizeDiffStats(baseText, nextText) {
  const aRaw = String(baseText ?? '');
  const bRaw = String(nextText ?? '');
  if (aRaw === bRaw) return { added: 0, removed: 0, changed: false };

  const aLines = aRaw.replace(/\r\n/g, '\n').split('\n');
  const bLines = bRaw.replace(/\r\n/g, '\n').split('\n');

  let start = 0;
  while (start < aLines.length && start < bLines.length && aLines[start] === bLines[start]) {
    start++;
  }
  let aEnd = aLines.length - 1;
  let bEnd = bLines.length - 1;
  while (aEnd >= start && bEnd >= start && aLines[aEnd] === bLines[bEnd]) {
    aEnd--;
    bEnd--;
  }

  const aSlice = aLines.slice(start, aEnd + 1);
  const bSlice = bLines.slice(start, bEnd + 1);
  const m = aSlice.length;
  const n = bSlice.length;

  let common = 0;
  if (m === 0 || n === 0) {
    common = 0;
  } else if (m * n <= 250_000) {
    let prev = new Uint32Array(n + 1);
    let curr = new Uint32Array(n + 1);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        curr[j] =
          aSlice[i - 1] === bSlice[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }
    common = prev[n];
  } else {
    const counts = new Map();
    for (const line of aSlice) counts.set(line, (counts.get(line) ?? 0) + 1);
    for (const line of bSlice) {
      const rem = counts.get(line) ?? 0;
      if (rem > 0) {
        common++;
        counts.set(line, rem - 1);
      }
    }
  }

  const removed = m - common;
  const added = n - common;
  return { added, removed, changed: added > 0 || removed > 0 || aRaw !== bRaw };
}

/**
 * Count body words and characters excluding leading YAML frontmatter.
 * @param {string | null | undefined} markdown
 * @returns {{ words: number, chars: number }}
 */
export function countWordsAndChars(markdown) {
  const { body } = splitEditorMarkdown(String(markdown ?? ''));
  const trimmed = body.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0,
    chars: body.length,
  };
}
