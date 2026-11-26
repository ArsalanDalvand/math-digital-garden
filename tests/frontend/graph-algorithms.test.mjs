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

import {
  getKindVisual,
  isMocOrRoadmap,
  isRawOcrOrphan,
} from '../../frontend/src/lib/graph/schema.ts';
import {
  computeNeighborSummary,
  traceLearningPath,
} from '../../frontend/src/lib/graph/path-tracer.ts';
import { getPolygonVertices } from '../../frontend/src/lib/graph/shapes.ts';
import {
  getColorLensLegend,
  resolveNodeColor,
} from '../../frontend/src/lib/graph/color-lens.ts';

test('Phase 4 Feature #1: hides MOC hubs and raw OCR orphans on atomic notes while preserving them on MOCs or when toggled', () => {
  const sitemap = {
    'notes/group': {
      title: 'تعریف گروه',
      kind: 'concept',
      links: ['notes/subgroup', 'notes/moc-alg', 'notes/ocr-p12'],
      rels: { 'notes/subgroup': ['rel_requires'] },
    },
    'notes/subgroup': {
      title: 'زیرگروه نرمال',
      kind: 'concept',
      links: [],
    },
    'notes/moc-alg': {
      title: '00-MOC نقشه راه جبر',
      kind: 'collection',
      tags: ['#kind:collection', '#sub:roadmap'],
      links: ['notes/unrelated-hub-target'],
    },
    'notes/unrelated-hub-target': {
      title: 'قضیه نامرتبط از نقشه راه',
      kind: 'assertion',
      links: [],
    },
    'notes/ocr-p12': {
      title: 'صفحه-12',
      kind: '',
      tags: [],
      chapter_slug: '00-مراجع و اسناد اولیه',
      links: [],
    },
    'notes/ocr-raw': {
      title: 'متن خام OCR جزوه - فصل دوم',
      kind: '',
      tags: [],
      links: [],
    },
  };

  assert.equal(isMocOrRoadmap(sitemap['notes/moc-alg'], 'notes/moc-alg'), true);
  assert.equal(isMocOrRoadmap(sitemap['notes/group'], 'notes/group'), false);
  assert.equal(isRawOcrOrphan(sitemap['notes/ocr-p12'], 'notes/ocr-p12'), true);
  assert.equal(isRawOcrOrphan(sitemap['notes/ocr-raw'], 'notes/ocr-raw'), true);
  assert.equal(isRawOcrOrphan(sitemap['notes/subgroup'], 'notes/subgroup'), false);

  // Depth-2 on atomic note hides MOC + OCR and avoids traversing through MOC to unrelated notes
  const filtered = buildTypedGraphData(sitemap, 'notes/group', 2);
  const filteredIds = new Set(filtered.nodes.map((n) => n.id));
  assert.deepEqual(filteredIds, new Set(['notes/group', 'notes/subgroup']));
  assert.equal(filtered.stats.hiddenHubCount, 2);

  // Explicit opt-in reveals hubs, raw OCR pages, and 2-hop neighbors through the MOC
  const revealed = buildTypedGraphData(sitemap, 'notes/group', 2, { showHubsAndRaw: true });
  const revealedIds = new Set(revealed.nodes.map((n) => n.id));
  assert.equal(revealedIds.has('notes/moc-alg'), true);
  assert.equal(revealedIds.has('notes/ocr-p12'), true);
  assert.equal(revealedIds.has('notes/unrelated-hub-target'), true);
  assert.equal(revealed.stats.hiddenHubCount, 0);

  // When already viewing a MOC page itself, MOCs stay visible by default
  const onMoc = buildTypedGraphData(sitemap, 'notes/moc-alg', 1);
  assert.equal(onMoc.nodes.some((n) => n.id === 'notes/moc-alg'), true);
  assert.equal(onMoc.nodes.some((n) => n.id === 'notes/unrelated-hub-target'), true);
});

