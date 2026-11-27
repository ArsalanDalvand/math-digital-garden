/**
 * Extract note slug from a `/notes/<slug>` path.
 * @param {string | undefined} link
 * @returns {string}
 */
function slugFromLink(link) {
  if (!link || !link.startsWith('/notes/')) return '';
  const raw = link.slice('/notes/'.length).split('#')[0] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Flatten folder tree leaves in reading order.
 * @param {any[]} items
 * @param {Array<{ slug: string; title: string; link: string }>} acc
 */
function collectLeaves(items, acc = []) {
  for (const item of items ?? []) {
    if (Array.isArray(item.items)) {
      collectLeaves(item.items, acc);
    } else if (item.link) {
      const slug = slugFromLink(item.link);
      if (slug) {
        acc.push({ slug, title: String(item.label ?? slug), link: String(item.link) });
      }
    }
  }
  return acc;
}

/**
 * Compute previous and next note links scoped to the active note's top-level book/collection.
 * @param {any[]} tree
 * @param {string} currentSlug
 * @returns {{
 *   prev: { slug: string; title: string; link: string } | null;
 *   next: { slug: string; title: string; link: string } | null;
 *   bookLabel: string;
 *   index: number;
 *   total: number;
 * }}
 */
export function findNoteNeighbors(tree, currentSlug) {
  if (!Array.isArray(tree) || !currentSlug) {
    return { prev: null, next: null, bookLabel: '', index: -1, total: 0 };
  }

  for (const branch of tree) {
    if (Array.isArray(branch.items)) {
      const leaves = collectLeaves(branch.items);
      const index = leaves.findIndex((item) => item.slug === currentSlug);
      if (index !== -1) {
        return {
          prev: index > 0 ? leaves[index - 1] : null,
          next: index < leaves.length - 1 ? leaves[index + 1] : null,
          bookLabel: String(branch.label ?? ''),
          index,
          total: leaves.length,
        };
      }
    }
  }

  const rootLeaves = collectLeaves(tree);
  const rootIndex = rootLeaves.findIndex((item) => item.slug === currentSlug);
  if (rootIndex === -1) {
    return { prev: null, next: null, bookLabel: '', index: -1, total: 0 };
  }
  return {
    prev: rootIndex > 0 ? rootLeaves[rootIndex - 1] : null,
    next: rootIndex < rootLeaves.length - 1 ? rootLeaves[rootIndex + 1] : null,
    bookLabel: '',
    index: rootIndex,
    total: rootLeaves.length,
  };
}
