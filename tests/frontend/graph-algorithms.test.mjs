import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRelation,
  inferSemanticKind,
  buildTypedGraphData,
  fetchGraphSitemap,
  resetGraphSitemapCache,
} from '../../frontend/src/lib/graph/schema.ts';
import { computeDagLayout } from '../../frontend/src/lib/graph/dag-layout.ts';

test('classifyRelation resolves canonical UMKO planes and safe context fallback', () => {
  const req = classifyRelation('rel_requires');
  assert.equal(req.key, 'rel_requires');
  assert.equal(req.plane, 'pedagogy');
  assert.equal(req.dash, 'dashed');
  assert.equal(req.dag, true);

  const proves = classifyRelation('rel_proves');
  assert.equal(proves.plane, 'deduction');
  assert.equal(proves.dash, 'solid');
  assert.equal(proves.dag, true);

  const refutes = classifyRelation('rel_refutes');
  assert.equal(refutes.plane, 'deduction');
  assert.equal(refutes.dash, 'dashed');

  const fallback = classifyRelation('non_existent_relation');
  assert.equal(fallback.key, 'local_context_uses');
  assert.equal(fallback.plane, 'context');
  assert.equal(fallback.dag, false);
});

test('inferSemanticKind prioritizes frontmatter, then #kind tag, then Persian tags/title', () => {
  assert.equal(inferSemanticKind({ kind: 'assertion', tags: ['#مثال'], title: 'مثال ۱' }), 'assertion');
  assert.equal(inferSemanticKind({ tags: ['#kind:concept', '#مسئله'], title: 'تمرین ۱' }), 'concept');
  assert.equal(inferSemanticKind({ tags: ['#قضیه'], title: 'گزارهٔ کمکی' }), 'assertion');
  assert.equal(inferSemanticKind({ tags: ['#تمرین'], title: 'حل تمرین ۲' }), 'solution');
  assert.equal(inferSemanticKind({ tags: [], title: 'تعریف گروه' }), 'concept');
  assert.equal(inferSemanticKind({ tags: [], title: 'یادداشت متفرقه' }), '');
});

test('buildTypedGraphData handles depth BFS, filtering, typed precedence, and mutual curves', () => {
  const sitemap = {
    'notes/a': {
      title: 'مفهوم پایه',
      kind: 'concept',
      links: ['notes/b'],
      backlinks: ['notes/c'],
      rels: {},
    },
    'notes/b': {
      title: 'قضیه اصلی',
      kind: 'assertion',
      links: ['notes/a', 'notes/d'],
      backlinks: ['notes/c'],
      rels: { 'notes/a': ['rel_depends_def'], 'notes/d': ['rel_implies'] },
    },
    'notes/c': {
      title: 'تمرین کاربردی',
      kind: 'problem',
      links: ['notes/a', 'notes/b'],
      rels: { 'notes/a': ['rel_applies_theorem'] },
    },
    'notes/d': {
      title: 'مثال پیشرفته',
      kind: 'example',
      links: ['notes/e'],
      backlinks: ['notes/b'],
    },
    'notes/e': {
      title: 'بخش مستقل',
      links: [],
    },
    'notes/ghost': {
      title: 'ناموجود',
      exists: false,
    },
    'notes/ext': {
      title: 'پیوند بیرونی',
      external: true,
    },
  };

  // Depth 0: isolated focus
  const d0 = buildTypedGraphData(sitemap, 'notes/a', 0);
  assert.equal(d0.nodes.length, 1);
  assert.equal(d0.nodes[0].isCurrent, true);
  assert.equal(d0.links.length, 0);

  // Depth 1 around notes/a includes a, b, c (not d or e)
  const d1 = buildTypedGraphData(sitemap, 'notes/a', 1);
  assert.deepEqual(
    new Set(d1.nodes.map((n) => n.id)),
    new Set(['notes/a', 'notes/b', 'notes/c']),
  );
  // notes/b -> notes/a has rel_depends_def which supersedes plain a -> b link
  const ab = d1.links.find((l) => l.source.id === 'notes/b' && l.target.id === 'notes/a');
  assert.ok(ab, 'Typed b -> a edge must supersede untyped a -> b');
  assert.equal(ab.isTyped, true);
  assert.equal(ab.primaryRel, 'rel_depends_def');
  assert.equal(d1.typedLinkCount, 2);

  // Mutual typed edges separate with symmetric Bezier offset
  const mutualTyped = {
    'notes/x': { title: 'X', links: ['notes/y'], rels: { 'notes/y': ['rel_generalizes'] } },
    'notes/y': { title: 'Y', links: ['notes/x'], rels: { 'notes/x': ['rel_specializes'] } },
  };
  const gMutual = buildTypedGraphData(mutualTyped, 'notes/x', 1);
  assert.equal(gMutual.links.length, 2);
  assert.ok(gMutual.links.every((l) => l.curveOffset === 20));

  // Mutual untyped edges collapse into 1 bidirectional edge
  const mutualPlain = {
    'notes/p': { title: 'P', links: ['notes/q'] },
    'notes/q': { title: 'Q', links: ['notes/p'] },
  };
  const gPlain = buildTypedGraphData(mutualPlain, 'notes/p', 1);
  assert.equal(gPlain.links.length, 1);
  assert.equal(gPlain.links[0].bidirectional, true);

  // Global depth 5 excludes missing & external unless requested
  const gAll = buildTypedGraphData(sitemap, 'notes/a', 5, false);
  assert.equal(gAll.nodes.some((n) => n.id === 'notes/ghost' || n.id === 'notes/ext'), false);
  const gExt = buildTypedGraphData(sitemap, 'notes/a', 5, true);
  assert.equal(gExt.nodes.some((n) => n.id === 'notes/ext'), true);
});

