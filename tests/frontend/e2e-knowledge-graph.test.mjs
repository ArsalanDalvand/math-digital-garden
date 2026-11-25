import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import { buildKnowledge, noteHref } from '../../frontend/src/lib/markdown.mjs';
import { graphSitemap } from '../../frontend/src/lib/graph.mjs';
import { UMKO_KINDS } from '../../frontend/src/lib/umko.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const ts = require('typescript');

const astroSource = () => readFileSync(new URL('../../frontend/src/components/NoteGraph.astro', import.meta.url), 'utf8');

function getComponentConfig() {
  const source = astroSource();
  const frontmatter = source.match(/^---([\s\S]*?)---/m)[1];
  const configMatch = frontmatter.match(/const config = (\{[\s\S]*?\n\};)/);
  assert.ok(configMatch, 'NoteGraph.astro must declare a config object');
  return vm.runInNewContext('(' + configMatch[1].replace(/;$/, '') + ')');
}

function getFitGraphFunction() {
  const source = astroSource();
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const transpiled = ts.transpile(script, { target: ts.ScriptTarget.ES2022 });
  const fitGraphMatch = transpiled.match(/function fitGraph\([\s\S]*?\n\}/);
  assert.ok(fitGraphMatch, 'NoteGraph script must contain fitGraph function');
  return vm.runInNewContext('(' + fitGraphMatch[0] + ')');
}

