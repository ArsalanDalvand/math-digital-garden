import { buildKnowledgeIndex } from './markdown.mjs';

/**
 * @typedef {{
 *   slug: string;
 *   title: string;
 *   book_slug?: string;
 *   chapter_slug?: string;
 *   relative_path?: string;
 *   current_hash?: string;
 *   updated_at?: string;
 *   current_content?: string;
 * }} CatalogueMetaItem
 */

/** @type {Map<string, { promise: Promise<import('./markdown.mjs').Note[]>; expires: number; fetch: typeof globalThis.fetch }>} */
const snapshots = new Map();

/** @type {Map<string, { etag: string; items: CatalogueMetaItem[]; expires: number; fetch: typeof globalThis.fetch; pending?: Promise<{ etag: string; items: CatalogueMetaItem[] }> }>} */
const metaCache = new Map();

/** @type {Map<string, { etag: string; notes: import('./markdown.mjs').Note[]; fetch: typeof globalThis.fetch; pending?: Promise<import('./markdown.mjs').Note[]> }>} */
const vaultCache = new Map();

export function clearCatalogueCache() {
  snapshots.clear();
  metaCache.clear();
  vaultCache.clear();
}

function resolveOrigin() {
  return process.env.API_BASE_URL || import.meta.env?.API_BASE_URL || 'http://127.0.0.1:8000';
}

/** @param {unknown} note */
function isValidNote(note) {
  return (
    typeof note === 'object' &&
    note !== null &&
    typeof /** @type {any} */ (note).slug === 'string' &&
    /^[\p{L}\p{N}_-]{1,255}$/u.test(/** @type {any} */ (note).slug) &&
    typeof /** @type {any} */ (note).title === 'string' &&
    typeof /** @type {any} */ (note).current_content === 'string'
  );
}

/** @param {unknown} item */
function isValidMeta(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof /** @type {any} */ (item).slug === 'string' &&
    /^[\p{L}\p{N}_-]{1,255}$/u.test(/** @type {any} */ (item).slug) &&
    typeof /** @type {any} */ (item).title === 'string'
  );
}

/** @param {CatalogueMetaItem[]} items */
function syntheticEtag(items) {
  const sig = items.map((item) => `${item.slug}:${item.current_hash || item.updated_at || item.title}`).join('|');
  let h = 2166136261;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `W/"meta-${items.length}-${(h >>> 0).toString(16)}"`;
}

/** @param {string} q */
export async function fetchCatalogue(q = '') {
  const originKey = resolveOrigin();
  const key = originKey + '|' + q;
  const existing = snapshots.get(key);
  if (existing && existing.fetch === globalThis.fetch && existing.expires > Date.now()) {
    return existing.promise;
  }
  const promise = fetchFreshCatalogue(q);
  snapshots.set(key, { promise, fetch: globalThis.fetch, expires: Date.now() + 5000 });
  try {
    return await promise;
  } catch (error) {
    snapshots.delete(key);
    throw error;
  }
}