test('Phase 4 Features #2 & #6: traces prerequisite and impact chains safely and summarizes direct neighbors', () => {
  const sitemap = {
    'notes/axiom': { title: 'اصل موضوع', kind: 'axiom', links: [] },
    'notes/def': {
      title: 'تعریف همریختی',
      kind: 'concept',
      links: ['notes/axiom'],
      rels: { 'notes/axiom': ['rel_depends_def'] },
    },
    'notes/thm': {
      title: 'قضیه یکریختی',
      kind: 'assertion',
      links: ['notes/def'],
      rels: { 'notes/def': ['rel_requires'] },
    },
    'notes/cor': {
      title: 'نتیجه قضیه',
      kind: 'assertion',
      links: [],
      backlinks: ['notes/thm'],
    },
    'notes/prob': {
      title: 'تمرین ۱',
      kind: 'problem',
      links: ['notes/thm'],
      rels: { 'notes/thm': ['rel_applies_theorem'] },
    },
    'notes/peer': {
      title: 'مفهوم متناظر',
      kind: 'concept',
      links: ['notes/thm'],
      rels: { 'notes/thm': ['rel_dual_of'] },
    },
  };
  // Note: add rel_implies from thm -> cor to test forward relation direction too
  sitemap['notes/thm'].links.push('notes/cor');
  sitemap['notes/thm'].rels['notes/cor'] = ['rel_implies'];

  const graph = buildTypedGraphData(sitemap, 'notes/thm', 5);

  const prereqTrace = traceLearningPath(graph.nodes, graph.links, 'notes/thm', 'prerequisites');
  assert.equal(prereqTrace.nodeHops.get('notes/thm'), 0);
  assert.equal(prereqTrace.nodeHops.get('notes/def'), 1);
  assert.equal(prereqTrace.nodeHops.get('notes/axiom'), 2);
  assert.equal(prereqTrace.nodeHops.has('notes/prob'), false);
  assert.equal(prereqTrace.nodeHops.has('notes/peer'), false);
  assert.deepEqual(
    prereqTrace.orderedSteps.map((s) => [s.nodeId, s.hop]),
    [
      ['notes/def', 1],
      ['notes/axiom', 2],
    ],
  );

  const impactTrace = traceLearningPath(graph.nodes, graph.links, 'notes/thm', 'impact');
  assert.equal(impactTrace.nodeHops.get('notes/cor'), 1);
  assert.equal(impactTrace.nodeHops.get('notes/prob'), 1);
  assert.equal(impactTrace.nodeHops.has('notes/def'), false);

  const summary = computeNeighborSummary(
    graph.nodes,
    graph.links,
    'notes/thm',
    graph.stats.hiddenHubCount,
  );
  assert.equal(summary.prereqCount, 1);
  assert.equal(summary.dependentCount, 1);
  assert.equal(summary.exerciseCount, 1);
  assert.equal(summary.hiddenHubCount, 0);

  // Cycle resistance on prerequisites trace
  const cyclic = {
    'notes/a': { title: 'A', kind: 'concept', links: ['notes/b'], rels: { 'notes/b': ['rel_requires'] } },
    'notes/b': { title: 'B', kind: 'concept', links: ['notes/a'], rels: { 'notes/a': ['rel_requires'] } },
  };
  const cg = buildTypedGraphData(cyclic, 'notes/a', 3);
  const cTrace = traceLearningPath(cg.nodes, cg.links, 'notes/a', 'prerequisites');
  assert.equal(cTrace.nodeHops.get('notes/b'), 1);
  assert.equal(cTrace.orderedSteps.length, 1);
});

test('Phase 4 Feature #4: maps UMKO kinds to subtle geometric shapes and valid polygon vertices', () => {
  assert.equal(getKindVisual('concept').shape, 'circle');
  assert.equal(getKindVisual('axiom').shape, 'double-circle');
  assert.equal(getKindVisual('theory').shape, 'double-circle');
  assert.equal(getKindVisual('assertion').shape, 'hexagon');
  assert.equal(getKindVisual('theorem').shape, 'hexagon');
  assert.equal(getKindVisual('proof').shape, 'square');
  assert.equal(getKindVisual('example').shape, 'diamond');
  assert.equal(getKindVisual('counterexample').shape, 'diamond');
  assert.equal(getKindVisual('problem').shape, 'triangle');
  assert.equal(getKindVisual('collection').shape, 'octagon');
  assert.equal(getKindVisual('').shape, 'circle');

  assert.equal(getPolygonVertices('hexagon', 0, 0, 10).length, 6);
  assert.equal(getPolygonVertices('diamond', 0, 0, 10).length, 4);
  assert.equal(getPolygonVertices('triangle', 0, 0, 10).length, 3);
  assert.equal(getPolygonVertices('octagon', 0, 0, 10).length, 8);
});

test('Phase 4 Feature #5: resolves Color-By lens palettes across kind, level, and chapter with deterministic legends', () => {
  const sampleSitemap = {
    'notes/n1': {
      title: 'مفهوم ۱',
      kind: 'concept',
      level: 'L1_intro',
      book_slug: 'axler',
      chapter_slug: 'فصل اول',
      links: ['notes/n2', 'notes/n3'],
    },
    'notes/n2': {
      title: 'قضیه ۲',
      kind: 'assertion',
      level: 'L4_grad_advanced',
      book_slug: 'axler',
      chapter_slug: 'فصل دوم',
      links: [],
    },
    'notes/n3': {
      title: 'مثال ۳',
      kind: 'example',
      level: '',
      book_slug: 'abstract-algebra',
      chapter_slug: 'فصل اول',
      links: [],
    },
  };
  const { nodes } = buildTypedGraphData(sampleSitemap, 'notes/n1', 2);

  const kindColor = resolveNodeColor(nodes[0], 'kind', false);
  assert.equal(kindColor, nodes[0].lightColor);

  const l1Light = resolveNodeColor(nodes[0], 'level', false);
  const l4Light = resolveNodeColor(nodes[1], 'level', false);
  const l1Dark = resolveNodeColor(nodes[0], 'level', true);
  assert.notEqual(l1Light, l4Light);
  assert.notEqual(l1Light, l1Dark);

  const chLegend = getColorLensLegend(nodes, 'chapter', false);
  assert.ok(chLegend.length >= 2);
  const ch1 = resolveNodeColor(nodes[0], 'chapter', false);
  const ch2 = resolveNodeColor(nodes[1], 'chapter', false);
  assert.notEqual(ch1, ch2);

  const levelLegend = getColorLensLegend(nodes, 'level', false);
  assert.ok(levelLegend.some((item) => item.id === 'L1_intro'));
  assert.ok(levelLegend.some((item) => item.id === 'L4_grad_advanced'));
});