function createDOMFixture({ config, garden = [], slug = 'test-note' } = {}) {
  const source = astroSource();
  const resolvedConfig = config || {
    actions: ['fullscreen', 'depth', 'reset-zoom', 'render-arrows', 'settings'],
    depth: 1,
    renderArrows: true
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
// Specification 1: graphSitemap generation
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
  for (const link of csEntry.links) {
    assert.doesNotMatch(link, /^\//, `Link ${link} must not start with a leading slash`);
    assert.match(link, /^notes\//, `Link ${link} must start with notes/`);
  }
  for (const backlink of csEntry.backlinks) {
    assert.doesNotMatch(backlink, /^\//, `Backlink ${backlink} must not start with a leading slash`);
    assert.match(backlink, /^notes\//, `Backlink ${backlink} must start with notes/`);
  }

  assert.deepEqual(csEntry.links.sort(), ['notes/%D9%82%D8%B6%DB%8C%D9%87-%D8%A8%DB%8C%D8%B2', 'notes/linear-algebra'].sort());
  assert.deepEqual(csEntry.backlinks, ['notes/%D9%82%D8%B6%DB%8C%D9%87-%D8%A8%DB%8C%D8%B2']);
});

test('graphSitemap: includes title, links, backlinks, tags, exists=true, and external=false in entries', async () => {
  const notes = [
    {
      slug: 'source-node',
      title: 'گره مبدأ',
      current_content: '---\ntags: [هندسه]\n---\nپیوند به [[target-node]].'
    },
    {
      slug: 'target-node',
      title: 'گره مقصد',
      current_content: '---\ntags: [توپولوژی]\n---\nبدون پیوند خروجی.'
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);

  const source = sitemap['notes/source-node'];
  assert.equal(source.title, 'گره مبدأ');
  assert.equal(source.exists, true);
  assert.equal(source.external, false);
  assert.deepEqual(source.links, ['notes/target-node']);
  assert.deepEqual(source.backlinks, []);
  assert.ok(source.tags.includes('#هندسه'));

  const target = sitemap['notes/target-node'];
  assert.equal(target.title, 'گره مقصد');
  assert.equal(target.exists, true);
  assert.equal(target.external, false);
  assert.deepEqual(target.links, []);
  assert.deepEqual(target.backlinks, ['notes/source-node']);
  assert.ok(target.tags.includes('#توپولوژی'));
});

test('graphSitemap: correctly formats UMKO kind, subtype, level, and track tags with deduplication', async () => {
  const notes = [
    {
      slug: 'pythagoras-theorem',
      title: 'قضیه فیثاغورس',
      current_content: `---
uid: UMKO-ASSERT-042
kind: assertion
subtype: theorem
level: L3_undergrad_core
tracks: [pure_university, applied_eng]
tags: ['هندسه اقلیدسی', '#مثلثات']
---
صورت قضیه و روابط مربوطه.`
    },
    {
      slug: 'algebra-intro',
      title: 'مقدمات جبر',
      current_content: `---
uid: UMKO-CONCEPT-010
kind: concept
subtype: structure
level: L1_intro
tracks: [olympiad]
tags: ['جبر']
---
مفاهیم پایه جبر.`
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);
  const pyth = sitemap['notes/pythagoras-theorem'];

  assert.ok(pyth.tags.includes('#kind:assertion'), 'Must include #kind:assertion');
  assert.ok(pyth.tags.includes('#sub:theorem'), 'Must include #sub:theorem');
  assert.ok(pyth.tags.includes('#level:L3_undergrad_core'), 'Must include #level:L3_undergrad_core');
  assert.ok(pyth.tags.includes('#track:pure_university'), 'Must include #track:pure_university');
  assert.ok(pyth.tags.includes('#track:applied_eng'), 'Must include #track:applied_eng');
  assert.ok(pyth.tags.includes('#هندسه اقلیدسی'), 'User tag must be prefixed with #');
  assert.ok(pyth.tags.includes('#مثلثات'), 'Existing # tag must not become ##');
  assert.doesNotMatch(pyth.tags.join(' '), /##/, 'Tags must never have double hashtags');

  const uniqueTags = new Set(pyth.tags);
  assert.equal(uniqueTags.size, pyth.tags.length, 'All tags must be deduplicated');

  const alg = sitemap['notes/algebra-intro'];
  assert.ok(alg.tags.includes('#kind:concept'));
  assert.ok(alg.tags.includes('#sub:structure'));
  assert.ok(alg.tags.includes('#level:L1_intro'));
  assert.ok(alg.tags.includes('#track:olympiad'));
});

test('graphSitemap: preserves slogan, uid, kind, and subtype in sitemap nodes with safe defaults', async () => {
  const notes = [
    {
      slug: 'riemann-hypothesis',
      title: 'حدس ریمان',
      current_content: `---
uid: UMKO-ASSERT-999
kind: assertion
subtype: conjecture
level: L5_research
slogan_fa: صفرهای غیربدیهی تابع زتا روی خط بحرانی قرار دارند
---
متن پژوهشی.`
    },
    {
      slug: 'minimal-note',
      title: 'یادداشت ساده بدون فرانت‌متر UMKO',
      current_content: 'متن یادداشت ساده بدون متادیتا.'
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);

  const riemann = sitemap['notes/riemann-hypothesis'];
  assert.equal(riemann.uid, 'UMKO-ASSERT-999');
  assert.equal(riemann.kind, 'assertion');
  assert.equal(riemann.subtype, 'conjecture');
  assert.equal(riemann.level, 'L5_research');
  assert.equal(riemann.slogan, 'صفرهای غیربدیهی تابع زتا روی خط بحرانی قرار دارند');

  const minimal = sitemap['notes/minimal-note'];
  assert.equal(minimal.uid, '');
  assert.equal(minimal.kind, '');
  assert.equal(minimal.subtype, '');
  assert.equal(minimal.level, '');
  assert.equal(minimal.slogan, '');
  assert.deepEqual(minimal.tags, []);
});

test('graphSitemap: resolves UMKO semantic relations as directional graph edges', async () => {
  const notes = [
    {
      slug: 'solution-gauss',
      title: 'راه‌حل معادله دیوفانتوسی',
      current_content: `---
uid: UMKO-SOL-005
kind: solution
subtype: rigorous_full
rel_solves: ['[[problem-diophantine]]']
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
---
متن مسئله دیوفانتوسی`
    }
  ];

  const garden = await buildKnowledge(notes);
  const sitemap = graphSitemap(garden);

  const sol = sitemap['notes/solution-gauss'];
  const prob = sitemap['notes/problem-diophantine'];

  assert.deepEqual(sol.links, ['notes/problem-diophantine'], 'rel_solves must create an outgoing link');
  assert.deepEqual(prob.backlinks, ['notes/solution-gauss'], 'rel_solves target must receive a backlink');
});

// =============================================================================
// Specification 2: Graph component configuration & lifecycle
// =============================================================================

test('component config: specifies tagRenderMode "same" and styles matching canonical UMKO kind colors', () => {
  const config = getComponentConfig();

  assert.equal(config.tagRenderMode, 'same', 'tagRenderMode must be "same" for unified tag rendering');
  assert.ok(config.tagStyles, 'tagStyles must be configured');

  const requiredKinds = [
    'assertion', 'concept', 'proof', 'problem', 'solution',
    'technique', 'hint_ladder', 'problem_archetype', 'pitfall',
    'visual_lab', 'collection', 'axiom', 'theory', 'remark'
  ];

  for (const kind of requiredKinds) {
    const tagKey = `#kind:${kind}`;
    const style = config.tagStyles[tagKey];
    assert.ok(style, `config.tagStyles must define styling for ${tagKey}`);
    assert.equal(style.shape, 'circle', `${tagKey} shape must be circle`);
    assert.ok(typeof style.shapeSize === 'number' && style.shapeSize > 0, `${tagKey} shapeSize must be positive`);
    assert.ok(style.shapeColor, `${tagKey} must have shapeColor`);
    assert.ok(style.strokeColor, `${tagKey} must have strokeColor`);
    assert.ok(style.strokeWidth >= 1, `${tagKey} must have strokeWidth >= 1`);

    if (UMKO_KINDS[kind]) {
      assert.equal(
        style.shapeColor.toLowerCase(),
        UMKO_KINDS[kind].color.toLowerCase(),
        `${tagKey} shapeColor must match canonical UMKO_KINDS.${kind}.color`
      );
    }
  }

  assert.deepEqual([...config.actions], ['reset-zoom', 'fullscreen', 'render-arrows', 'settings']);
  assert.equal(config.renderArrows, true);
  assert.equal(config.depth, 1);
});

test('component markup: provides accessible visual taxonomy legend for core mathematical node types', () => {
  const source = astroSource();

  assert.match(source, /class="graph-umko-legend"[^>]*aria-label="راهنمای دسته‌بندی گره‌های گراف"/);

  const legendTypes = [
    { label: 'قضیه', color: '#1d4ed8' },
    { label: 'مفهوم', color: '#0d9488' },
    { label: 'مسئله', color: '#ea580c' },
    { label: 'راه‌حل', color: '#059669' },
    { label: 'نقشه راه', color: '#7c3aed' },
    { label: 'شبیه‌ساز', color: '#0284c7' },
    { label: 'دام', color: '#b45309' }
  ];

  for (const item of legendTypes) {
    const badgePattern = new RegExp(`--badge-c:\\s*${item.color}[^"]*"[^>]*>[^<]*${item.label}`);
    assert.match(source, badgePattern, `Legend must include badge for ${item.label} with color ${item.color}`);
  }
});

test('component markup & interaction: depth quick selector chips support 1 step, 2 steps, and global depth 5', async () => {
  const source = astroSource();

  assert.match(source, /<div class="graph-depth-quickbar"/);
  assert.match(source, /<span class="depth-label">شعاع:<\/span>/);
  assert.match(source, /<button[^>]*class="depth-chip active"[^>]*data-depth="1"[^>]*title="همسایگان مستقیم \(عمق ۱\)"[^>]*>۱ گام<\/button>/);
  assert.match(source, /<button[^>]*class="depth-chip"[^>]*data-depth="2"[^>]*title="دو لایه ارتباطی \(عمق ۲\)"[^>]*>۲ گام<\/button>/);
  assert.match(source, /<button[^>]*class="depth-chip"[^>]*data-depth="5"[^>]*title="کل پایگاه دانش"[^>]*>سراسری<\/button>/);

  const { dom, script } = createDOMFixture();
  const document = dom.window.document;

  let refreshCalls = 0;
  class MockGraphComponent extends dom.window.HTMLElement {
    constructor() {
      super();
      this.config = { depth: 1, renderArrows: true };
      this.simulator = {
        nodes: [{ x: 10, y: 10 }],
        centerTransform: { x: 0, y: 0, translate: () => ({ x: 0, y: 0 }) },
        zoomTransform: { constructor: Object },
        renderer: { resetZoom: () => {} },
        updateZoom: () => {}
      };
    }
    full_refresh() { refreshCalls++; }
  }

  dom.window.loadModule = async () => ({ GraphComponent: MockGraphComponent });
  dom.window.eval(script);

  await tick(50);

  const host = document.querySelector('[data-note-graph]');
  const chips = host.querySelectorAll('[data-depth]');
  assert.equal(chips.length, 3, 'Must render 3 depth selector chips');

  const chip1 = chips[0];
  const chip2 = chips[1];
  const chip5 = chips[2];

  assert.equal(chip1.classList.contains('active'), true);
  assert.equal(chip2.classList.contains('active'), false);
  assert.equal(chip5.classList.contains('active'), false);

  chip2.click();
  const graphComp = host.querySelector('graph-component');
  assert.equal(chip1.classList.contains('active'), false);
  assert.equal(chip2.classList.contains('active'), true);
  assert.equal(graphComp.config.depth, 2, 'Clicking chip 2 must update config.depth to 2');
  assert.equal(refreshCalls, 1, 'Clicking chip 2 must trigger full_refresh');

  chip5.click();
  assert.equal(chip2.classList.contains('active'), false);
  assert.equal(chip5.classList.contains('active'), true);
  assert.equal(graphComp.config.depth, 5, 'Clicking chip 5 must update config.depth to 5');
  assert.equal(refreshCalls, 2, 'Clicking chip 5 must trigger full_refresh');

  dom.window.close();
});

test('depth chip activates graph load button when clicked before graph is loaded', async () => {
  const { dom, script } = createDOMFixture();
  const document = dom.window.document;

  let moduleLoadCalls = 0;
  dom.window.loadModule = async () => {
    moduleLoadCalls++;
    return {
      GraphComponent: class extends dom.window.HTMLElement {
        constructor() { super(); this.config = { depth: 1 }; }
      }
    };
  };

  dom.window.eval(script);
  await tick(50);

  const host = document.querySelector('[data-note-graph]');
  const loadButton = host.querySelector('[data-load-graph]');
  const chip2 = host.querySelector('[data-depth="2"]');

  loadButton.hidden = false;
  const initialLoads = moduleLoadCalls;
  chip2.click();

  await tick(50);
  assert.ok(moduleLoadCalls >= initialLoads, 'Clicking depth chip before load triggers graph loading');

  dom.window.close();
});

test('accessible controls: Persian labels for action buttons, canvas, sliders, and popup controls', async () => {
  const { dom, script } = createDOMFixture({
    config: { actions: ['fullscreen', 'depth', 'reset-zoom', 'render-arrows', 'settings'], depth: 1, renderArrows: true }
  });
  const document = dom.window.document;

  class AccessibleGraphComponent extends dom.window.HTMLElement {
    constructor() {
      super();
      this.config = { depth: 1, renderArrows: true };
      this.simulator = {
        nodes: [{ x: 5, y: 5 }],
        centerTransform: { x: 0, y: 0, translate: () => ({ x: 0, y: 0 }) },
        zoomTransform: { constructor: Object },
        renderer: { resetZoom: () => {} },
        updateZoom: () => {},
        requestRender: false
      };
    }
  }

  dom.window.loadModule = async () => ({ GraphComponent: AccessibleGraphComponent });
  dom.window.eval(script);

  await tick(50);

  const host = document.querySelector('[data-note-graph]');
  const gc = host.querySelector('graph-component');
  assert.ok(gc, 'graph-component must be mounted');

  gc.innerHTML = `
    <button class="slsg-graph-action-button"></button>
    <button class="slsg-graph-action-button"></button>
    <button class="slsg-graph-action-button"></button>
    <button class="slsg-graph-action-button"></button>
    <button class="slsg-graph-action-button"></button>
    <canvas width="600" height="400"></canvas>
    <div class="slsg-value-slider"><span class="slsg-value-slider-label">Repel Force</span><input type="range" /></div>
    <div class="slsg-value-slider"><span class="slsg-value-slider-label">Link Distance</span><input type="range" /></div>
    <div class="slsg-popup-menu"></div>
  `;

  await tick(50);

  const actionButtons = gc.querySelectorAll('.slsg-graph-action-button');
  assert.equal(actionButtons.length, 5);
  const expectedLabels = [
    'تمام‌صفحه یا بازگشت',
    'تغییر عمق ارتباطات؛ سطح ۵ گراف سراسری',
    'بازنشانی زوم',
    'نمایش یا حذف جهت پیوندها',
    'تنظیمات گراف'
  ];

  actionButtons.forEach((btn, idx) => {
    assert.equal(btn.type, 'button', 'Action buttons must have type="button"');
    assert.equal(btn.getAttribute('aria-label'), expectedLabels[idx]);
    assert.equal(btn.title, expectedLabels[idx]);
    assert.ok(btn.dataset.graphAction);
  });

  const canvas = gc.querySelector('canvas');
  assert.equal(canvas.getAttribute('role'), 'img');
  assert.equal(canvas.getAttribute('aria-label'), 'نمودار ارتباطات؛ فهرست متنی پیوندها در ادامهٔ صفحه است');

  const sliders = gc.querySelectorAll('.slsg-value-slider');
  assert.equal(sliders[0].querySelector('.slsg-value-slider-label').textContent, 'نیروی دافعه');
  assert.equal(sliders[0].querySelector('input').getAttribute('aria-label'), 'نیروی دافعه');
  assert.equal(sliders[1].querySelector('.slsg-value-slider-label').textContent, 'طول پیوندها');
  assert.equal(sliders[1].querySelector('input').getAttribute('aria-label'), 'طول پیوندها');

  const extraSettings = gc.querySelector('[data-extra-settings]');
  assert.ok(extraSettings, 'Must inject extra settings into popup menu');
  const depthSelect = extraSettings.querySelector('select');
  assert.equal(depthSelect.getAttribute('aria-label'), 'عمق ارتباطات');
  assert.equal(depthSelect.options.length, 6);

  const arrowsCheck = extraSettings.querySelector('input[type="checkbox"]');
  assert.equal(arrowsCheck.checked, true);
  arrowsCheck.checked = false;
  arrowsCheck.onchange();
  assert.equal(gc.config.renderArrows, false);
  assert.equal(gc.simulator.requestRender, true);

  gc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(gc.querySelector('.slsg-popup-menu'), null, 'Escape key must close popup menu');

  dom.window.close();
});

test('fitGraph: scales and centers nodes within canvas boundaries without division by zero', () => {
  const fitGraph = getFitGraphFunction();

  class MockTransform {
    constructor(k = 1, x = 0, y = 0) {
      this.k = k;
      this.x = x;
      this.y = y;
    }
    translate(dx, dy) {
      return new MockTransform(this.k, this.x + dx, this.y + dy);
    }
  }

  function createMockGraph({ nodes = [], width = 800, height = 600, hasCanvas = true } = {}) {
    const sim = {
      nodes,
      userZoomed: false,
      centerTransform: new MockTransform(1, 10, 20),
      zoomTransform: new MockTransform(1, 0, 0),
      renderer: {
        resetZoom(t) { this.lastReset = t; }
      },
      updateZoom(k, x, y, flag) {
        this.lastUpdate = { k, x, y, flag };
      },
      requestRender: false
    };

    const canvas = hasCanvas ? { clientWidth: width, clientHeight: height } : null;
    return {
      simulator: sim,
      querySelector: sel => (sel === 'canvas' ? canvas : null)
    };
  }

  // 1. Single node (left === right, top === bottom) -> division by zero safeguard
  const single = createMockGraph({ nodes: [{ x: 50, y: 50 }] });
  fitGraph(single);
  assert.equal(single.simulator.userZoomed, true);
  assert.equal(single.simulator.requestRender, true);
  assert.ok(Number.isFinite(single.simulator.lastUpdate.k), 'Scale k must be finite');
  assert.ok(Number.isFinite(single.simulator.lastUpdate.x), 'Position x must be finite');
  assert.ok(Number.isFinite(single.simulator.lastUpdate.y), 'Position y must be finite');
  assert.equal(single.simulator.lastUpdate.k, 1);
  assert.equal(single.simulator.lastUpdate.x, 800 / 2 - 50 * 1);
  assert.equal(single.simulator.lastUpdate.y, 600 / 2 - 50 * 1);

  // 2. Multiple coincident nodes at identical coordinates
  const coincident = createMockGraph({
    nodes: [{ x: 120, y: 340 }, { x: 120, y: 340 }, { x: 120, y: 340 }]
  });
  fitGraph(coincident);
  assert.equal(coincident.simulator.lastUpdate.k, 1);
  assert.ok(Number.isFinite(coincident.simulator.lastUpdate.x));
  assert.ok(Number.isFinite(coincident.simulator.lastUpdate.y));

  // 3. Widely distributed nodes requiring downscaling (k < 1)
  const wide = createMockGraph({
    nodes: [{ x: -1000, y: -500 }, { x: 1000, y: 500 }],
    width: 900,
    height: 700
  });
  fitGraph(wide);
  const wideK = wide.simulator.lastUpdate.k;
  assert.ok(wideK < 1, `Wide graph scale (${wideK}) must be < 1`);
  assert.equal(wideK, (900 - 100) / 2000); // 800 / 2000 = 0.4
  assert.equal(wide.simulator.lastUpdate.x, 900 / 2);
  assert.equal(wide.simulator.lastUpdate.y, 700 / 2);

  // 4. Tightly clustered nodes: zoom must not exceed 1
  const tight = createMockGraph({
    nodes: [{ x: 10, y: 10 }, { x: 12, y: 14 }]
  });
  fitGraph(tight);
  assert.equal(tight.simulator.lastUpdate.k, 1, 'Clustered nodes zoom must be capped at 1');

  // 5. Zero canvas dimension: graceful early return without crash
  const zeroCanvas = createMockGraph({ nodes: [{ x: 10, y: 10 }], width: 0, height: 0 });
  fitGraph(zeroCanvas);
  assert.equal(zeroCanvas.simulator.userZoomed, false);

  // 6. Non-finite or empty node coordinates: graceful early return
  const invalidNodes = createMockGraph({ nodes: [{ x: NaN, y: Infinity }, { x: -Infinity, y: 0 }] });
  fitGraph(invalidNodes);
  assert.equal(invalidNodes.simulator.userZoomed, false);

  const emptyNodes = createMockGraph({ nodes: [] });
  fitGraph(emptyNodes);
  assert.equal(emptyNodes.simulator.userZoomed, false);

  // 7. Missing canvas element: graceful early return
  const noCanvas = createMockGraph({ nodes: [{ x: 10, y: 10 }], hasCanvas: false });
  fitGraph(noCanvas);
  assert.equal(noCanvas.simulator.userZoomed, false);
});

test('graph lifecycle: initial inert state, accessible noscript/text fallbacks, pending indicator, and retry on failure', async () => {
  const source = astroSource();

  // 1. Static markup checks
  assert.doesNotMatch(source, /import \{ Graph \} from/, 'Upstream renderer must not be imported statically');
  assert.match(source, /<noscript>برای گراف تعاملی جاوااسکریپت را فعال کنید؛ فهرست پیوندها در ادامه در دسترس است\.<\/noscript>/);
  assert.match(source, /<a href="\/search">فهرست متنی همهٔ یادداشت‌ها<\/a>/);
  assert.match(source, /role="status"[^>]*data-graph-status/);
  assert.match(source, /<template[^>]*data-graph-template/);

  // 2. Dynamic lifecycle, error recovery, and detachment guard
  const { dom, script } = createDOMFixture();
  const document = dom.window.document;
  const host = document.querySelector('[data-note-graph]');
  const button = host.querySelector('[data-load-graph]');
  const status = host.querySelector('[data-graph-status]');

  let moduleCalls = 0;
  let shouldFail = true;

  dom.window.loadModule = async () => {
    moduleCalls++;
    if (shouldFail) throw new Error('Offline or CDN failure');
    return {
      GraphComponent: class extends dom.window.HTMLElement {
        constructor() { super(); this.config = { depth: 1 }; }
      }
    };
  };

  dom.window.eval(script);

  // Allow initial auto-click to execute and fail
  await tick(50);

  assert.equal(moduleCalls, 1, 'Initial auto-click must attempt 1 load');
  assert.equal(button.hidden, false, 'Button must remain visible after load failure');
  assert.equal(button.disabled, false, 'Button must be re-enabled after failure');
  assert.equal(button.textContent, 'تلاش مجدد', 'Button label must change to تلاش مجدد');
  assert.match(status.textContent, /دوباره تلاش کنید/, 'Status must show retry guidance');
  assert.match(status.textContent, /فهرست متنی پیوندها همچنان در دسترس است/);

  // Successful retry
  shouldFail = false;
  button.click();
  await tick(50);

  assert.equal(moduleCalls, 2, 'Retry click must trigger second attempt');
  assert.equal(button.hidden, true, 'Button must be hidden after successful load');
  assert.equal(status.textContent, '', 'Status must be cleared on success');
  assert.ok(host.querySelector('graph-component'), 'graph-component must be appended on success');

  // Detached host guard: a host removed during load must not activate
  const { dom: detachedDom, script: detachedScript } = createDOMFixture();
  let detachedResolve;
  let activated = 0;

  detachedDom.window.loadModule = () => new Promise(res => { detachedResolve = res; });
  detachedDom.window.eval(detachedScript);

  await tick(20);
  const detachedHost = detachedDom.window.document.querySelector('[data-note-graph]');
  detachedHost.remove(); // disconnect host from document

  detachedResolve({
    GraphComponent: class extends detachedDom.window.HTMLElement {
      connectedCallback() { activated++; }
    }
  });

  await tick(50);
  assert.equal(activated, 0, 'Detached host must not mount or activate renderer');

  dom.window.close();
  detachedDom.window.close();
});

// =============================================================================
// Specification 3: D3 Force Graph Engine & Visual Craft Guarantees
// =============================================================================

test('graph architecture: mounts graph slot above legend and binds interactive UMKO legend filters', () => {
  const source = astroSource();
  const slotPos = source.indexOf('data-graph-slot');
  const legendPos = source.indexOf('class="graph-umko-legend"');
  assert.ok(slotPos > 0 && legendPos > 0, 'Both graph mount slot and legend must exist');
  assert.ok(slotPos < legendPos, 'Graph canvas slot must appear before UMKO legend in DOM order');

  for (const kind of ['assertion', 'concept', 'problem', 'solution', 'collection', 'visual_lab', 'pitfall']) {
    assert.match(source, new RegExp(`data-legend-kind="${kind}"`), `Legend must support interactive filter for ${kind}`);
  }
});

test('graph engine module: uses D3 force simulation with collision, zoom, drag, bidirectional edge deduplication, and zero-overlap labels', () => {
  const engineSource = readFileSync(new URL('../../frontend/src/scripts/graph-component.ts', import.meta.url), 'utf8');
  assert.match(engineSource, /forceSimulation/, 'Must use D3 forceSimulation');
  assert.match(engineSource, /forceCollide/, 'Must use D3 forceCollide to prevent node overlap');
  assert.match(engineSource, /forceManyBody/, 'Must use D3 Barnes-Hut forceManyBody');
  assert.match(engineSource, /zoom</, 'Must use D3 smooth zoom/pan');
  assert.match(engineSource, /drag</, 'Must use D3 elastic node dragging');
  assert.match(engineSource, /bidirectional/, 'Must deduplicate bidirectional links cleanly');
  assert.match(engineSource, /rectsOverlap/, 'Must run screen-space AABB collision check on labels');
  assert.match(engineSource, /inferSemanticKind/, 'Must infer semantic kinds for Persian-tagged notes like Axler');
});