/** @param {string} origin @param {number} offset @param {string} [q] @returns {Promise<import('./markdown.mjs').Note[]>} */
async function fetchNotesPage(origin, offset, q = '') {
  const response = await fetch(
    `${origin}/api/notes?offset=${offset}&limit=100&q=${encodeURIComponent(q)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!response.ok) throw new Error('Catalogue unavailable');
  const page = await response.json();
  if (!Array.isArray(page) || page.length > 100 || page.some((note) => !isValidNote(note))) {
    throw new Error('Invalid catalogue');
  }
  return page;
}

/** @param {string} q @returns {Promise<import('./markdown.mjs').Note[]>} */
async function fetchFreshCatalogue(q = '') {
  const origin = resolveOrigin();
  /** @type {import('./markdown.mjs').Note[]} */
  const notes = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (let offset = 0; ; offset += 100) {
    const page = await fetchNotesPage(origin, offset, q);
    for (const note of page) {
      if (seen.has(note.slug)) throw new Error('Duplicate catalogue entry');
      seen.add(note.slug);
      notes.push(note);
    }
    if (page.length < 100) return notes;
  }
}

/** @returns {Promise<{ etag: string; items: CatalogueMetaItem[] }>} */
export async function fetchNoteMeta() {
  const origin = resolveOrigin();
  const currentFetch = globalThis.fetch;
  const existing = metaCache.get(origin);
  if (existing && existing.fetch === currentFetch) {
    if (existing.expires > Date.now()) {
      return { etag: existing.etag, items: existing.items };
    }
    if (existing.pending) {
      return existing.pending;
    }
  }

  const prevEtag = existing && existing.fetch === currentFetch ? existing.etag : '';
  const pending = (async () => {
    const headers = prevEtag ? { 'If-None-Match': prevEtag } : undefined;
    const response = await currentFetch(`${origin}/api/catalogue/meta`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 304 && existing && existing.fetch === currentFetch) {
      existing.expires = Date.now() + 5000;
      existing.pending = undefined;
      return { etag: existing.etag, items: existing.items };
    }
    if (response.status === 404 || response.status === 405) {
      const notes = await fetchCatalogue('');
      const items = notes.map((n) => ({
        slug: n.slug,
        title: n.title,
        book_slug: n.book_slug || '',
        chapter_slug: n.chapter_slug || '',
        relative_path: n.relative_path || '',
        current_hash: n.current_hash || '',
        current_content: n.current_content,
      }));
      const etag = syntheticEtag(items);
      metaCache.set(origin, { etag, items, expires: Date.now() + 5000, fetch: currentFetch });
      return { etag, items };
    }
    if (!response.ok) {
      throw new Error('Catalogue metadata unavailable');
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      const notes = await fetchCatalogue('');
      const items = notes.map((n) => ({
        slug: n.slug,
        title: n.title,
        book_slug: n.book_slug || '',
        chapter_slug: n.chapter_slug || '',
        relative_path: n.relative_path || '',
        current_hash: n.current_hash || '',
        current_content: n.current_content,
      }));
      const etag = syntheticEtag(items);
      metaCache.set(origin, { etag, items, expires: Date.now() + 5000, fetch: currentFetch });
      return { etag, items };
    }
    if (payload.some((item) => !isValidMeta(item))) {
      throw new Error('Invalid catalogue metadata');
    }
    const etag = response.headers.get('etag') || syntheticEtag(payload);
    metaCache.set(origin, { etag, items: payload, expires: Date.now() + 5000, fetch: currentFetch });
    return { etag, items: payload };
  })();

  if (existing && existing.fetch === currentFetch) {
    existing.pending = pending;
  } else {
    metaCache.set(origin, { etag: '', items: [], expires: 0, fetch: currentFetch, pending });
  }

  try {
    return await pending;
  } catch (error) {
    const cur = metaCache.get(origin);
    if (cur?.pending === pending) {
      if (cur.items.length) cur.pending = undefined;
      else metaCache.delete(origin);
    }
    throw error;
  } finally {
    const cur = metaCache.get(origin);
    if (cur?.pending === pending) {
      cur.pending = undefined;
    }
  }
}

/** @param {string} origin @param {number} totalCount */
async function fetchAllNotesParallel(origin, totalCount) {
  if (totalCount === 0) return [];
  /** @type {number[]} */
  const offsets = [];
  for (let offset = 0; offset < totalCount; offset += 100) {
    offsets.push(offset);
  }
  const pages = await Promise.all(offsets.map((offset) => fetchNotesPage(origin, offset, '')));
  /** @type {import('./markdown.mjs').Note[]} */
  const notes = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const page of pages) {
    for (const note of page) {
      if (seen.has(note.slug)) throw new Error('Duplicate catalogue entry');
      seen.add(note.slug);
      notes.push(note);
    }
  }
  return notes;
}

/** @param {import('./markdown.mjs').Note} [overrideNote] @returns {Promise<import('./markdown.mjs').Note[]>} */
export async function fetchVaultNotes(overrideNote) {
  const origin = resolveOrigin();
  const currentFetch = globalThis.fetch;
  const { etag, items } = await fetchNoteMeta();
  const cached = vaultCache.get(origin);

  /** @type {import('./markdown.mjs').Note[]} */
  let baseNotes;

  if (cached && cached.fetch === currentFetch && cached.etag === etag) {
    baseNotes = cached.notes;
  } else if (cached && cached.fetch === currentFetch && cached.pending && cached.etag === etag) {
    baseNotes = await cached.pending;
  } else if (items.length === 0) {
    baseNotes = [];
    vaultCache.set(origin, { etag, notes: baseNotes, fetch: currentFetch });
  } else if (items.every((item) => typeof item.current_content === 'string')) {
    baseNotes = /** @type {import('./markdown.mjs').Note[]} */ (items);
    vaultCache.set(origin, { etag, notes: baseNotes, fetch: currentFetch });
  } else {
    const loader = (async () => {
      if (cached && cached.fetch === currentFetch && cached.notes.length > 0) {
        const prevBySlug = new Map(cached.notes.map((n) => [n.slug, n]));
        const changed = items.filter((item) => {
          const prev = prevBySlug.get(item.slug);
          return !prev || (item.current_hash && prev.current_hash !== item.current_hash);
        });
        if (changed.length === 0) {
          const filtered = items
            .map((item) => prevBySlug.get(item.slug))
            .filter((n) => /** @type {boolean} */ (Boolean(n)));
          if (filtered.length === items.length) {
            vaultCache.set(origin, { etag, notes: /** @type {import('./markdown.mjs').Note[]} */ (filtered), fetch: currentFetch });
            return /** @type {import('./markdown.mjs').Note[]} */ (filtered);
          }
        } else if (changed.length <= 25) {
          try {
            const fetchedPairs = await Promise.all(
              changed.map(async (item) => {
                if (overrideNote && overrideNote.slug === item.slug && (!item.current_hash || overrideNote.current_hash === item.current_hash)) {
                  return overrideNote;
                }
                const resp = await currentFetch(`${origin}/api/notes/${encodeURIComponent(item.slug)}`, {
                  signal: AbortSignal.timeout(5000),
                });
                if (!resp.ok) throw new Error('Note fetch failed');
                const note = await resp.json();
                if (!isValidNote({ ...note, slug: item.slug })) throw new Error('Invalid note');
                return /** @type {import('./markdown.mjs').Note} */ ({ ...note, slug: item.slug });
              })
            );
            const updatedMap = new Map(fetchedPairs.map((n) => [n.slug, n]));
            const merged = items.map((item) => updatedMap.get(item.slug) ?? prevBySlug.get(item.slug)).filter((n) => Boolean(n));
            if (merged.length === items.length) {
              vaultCache.set(origin, { etag, notes: /** @type {import('./markdown.mjs').Note[]} */ (merged), fetch: currentFetch });
              return /** @type {import('./markdown.mjs').Note[]} */ (merged);
            }
          } catch {
            // Fall through to full parallel refresh if single-note fetch fails.
          }
        }
      }
      const fresh = await fetchAllNotesParallel(origin, items.length);
      vaultCache.set(origin, { etag, notes: fresh, fetch: currentFetch });
      return fresh;
    })();

    vaultCache.set(origin, { etag, notes: cached?.notes ?? [], fetch: currentFetch, pending: loader });
    try {
      baseNotes = await loader;
    } catch (error) {
      const cur = vaultCache.get(origin);
      if (cur?.pending === loader) vaultCache.delete(origin);
      throw error;
    }
  }

  if (overrideNote && typeof overrideNote.slug === 'string') {
    let found = false;
    const result = baseNotes.map((n) => {
      if (n.slug === overrideNote.slug) {
        found = true;
        return overrideNote;
      }
      return n;
    });
    if (!found) result.push(overrideNote);
    return result;
  }
  return baseNotes;
}

/** @param {import('./markdown.mjs').Note} [overrideNote] */
export async function getKnowledgeIndex(overrideNote) {
  const notes = await fetchVaultNotes(overrideNote);
  return buildKnowledgeIndex(notes);
}
