import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { buildKnowledge, noteHref } from '../../frontend/src/lib/markdown.mjs';
import { graphSitemap } from '../../frontend/src/lib/graph.mjs';
import { UMKO_KINDS, UMKO_RELATIONS, UMKO_RELATION_PLANES } from '../../frontend/src/lib/umko.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const ts = require('typescript');

const astroSource = () => readFileSync(new URL('../../frontend/src/components/NoteGraph.astro', import.meta.url), 'utf8');
const engineSource = () => readFileSync(new URL('../../frontend/src/scripts/graph-component.ts', import.meta.url), 'utf8');

async function loadEngineHelpers() {
  // Dynamically import transpiled pure helpers via data: ESM URL using real umko.mjs
  const src = engineSource();
  const umkoUrl = new URL('../../frontend/src/lib/umko.mjs', import.meta.url).href;
  const d3Url = new URL('../../frontend/node_modules/d3/src/index.js', import.meta.url).href;
  const patched = src
    .replace(/from ['"]\.\.\/lib\/umko\.mjs['"]/g, `from '${umkoUrl}'`)
    .replace(/from ['"]d3['"]/g, `from '${d3Url}'`);
  const js = ts.transpileModule(patched, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText;
  // Provide minimal HTMLElement stub in Node if not defined
  if (typeof globalThis.HTMLElement === 'undefined') {
    globalThis.HTMLElement = class {};
  }
  const encoded = Buffer.from(js, 'utf8').toString('base64');
  return await import(`data:text/javascript;base64,${encoded}`);
}

function createDOMFixture({ config, garden = [], slug = 'test-note' } = {}) {
  const source = astroSource();
  const resolvedConfig = config || {
    actions: ['reset-zoom', 'fullscreen', 'typed-only', 'render-arrows', 'settings'],
    depth: 1,
    renderArrows: true,
    typedOnly: false,
    layoutMode: 'force',
  };
  const configJsonEscaped = JSON.stringify(resolvedConfig).replace(/"/g, '&quot;');
  const sitemapJsonEscaped = JSON.stringify(graphSitemap(garden)).replace(/"/g, '&quot;');

  const templatePart = source.match(/<section[\s\S]*?<\/section>/)[0]
    .replace('data-config={JSON.stringify(config)}', `data-config="${configJsonEscaped}"`)
    .replace('data-sitemap={JSON.stringify(graphSitemap(garden))}', `data-sitemap="${sitemapJsonEscaped}"`)
    .replace('data-slug={noteHref(slug).slice(1)}', `data-slug="${noteHref(slug).slice(1)}"`);

  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const transpiled = ts.transpile(
    script.replace(/import\(['"][^'"]+graph-component['"]\)/, 'window.loadModule()'),
    { target: ts.ScriptTarget.ES2022 }
  );

  const dom = new JSDOM(templatePart, {
    runScripts: 'outside-only',
    url: 'http://localhost/notes/' + encodeURIComponent(slug)
  });

  return { dom, script: transpiled };
}

const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

// =============================================================================
// Specification 1: graphSitemap & Typed UMKO Relations Export
// =============================================================================

test('graphSitemap: normalizes node IDs and link paths without leading slash for ASCII and Persian slugs', async () => {
  const notes = [
    {
      slug: 'cauchy-schwarz',
      title: 'نامساوی کوشی-شوارتز',
      current_content: '---\nkind: assertion\n---\nارجاع به [[قضیه-بیز]] و [[linear-algebra]].'
    },
    {
      slug: 'قضیه-بیز',
      title: 'قضیه بیز در احتمال',
      current_content: '---\nkind: assertion\n---\nارجاع متقابل به [[cauchy-schwarz]].'
    },
    {
      slug: 'linear-algebra',
      title: 'جبر خطی کاربردی',
      current_content: '---\nkind: concept\n---\nمفاهیم پایه'
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);
  const keys = Object.keys(sitemap);

  assert.equal(keys.length, 3);
  for (const key of keys) {
    assert.doesNotMatch(key, /^\//, `Key ${key} must not have a leading slash`);
    assert.match(key, /^notes\//, `Key ${key} must start with notes/`);
  }

  assert.ok(sitemap['notes/cauchy-schwarz']);
  assert.ok(sitemap['notes/%D9%82%D8%B6%DB%8C%D9%87-%D8%A8%DB%8C%D8%B2'], 'Persian slug must be URL-encoded');

  const csEntry = sitemap['notes/cauchy-schwarz'];
  assert.deepEqual(csEntry.links.sort(), ['notes/%D9%82%D8%B6%DB%8C%D9%87-%D8%A8%DB%8C%D8%B2', 'notes/linear-algebra'].sort());
  assert.deepEqual(csEntry.backlinks, ['notes/%D9%82%D8%B6%DB%8C%D9%87-%D8%A8%DB%8C%D8%B2']);
});

test('graphSitemap: preserves UMKO metadata, tags, and emits compact typed rels map', async () => {
  const notes = [
    {
      slug: 'solution-gauss',
      title: 'راه‌حل معادله دیوفانتوسی',
      current_content: `---
uid: UMKO-SOL-005
kind: solution
subtype: rigorous_full
level: L3_undergrad_core
tracks: [pure_university]
slogan_fa: حل کامل با الگوریتم اقلیدس
tags: ['نظریه_اعداد', '#جبر']
rel_solves: ['[[problem-diophantine]]']
rel_applies_theorem: ['[[bezout-identity]]']
---
شرح راه‌حل کامل`
    },
    {
      slug: 'problem-diophantine',
      title: 'معادله خطی دیوفانتوسی',
      current_content: `---
uid: UMKO-PROB-005
kind: problem
subtype: university_proof
rel_requires: ['[[bezout-identity]]']
---
متن مسئله دیوفانتوسی`
    },
    {
      slug: 'bezout-identity',
      title: 'اتحاد بزو',
      current_content: `---
uid: UMKO-ASSERT-005
kind: assertion
subtype: identity
---
اتحاد بزو`
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);

  const sol = sitemap['notes/solution-gauss'];
  assert.equal(sol.uid, 'UMKO-SOL-005');
  assert.equal(sol.kind, 'solution');
  assert.equal(sol.slogan, 'حل کامل با الگوریتم اقلیدس');
  assert.ok(sol.tags.includes('#kind:solution'));
  assert.ok(sol.tags.includes('#نظریه_اعداد'));
  assert.doesNotMatch(sol.tags.join(' '), /##/);

  // Typed rels map exported cleanly for client semantic graph engine
  assert.deepEqual(sol.rels, {
    'notes/problem-diophantine': ['rel_solves'],
    'notes/bezout-identity': ['rel_applies_theorem'],
  });
  assert.deepEqual(sitemap['notes/problem-diophantine'].rels, {
    'notes/bezout-identity': ['rel_requires'],
  });
  assert.equal(sitemap['notes/bezout-identity'].rels, undefined, 'Nodes without explicit rel_* omit empty rels object');
});

// =============================================================================
// Specification 2: UMKO Orthogonal Relation Planes & Semantic Classification
// =============================================================================

test('UMKO_RELATIONS: every canonical relation maps to a valid orthogonal plane and Persian short label', async () => {
  const { classifyRelation } = await loadEngineHelpers();
  assert.equal(Object.keys(UMKO_RELATION_PLANES).length, 6);

  for (const relKey of Object.keys(UMKO_RELATIONS)) {
    const meta = classifyRelation(relKey);
    assert.ok(meta.plane in UMKO_RELATION_PLANES, `${relKey} must map to a valid visual plane`);
    assert.ok(meta.short && meta.short.length > 0, `${relKey} must define a short Persian label`);
    assert.match(meta.light, /^#[0-9a-fA-F]{6}$/);
    assert.match(meta.dark, /^#[0-9a-fA-F]{6}$/);
    assert.ok(['solid', 'dashed', 'dotted'].includes(meta.dash));
  }

  // Verify semantic visual differentiation
  assert.equal(classifyRelation('rel_proves').plane, 'deduction');
  assert.equal(classifyRelation('rel_proves').dash, 'solid');
  assert.equal(classifyRelation('rel_requires').plane, 'pedagogy');
  assert.equal(classifyRelation('rel_requires').dash, 'dashed');
  assert.equal(classifyRelation('rel_visualizes').plane, 'enrichment');
  assert.equal(classifyRelation('rel_visualizes').dash, 'dotted');
  assert.equal(classifyRelation('rel_refutes').light, '#dc2626');
  assert.equal(classifyRelation('rel_refutes').dash, 'dashed');
  assert.equal(classifyRelation('local_context_uses').plane, 'context');
});

test('inferSemanticKind: infers semantic UMKO kind from Persian tags when kind frontmatter is absent (Axler vault)', async () => {
  const { inferSemanticKind } = await loadEngineHelpers();
  assert.equal(inferSemanticKind({ kind: 'assertion', tags: [] }), 'assertion');
  assert.equal(inferSemanticKind({ kind: '', title: '00-MOC نقشه راه جامع', tags: ['#MOC'] }), 'collection');
  assert.equal(inferSemanticKind({ kind: '', title: 'قضیه ۴۲.۱ آزمون جمع مستقیم', tags: ['#قضیه'] }), 'assertion');
  assert.equal(inferSemanticKind({ kind: '', title: 'تعریف فضای برداری', tags: ['#تعریف', '#مفهوم'] }), 'concept');
  assert.equal(inferSemanticKind({ kind: '', title: 'تمرین ۱۸ بخش ۳.۱', tags: ['#تمرین', '#حل_تشریحی'] }), 'problem');
  assert.equal(inferSemanticKind({ kind: '', title: 'حل تمرین ۱۸', tags: ['#حل_تشریحی'] }), 'solution');
  assert.equal(inferSemanticKind({ kind: '', title: 'تجسم هندسی ضرب داخلی', tags: ['#جئوجبرا'] }), 'visual_lab');
});

// =============================================================================
// Specification 3: Typed Edge Resolution & Curved Multi-Edges & DAG Layout
// =============================================================================

test('buildTypedGraphData: prioritizes typed edges over plain backlinks, curves bidirectional typed pairs, and merges plain pairs', async () => {
  const { buildTypedGraphData } = await loadEngineHelpers();
  const sitemap = {
    'notes/thm': {
      title: 'قضیه اصلی',
      exists: true,
      kind: 'assertion',
      links: ['notes/def', 'notes/proof', 'notes/remark'],
      backlinks: ['notes/proof', 'notes/def', 'notes/remark'],
      rels: { 'notes/def': ['rel_depends_sig'] },
    },
    'notes/proof': {
      title: 'برهان قضیه',
      exists: true,
      kind: 'proof',
      links: ['notes/thm'],
      backlinks: ['notes/thm'],
      rels: { 'notes/thm': ['rel_proves'] },
    },
    'notes/def': {
      title: 'تعریف پایه',
      exists: true,
      kind: 'concept',
      links: ['notes/thm'],
      backlinks: ['notes/thm'],
      rels: { 'notes/thm': ['rel_contrasts_with'] },
    },
    'notes/remark': {
      title: 'یادداشت آزاد',
      exists: true,
      kind: 'remark',
      links: ['notes/thm'],
      backlinks: ['notes/thm'],
    },
  };

  const built = buildTypedGraphData(sitemap, 'notes/thm', 1);
  assert.equal(built.nodes.length, 4);
  assert.equal(built.typedLinkCount, 3);

  // proof -> thm is typed (rel_proves), thm -> proof is plain context -> single typed edge from proof -> thm
  const proofEdge = built.links.find(l => l.source.id === 'notes/proof' && l.target.id === 'notes/thm');
  assert.ok(proofEdge, 'Typed rel_proves edge must be preserved');
  assert.equal(proofEdge.primaryRel, 'rel_proves');
  assert.equal(proofEdge.plane, 'deduction');
  assert.equal(proofEdge.curveOffset, 0);
  assert.equal(
    built.links.filter(l => (l.source.id === 'notes/thm' && l.target.id === 'notes/proof')).length,
    0,
    'Plain reverse wikilink must not duplicate a typed edge'
  );

  // thm <-> def are BOTH typed in opposite directions -> separated into two curved Bezier arcs
  const thmToDef = built.links.find(l => l.source.id === 'notes/thm' && l.target.id === 'notes/def');
  const defToThm = built.links.find(l => l.source.id === 'notes/def' && l.target.id === 'notes/thm');
  assert.ok(thmToDef && defToThm, 'Both opposing typed edges must be kept');
  assert.ok(thmToDef.curveOffset > 0 && defToThm.curveOffset > 0, 'Opposing typed edges must curve apart');

  // thm <-> remark are BOTH plain context -> merged into single bidirectional edge
  const remarkEdges = built.links.filter(
    l =>
      (l.source.id === 'notes/thm' && l.target.id === 'notes/remark') ||
      (l.source.id === 'notes/remark' && l.target.id === 'notes/thm')
  );
  assert.equal(remarkEdges.length, 1);
  assert.equal(remarkEdges[0].bidirectional, true);
  assert.equal(remarkEdges[0].isTyped, false);
});

test('computeDagLayout: orders prerequisites above dependent theorems/proofs and safely handles cycles', async () => {
  const { buildTypedGraphData, computeDagLayout } = await loadEngineHelpers();
  // Backward-linking chain: proof --rel_proves--> theorem --rel_requires--> concept
  const sitemap = {
    'notes/concept': { title: 'تعریف گروه', exists: true, kind: 'concept', links: [], backlinks: ['notes/theorem'] },
    'notes/theorem': {
      title: 'قضیه لاگرانژ',
      exists: true,
      kind: 'assertion',
      links: ['notes/concept'],
      backlinks: ['notes/proof'],
      rels: { 'notes/concept': ['rel_requires'] },
    },
    'notes/proof': {
      title: 'برهان لاگرانژ',
      exists: true,
      kind: 'proof',
      links: ['notes/theorem'],
      backlinks: [],
      rels: { 'notes/theorem': ['rel_proves'] },
    },
  };

  const built = buildTypedGraphData(sitemap, 'notes/theorem', 2);
  const layout = computeDagLayout(built.nodes, built.links);

  const conceptPos = layout.get('notes/concept');
  const theoremPos = layout.get('notes/theorem');
  const proofPos = layout.get('notes/proof');

  assert.ok(conceptPos && theoremPos && proofPos);
  assert.equal(conceptPos.rank, 0, 'Foundational prerequisite concept must sit at top rank 0');
  assert.equal(theoremPos.rank, 1, 'Theorem depending on concept must sit at rank 1');
  assert.equal(proofPos.rank, 2, 'Proof proving theorem must sit at rank 2');
  assert.ok(conceptPos.y < theoremPos.y && theoremPos.y < proofPos.y, 'Higher ranks must flow strictly top-to-bottom');

  // Cycle safety check: A requires B and B requires A must terminate with finite coordinates
  const cyclicSitemap = {
    'notes/a': { title: 'A', exists: true, links: ['notes/b'], backlinks: ['notes/b'], rels: { 'notes/b': ['rel_requires'] } },
    'notes/b': { title: 'B', exists: true, links: ['notes/a'], backlinks: ['notes/a'], rels: { 'notes/a': ['rel_requires'] } },
  };
  const cyclicBuilt = buildTypedGraphData(cyclicSitemap, 'notes/a', 2);
  const cyclicLayout = computeDagLayout(cyclicBuilt.nodes, cyclicBuilt.links);
  for (const pos of cyclicLayout.values()) {
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y), 'Cyclic graphs must still yield finite DAG coordinates');
  }
});

// =============================================================================
// Specification 4: NoteGraph Component Markup, Depth Chips, Legend & Lifecycle
// =============================================================================

test('NoteGraph markup: mounts graph slot above interactive UMKO legend and keeps no legacy starlight-site-graph CSS', () => {
  const source = astroSource();
  assert.doesNotMatch(source, /starlight-site-graph/, 'Legacy starlight-site-graph imports must be removed');
  assert.match(source, /<noscript>برای گراف تعاملی جاوااسکریپت را فعال کنید؛ فهرست پیوندها در ادامه در دسترس است\.<\/noscript>/);
  assert.match(source, /<a href="\/search">فهرست متنی همهٔ یادداشت‌ها<\/a>/);

  const slotPos = source.indexOf('data-graph-slot');
  const legendPos = source.indexOf('class="graph-umko-legend"');
  assert.ok(slotPos > 0 && legendPos > 0 && slotPos < legendPos, 'Graph canvas slot must precede UMKO legend in DOM');

  for (const kind of ['assertion', 'concept', 'problem', 'solution', 'collection', 'visual_lab', 'pitfall']) {
    assert.match(source, new RegExp(`data-legend-kind="${kind}"`), `Legend must expose interactive filter for ${kind}`);
    assert.ok(UMKO_KINDS[kind], `Kind ${kind} must exist in canonical UMKO_KINDS`);
  }
});

test('NoteGraph interaction: depth chips, legend kind filters, error retry, and detached-host guard', async () => {
  const { dom, script } = createDOMFixture();
  const document = dom.window.document;

  let refreshCalls = 0;
  let lastFilter = undefined;
  let moduleCalls = 0;
  let shouldFail = true;

  class MockGraphComponent extends dom.window.HTMLElement {
    constructor() {
      super();
      this.config = { depth: 1, renderArrows: true };
    }
    full_refresh() { refreshCalls++; }
    setKindFilter(k) { lastFilter = k; }
  }

  dom.window.loadModule = async () => {
    moduleCalls++;
    if (shouldFail) throw new Error('Network error');
    return { GraphComponent: MockGraphComponent };
  };

  dom.window.eval(script);
  await tick(40);

  const host = document.querySelector('[data-note-graph]');
  const button = host.querySelector('[data-load-graph]');
  const status = host.querySelector('[data-graph-status]');

  // Failed load exposes retry button
  assert.equal(moduleCalls, 1);
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, 'تلاش مجدد');
  assert.match(status.textContent, /دوباره تلاش کنید/);

  // Successful retry mounts graph-component inside data-graph-slot
  shouldFail = false;
  button.click();
  await tick(40);
  assert.equal(moduleCalls, 2);
  assert.equal(button.hidden, true);
  assert.equal(status.textContent, '');
  const gc = host.querySelector('[data-graph-slot] graph-component');
  assert.ok(gc, 'graph-component must mount inside [data-graph-slot]');

  // Depth chips update config.depth and trigger full_refresh
  const chip2 = host.querySelector('[data-depth="2"]');
  const chip5 = host.querySelector('[data-depth="5"]');
  chip2.click();
  assert.equal(gc.config.depth, 2);
  assert.equal(refreshCalls, 1);
  chip5.click();
  assert.equal(gc.config.depth, 5);
  assert.equal(refreshCalls, 2);

  // Interactive legend filter forwards kind toggle to graph-component
  const assertionBadge = host.querySelector('[data-legend-kind="assertion"]');
  assertionBadge.click();
  assert.equal(lastFilter, 'assertion');

  // Detached host guard
  const { dom: d2, script: s2 } = createDOMFixture();
  let resolve2;
  let activated = 0;
  d2.window.loadModule = () => new Promise(r => { resolve2 = r; });
  d2.window.eval(s2);
  await tick(20);
  d2.window.document.querySelector('[data-note-graph]').remove();
  resolve2({
    GraphComponent: class extends d2.window.HTMLElement {
      connectedCallback() { activated++; }
    }
  });
  await tick(40);
  assert.equal(activated, 0, 'Detached host must not mount or activate graph-component');

  dom.window.close();
  d2.window.close();
});
