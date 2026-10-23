**Cache Invalidation Bypass**
- `src/lib/markdown.mjs:74` calls `knowledgeCache.forceFetch(...)`, which explicitly bypasses existing cache entries and forces execution of `fetchMethod` on every invocation.
- Replace `forceFetch` with `knowledgeCache.fetch(...)` so identical keys return cached results instead of re-rendering all notes.

**Cache Thrashing**
- `src/lib/markdown.mjs:71` sets `max: 1`, while `src/pages/notes/[slug].astro:34` injects only the active `slug` into `catalogue` for that request.
- Visiting different note routes produces distinct key strings, evicting the sole cache slot on every page change and causing a 0% hit rate under multi-page browsing or concurrent requests.

**Inefficient Serialization Keying**
- `src/lib/markdown.mjs:71` and `src/lib/markdown.mjs:74` stringify the full corpus markdown and re-parse it with `JSON.parse(key)` inside `fetchMethod`.
- Serializing megabytes of markdown text causes severe CPU and GC overhead; cache by a content hash, revision ID, or composite version token instead of full payload serialization.

**Catalogue Metadata Loss**
- `src/pages/notes/[slug].astro:34` replaces the catalogue entry using `{ ...note, slug }` without spreading `item`.
- If `/api/notes/${slug}` omits `book_slug` or `chapter_slug`, catalogue taxonomy fields are lost and fall back to default labels in the sidebar; merge via `{ ...item, ...note, slug }`.

**Asymmetric Graph Derivation**
- `src/pages/notes/[slug].astro:34` patches only the currently fetched note into `catalogue` per request, leaving the remainder of the notes on potentially stale catalogue data.
- Outgoing links and backlinks between notes become inconsistent across routes because `deriveKnowledge` never operates on a uniformly updated garden snapshot.