test('computeDagLayout computes topological ranks and safely breaks cycles', () => {
  assert.equal(computeDagLayout([], []).size, 0);

  const sitemap = {
    'notes/base': {
      title: 'مفهوم پایه',
      kind: 'concept',
      links: [],
      backlinks: ['notes/thm'],
    },
    'notes/thm': {
      title: 'قضیه اول',
      kind: 'assertion',
      links: ['notes/base', 'notes/cor'],
      rels: { 'notes/base': ['rel_requires'], 'notes/cor': ['rel_implies'] },
    },
    'notes/cor': {
      title: 'نتیجه قضیه',
      kind: 'assertion',
      links: ['notes/thm'],
      rels: { 'notes/thm': ['rel_depends_proof'] },
    },
    'notes/isolated': { title: 'گره جدا', kind: 'remark', links: [] },
  };
  const { nodes, links } = buildTypedGraphData(sitemap, 'notes/thm', 5);
  const pos = computeDagLayout(nodes, links);

  assert.equal(pos.size, nodes.length);
  const pBase = pos.get('notes/base');
  const pThm = pos.get('notes/thm');
  const pCor = pos.get('notes/cor');
  assert.ok(pBase && pThm && pCor);
  assert.ok(pBase.rank < pThm.rank, 'Prerequisite concept must rank above dependent theorem');
  assert.ok(pThm.rank < pCor.rank, 'Theorem must rank above downstream corollary');
  assert.ok(pBase.y < pThm.y && pThm.y < pCor.y);

  // Explicit 3-cycle stress test: never loops infinitely, all coordinates finite
  const cyclic = {
    'notes/c1': { title: 'C1', links: ['notes/c2'], rels: { 'notes/c2': ['rel_requires'] } },
    'notes/c2': { title: 'C2', links: ['notes/c3'], rels: { 'notes/c3': ['rel_requires'] } },
    'notes/c3': { title: 'C3', links: ['notes/c1'], rels: { 'notes/c1': ['rel_requires'] } },
  };
  const cycData = buildTypedGraphData(cyclic, 'notes/c1', 5);
  const cycPos = computeDagLayout(cycData.nodes, cycData.links);
  assert.equal(cycPos.size, 3);
  for (const val of cycPos.values()) {
    assert.ok(Number.isFinite(val.x) && Number.isFinite(val.y) && Number.isFinite(val.rank));
  }
});

test('fetchGraphSitemap deduplicates concurrent fetches and resets cache cleanly', async () => {
  resetGraphSitemapCache();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ 'notes/a': { title: 'Alpha', links: [] } });
    };
    const [r1, r2] = await Promise.all([
      fetchGraphSitemap('/api/graph.json'),
      fetchGraphSitemap('/api/graph.json'),
    ]);
    assert.equal(calls, 1);
    assert.equal(r1['notes/a'].title, 'Alpha');
    assert.equal(r2['notes/a'].title, 'Alpha');

    // Error resets cache so a subsequent retry can succeed
    resetGraphSitemapCache();
    globalThis.fetch = async () => new Response('err', { status: 503 });
    await assert.rejects(() => fetchGraphSitemap('/api/graph.json'), /503/);
    globalThis.fetch = async () => Response.json({ 'notes/b': { title: 'Beta', links: [] } });
    const recovered = await fetchGraphSitemap('/api/graph.json');
    assert.equal(recovered['notes/b'].title, 'Beta');
  } finally {
    globalThis.fetch = originalFetch;
    resetGraphSitemapCache();
  }
});
