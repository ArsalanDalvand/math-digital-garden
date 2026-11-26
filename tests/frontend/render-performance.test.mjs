import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeIndex,
  clearKnowledgeCaches,
  renderNoteWithIndex,
  renderSingleNote,
} from '../../frontend/src/lib/markdown.mjs';
import {
  clearCatalogueCache,
  fetchNoteMeta,
  fetchVaultNotes,
} from '../../frontend/src/lib/catalogue.mjs';

test.afterEach(() => {
  clearKnowledgeCaches();
  clearCatalogueCache();
});

test('buildKnowledgeIndex resolves graph metadata fast without KaTeX rendering all notes', async () => {
  const notes = Array.from({ length: 200 }, (_, i) => ({
    slug: `note-${i}`,
    title: `قضیه ${i}`,
    current_hash: `hash-${i}`,
    current_content: `---\nkind: assertion\nrel_requires: ${i > 0 ? `["[[note-${i - 1}]]"]` : '[]'}\n---\n## بیان\nمتن با فرمول $\\int_0^1 x^${i % 5} dx$ و پیوند ${i > 0 ? `[[note-${i - 1}#بیان]]` : ''}\n\`[[note-99]]\`\n$$\n[[note-98]]\n$$\n%% [[note-97]] %%`,
  }));

  const t0 = performance.now();
  const index = await buildKnowledgeIndex(notes);
  const dtIndex = performance.now() - t0;

  assert.equal(index.notes.length, 200);
  assert.ok(dtIndex < 1500, `Expected fast index build (<1500ms), got ${dtIndex.toFixed(1)}ms`);
  assert.equal((index.bySlug.get('note-10')).html, undefined, 'Index must not pre-render HTML');
  assert.deepEqual(index.bySlug.get('note-1')?.outgoing, ['note-0']);
  assert.deepEqual(index.bySlug.get('note-0')?.backlinks, ['note-1']);
  assert.deepEqual(index.bySlug.get('note-10')?.resolvedRelations.rel_requires, ['note-9']);
  assert.deepEqual(index.bySlug.get('note-9')?.reverseRelations.rel_requires, ['note-10']);

  // Render a single note and verify cache hit on second call
  const t1 = performance.now();
  const rendered1 = await renderSingleNote(index.bySlug.get('note-1'), index);
  const dtFirst = performance.now() - t1;
  assert.match(rendered1.html, /katex/);
  assert.match(rendered1.html, /href="\/notes\/note-0#بیان"/);
  assert.ok(dtFirst < 400, `Expected single-note render <400ms, got ${dtFirst.toFixed(1)}ms`);

  const t2 = performance.now();
  const rendered2 = await renderSingleNote(index.bySlug.get('note-1'), index);
  const dtCached = performance.now() - t2;
  assert.equal(rendered2.html, rendered1.html);
  assert.ok(dtCached < 15, `Expected cached single-note hit <15ms, got ${dtCached.toFixed(1)}ms`);
});

test('per-note render cache stays valid for unchanged notes when an unrelated note changes', async () => {
  const baseNotes = [
    { slug: 'alpha', title: 'آلفا', current_hash: 'h-alpha-1', current_content: 'متن آلفا $a^2$' },
    { slug: 'beta', title: 'بتا', current_hash: 'h-beta-1', current_content: 'متن بتا $b^2$' },
    { slug: 'gamma', title: 'گاما', current_hash: 'h-gamma-1', current_content: 'ارجاع به ![[beta]]' },
  ];

  const idx1 = await buildKnowledgeIndex(baseNotes);
  const alpha1 = await renderSingleNote(idx1.bySlug.get('alpha'), idx1);
  const gamma1 = await renderSingleNote(idx1.bySlug.get('gamma'), idx1);
  assert.match(gamma1.html, /متن بتا/);

  // Modify beta's content & hash; alpha has unchanged slug/hash/namesFingerprint
  const updatedNotes = [
    baseNotes[0],
    { slug: 'beta', title: 'بتا', current_hash: 'h-beta-2', current_content: 'متن بتا ویرایش‌شد $b^3$' },
    baseNotes[2],
  ];
  const idx2 = await buildKnowledgeIndex(updatedNotes);
  const alpha2 = await renderSingleNote(idx2.bySlug.get('alpha'), idx2);
  const gamma2 = await renderSingleNote(idx2.bySlug.get('gamma'), idx2);

  assert.strictEqual(alpha2.html, alpha1.html, 'Alpha cached HTML string reference should be reused');
  assert.match(gamma2.html, /ویرایش‌شد/, 'Transclusion host must re-render when embedded note changes');
});

test('renderNoteWithIndex resolves wikilinks, anchors, and embeds without buildKnowledge', async () => {
  const notes = [
    { slug: 'target', title: 'مقصد', current_hash: 'ht1', current_content: '## بخش\nمحتوای هدف $x^2$' },
  ];
  const index = await buildKnowledgeIndex(notes);
  const html = await renderNoteWithIndex('پیوند به [[مقصد#بخش]]\n\n![[مقصد]]', index);
  assert.match(html, /href="\/notes\/target#بخش"/);
  assert.match(html, /data-transclusion="target"/);
  assert.match(html, /katex/);
});

test('fetchNoteMeta uses ETag/304 and fetchVaultNotes only re-fetches changed slugs', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let version = 1;
  try {
    globalThis.fetch = async (url, init = {}) => {
      const sUrl = String(url);
      calls.push({ url: sUrl, ifNoneMatch: init?.headers?.['If-None-Match'] || init?.headers?.get?.('if-none-match') });
      if (sUrl.endsWith('/api/catalogue/meta')) {
        const etag = `W/"v${version}"`;
        if (init?.headers?.['If-None-Match'] === etag) {
          return new Response(null, { status: 304, headers: { ETag: etag } });
        }
        return Response.json(
          [
            { slug: 'n1', title: 'یک', book_slug: 'b', chapter_slug: 'c', relative_path: 'b/c/1.md', current_hash: 'h1', updated_at: '2026-01-01T00:00:00Z' },
            { slug: 'n2', title: 'دو', book_slug: 'b', chapter_slug: 'c', relative_path: 'b/c/2.md', current_hash: version === 1 ? 'h2-old' : 'h2-new', updated_at: '2026-01-01T00:00:00Z' },
          ],
          { headers: { ETag: etag } }
        );
      }
      if (sUrl.includes('/api/notes?')) {
        return Response.json([
          { slug: 'n1', title: 'یک', current_hash: 'h1', current_content: 'یک' },
          { slug: 'n2', title: 'دو', current_hash: 'h2-old', current_content: 'قدیم' },
        ]);
      }
      if (sUrl.endsWith('/api/notes/n2')) {
        return Response.json({ slug: 'n2', title: 'دو', current_hash: 'h2-new', current_content: 'جدید' });
      }
      throw new Error(`Unexpected fetch: ${sUrl}`);
    };

    const meta1 = await fetchNoteMeta();
    assert.equal(meta1.etag, 'W/"v1"');
    const vault1 = await fetchVaultNotes();
    assert.equal(vault1.length, 2);

    // Expire TTL manually via Date.now override
    const realNow = Date.now;
    Date.now = () => realNow() + 10_000;
    try {
      const meta2 = await fetchNoteMeta();
      assert.equal(meta2.items.length, 2);
      assert.equal(calls.at(-1).ifNoneMatch, 'W/"v1"');

      version = 2;
      Date.now = () => realNow() + 20_000;
      const vault2 = await fetchVaultNotes();
      assert.equal(vault2.find((n) => n.slug === 'n2')?.current_content, 'جدید');
      assert.ok(calls.some((c) => c.url.endsWith('/api/notes/n2')));
    } finally {
      Date.now = realNow;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
