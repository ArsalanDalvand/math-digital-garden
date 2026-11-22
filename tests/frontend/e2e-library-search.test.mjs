import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { paginateCatalogue, cataloguePageHref } from '../../frontend/src/lib/catalogue-pagination.mjs';
import { buildNoteLinkResolver } from '../../frontend/src/lib/library-links.mjs';
import {
  UMKO_KINDS,
  UMKO_SUBTYPES,
  UMKO_LEVELS,
  UMKO_TRACKS,
  UMKO_STATUSES,
} from '../../frontend/src/lib/umko.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');
const pythonBin = resolve(projectRoot, '.venv/bin/python3');

const searchAstroPath = resolve(projectRoot, 'frontend/src/pages/search.astro');
const libraryDetailAstroPath = resolve(projectRoot, 'frontend/src/pages/library/[id].astro');
const canvasViewerAstroPath = resolve(projectRoot, 'frontend/src/components/CanvasViewer.astro');
const notePropertiesAstroPath = resolve(projectRoot, 'frontend/src/components/NoteProperties.astro');
const libraryImportPyPath = resolve(projectRoot, 'backend/app/library_import.py');
const managePyPath = resolve(projectRoot, 'backend/app/manage.py');

// ============================================================================
// 1. Search Catalog & Filters
// ============================================================================

describe('1. Search Catalog & Filters', () => {
  const mockNotes = [
    {
      slug: 'limit-theorem',
      title: 'قضیه فشردگی حد (ساندویچ)',
      kind: 'assertion',
      subtype: 'theorem',
      level: 'L2_calc_basic',
      tracks: ['pure_university', 'konkur_arshad'],
      tags: ['حد', 'آنالیز ریاضی', 'نابرابری'],
      slogan_fa: 'محاصره تابع میان دو کران همگرا',
    },
    {
      slug: 'derivative-def',
      title: 'تعریف مشتق و نرخ تغییر',
      kind: 'concept',
      subtype: 'structure',
      level: 'L1_intro',
      tracks: ['applied_eng'],
      tags: ['مشتق', 'حسابان'],
      slogan_fa: 'شیب خط مماس و نرخ تغییرات لحظه‌ای',
    },
    {
      slug: 'olympiad-cauchy-schwarz',
      title: 'مسئله المپیاد کوشی-شوارتز',
      kind: 'problem',
      subtype: 'olympiad_proof',
      level: 'L3_undergrad_core',
      tracks: ['olympiad'],
      tags: ['نابرابری', 'المپیاد'],
      slogan_fa: 'کاربرد نامساوی برداری در اثبات‌های مسابقات',
    },
    {
      slug: 'vector-space-axiom',
      title: 'فضای برداری و زیرفضا',
      kind: 'concept',
      subtype: 'structure',
      level: 'L2_calc_basic',
      tracks: ['pure_university', 'applied_eng'],
      tags: ['جبر خطی', 'بردار'],
      slogan_fa: 'ساختار جبری بسته نسبت به جمع و ضرب اسکالر',
    },
    {
      slug: 'unclassified-note',
      title: 'یادداشت متفرقه بدون متادیتا',
      kind: '',
      subtype: '',
      level: '',
      tracks: null,
      tags: [],
      slogan_fa: '',
    },
  ];

  it('filters catalogue notes by tag accurately', () => {
    const filterByTag = (notes, tag) => (tag ? notes.filter((n) => n.tags?.includes(tag)) : notes);

    const limitNotes = filterByTag(mockNotes, 'حد');
    assert.equal(limitNotes.length, 1);
    assert.equal(limitNotes[0].slug, 'limit-theorem');

    const ineqNotes = filterByTag(mockNotes, 'نابرابری');
    assert.equal(ineqNotes.length, 2);
    assert.deepEqual(ineqNotes.map((n) => n.slug), ['limit-theorem', 'olympiad-cauchy-schwarz']);

    const empty = filterByTag(mockNotes, 'برچسب ناموجود');
    assert.equal(empty.length, 0);
  });

  it('filters catalogue notes by study track accurately', () => {
    const filterByTrack = (notes, track) =>
      track ? notes.filter((n) => Array.isArray(n.tracks) && n.tracks.includes(track)) : notes;

    const pureUni = filterByTrack(mockNotes, 'pure_university');
    assert.equal(pureUni.length, 2);
    assert.deepEqual(pureUni.map((n) => n.slug), ['limit-theorem', 'vector-space-axiom']);

    const applied = filterByTrack(mockNotes, 'applied_eng');
    assert.equal(applied.length, 2);
    assert.deepEqual(applied.map((n) => n.slug), ['derivative-def', 'vector-space-axiom']);

    const olympiad = filterByTrack(mockNotes, 'olympiad');
    assert.equal(olympiad.length, 1);
    assert.equal(olympiad[0].slug, 'olympiad-cauchy-schwarz');

    // Notes with null/undefined tracks must not throw or crash
    const nonExistent = filterByTrack(mockNotes, 'cs_theory');
    assert.equal(nonExistent.length, 0);
  });

  it('filters catalogue notes by UMKO kind accurately', () => {
    const filterByKind = (notes, kind) => (kind ? notes.filter((n) => n.kind === kind) : notes);

    const assertions = filterByKind(mockNotes, 'assertion');
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].slug, 'limit-theorem');

    const concepts = filterByKind(mockNotes, 'concept');
    assert.equal(concepts.length, 2);
    assert.deepEqual(concepts.map((n) => n.slug), ['derivative-def', 'vector-space-axiom']);

    const problems = filterByKind(mockNotes, 'problem');
    assert.equal(problems.length, 1);
    assert.equal(problems[0].slug, 'olympiad-cauchy-schwarz');
  });

  it('handles multi-criteria compound filtering (q, tag, track, kind)', () => {
    const applySearchFilters = (notes, { q = '', tag = '', track = '', kind = '' }) => {
      let results = notes;
      if (q) {
        const queryLower = q.toLowerCase();
        results = results.filter(
          (n) =>
            n.title.toLowerCase().includes(queryLower) ||
            n.slogan_fa?.toLowerCase().includes(queryLower)
        );
      }
      if (tag) results = results.filter((n) => n.tags?.includes(tag));
      if (track) results = results.filter((n) => Array.isArray(n.tracks) && n.tracks.includes(track));
      if (kind) results = results.filter((n) => n.kind === kind);
      return results;
    };

    // Filter by track 'pure_university' AND kind 'concept'
    const pureConcepts = applySearchFilters(mockNotes, {
      track: 'pure_university',
      kind: 'concept',
    });
    assert.equal(pureConcepts.length, 1);
    assert.equal(pureConcepts[0].slug, 'vector-space-axiom');

    // Filter by tag 'نابرابری' AND track 'olympiad'
    const olympiadIneq = applySearchFilters(mockNotes, {
      tag: 'نابرابری',
      track: 'olympiad',
    });
    assert.equal(olympiadIneq.length, 1);
    assert.equal(olympiadIneq[0].slug, 'olympiad-cauchy-schwarz');

    // Conflicting filters return empty array
    const conflicting = applySearchFilters(mockNotes, {
      track: 'olympiad',
      kind: 'concept',
    });
    assert.equal(conflicting.length, 0);

    // Text search combined with track
    const textAndTrack = applySearchFilters(mockNotes, {
      q: 'مماس',
      track: 'applied_eng',
    });
    assert.equal(textAndTrack.length, 1);
    assert.equal(textAndTrack[0].slug, 'derivative-def');
  });

  it('paginates catalogue results and protects against invalid or out-of-bound pages', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: `note-${i + 1}` }));

    // Page 1
    const p1 = paginateCatalogue(items, '1');
    assert.equal(p1.page, 1);
    assert.equal(p1.pages, 3);
    assert.equal(p1.total, 60);
    assert.equal(p1.items.length, 24);
    assert.equal(p1.items[0].id, 'note-1');
    assert.equal(p1.items[23].id, 'note-24');

    // Page 2
    const p2 = paginateCatalogue(items, '2');
    assert.equal(p2.page, 2);
    assert.equal(p2.items.length, 24);
    assert.equal(p2.items[0].id, 'note-25');

    // Page 3 (partial page: 60 - 48 = 12 items)
    const p3 = paginateCatalogue(items, '3');
    assert.equal(p3.page, 3);
    assert.equal(p3.items.length, 12);
    assert.equal(p3.items[11].id, 'note-60');

    // Out of bounds: clamped to maximum page
    assert.equal(paginateCatalogue(items, '999').page, 3);

    // Invalid values: clamped to page 1
    for (const invalid of ['0', '-3', 'abc', '1.5', '', null, undefined]) {
      assert.equal(paginateCatalogue(items, invalid).page, 1);
    }

    // Empty list
    const emptyResult = paginateCatalogue([], '5');
    assert.equal(emptyResult.page, 1);
    assert.equal(emptyResult.pages, 1);
    assert.equal(emptyResult.total, 0);
    assert.equal(emptyResult.items.length, 0);
  });

  it('preserves Persian characters and query params in cataloguePageHref', () => {
    const href = cataloguePageHref('حد & پیوستگی', 'قضیه فشرده', 2);
    assert.match(href, /^\/search\?/);

    const parsed = new URL(href, 'http://localhost');
    assert.equal(parsed.pathname, '/search');
    assert.equal(parsed.searchParams.get('q'), 'حد & پیوستگی');
    assert.equal(parsed.searchParams.get('tag'), 'قضیه فشرده');
    assert.equal(parsed.searchParams.get('page'), '2');

    // Empty parameters preserve proper URL format
    const emptyHref = cataloguePageHref('', '', 1);
    const parsedEmpty = new URL(emptyHref, 'http://localhost');
    assert.equal(parsedEmpty.searchParams.get('q'), '');
    assert.equal(parsedEmpty.searchParams.get('tag'), '');
    assert.equal(parsedEmpty.searchParams.get('page'), '1');
  });

  it('verifies search.astro contains filter forms, Persian badge badges and accessibility hooks', () => {
    const pageSrc = readFileSync(searchAstroPath, 'utf8');

    // Accessibility & UI attributes
    assert.match(pageSrc, /data-od-id="catalogue-search"/);
    assert.match(pageSrc, /data-od-id="search-results"/);
    assert.match(pageSrc, /data-od-id="search-submit"/);
    assert.match(pageSrc, /data-od-id="search-reset"/);
    assert.match(pageSrc, /data-od-id="search-retry"/);
    assert.match(pageSrc, /data-od-id="catalogue-pagination"/);
    assert.match(pageSrc, /aria-describedby="search-help"/);

    // Filter selectors
    assert.match(pageSrc, /<select id="tag" name="tag"/);
    assert.match(pageSrc, /<select id="track" name="track"/);
    assert.match(pageSrc, /<select id="kind" name="kind"/);

    // Max query length protection (200 characters)
    assert.match(pageSrc, /q\.length > 200/);
    assert.match(pageSrc, /tag\.length > 200/);
    assert.match(pageSrc, /عبارت جست‌وجو بیش از حد طولانی است/);

    // UMKO Badge rendering logic
    assert.match(pageSrc, /note\.slogan_fa && <p class="note-slogan-search">«\{note\.slogan_fa\}»<\/p>/);
    assert.match(pageSrc, /UMKO_KINDS\[note\.kind\]/);
    assert.match(pageSrc, /UMKO_LEVELS\[note\.level\]/);
    assert.match(pageSrc, /UMKO_TRACKS\[t\]/);
    assert.match(pageSrc, /class="badge-mini"/);
  });
});

// ============================================================================
// 2. Library & Canvas (.canvas) Note Handling
// ============================================================================

describe('2. Library & Canvas (.canvas) Note Handling', () => {
  it('detects .canvas files via file extension, title or JSON "nodes" structure', () => {
    const isCanvasNote = (item) =>
      Boolean(
        item?.kind === 'note' &&
        item?.content &&
        (item.path?.endsWith('.canvas') ||
          item.title?.endsWith('.canvas') ||
          (item.content.trim().startsWith('{') && item.content.includes('"nodes"')))
      );

    // Case 1: path ends with .canvas
    assert.equal(
      isCanvasNote({
        kind: 'note',
        path: 'algebra/mindmap.canvas',
        title: 'mindmap',
        content: '{"nodes": []}',
      }),
      true
    );

    // Case 2: title ends with .canvas
    assert.equal(
      isCanvasNote({
        kind: 'note',
        path: 'algebra/graph',
        title: 'graph.canvas',
        content: '{"nodes": []}',
      }),
      true
    );

    // Case 3: content starts with '{' and contains '"nodes"'
    assert.equal(
      isCanvasNote({
        kind: 'note',
        path: 'algebra/notes-tree',
        title: 'نمودار درختی مفاهیم',
        content: '{"nodes":[{"id":"node1","type":"text"}],"edges":[]}',
      }),
      true
    );

    // Negative case 1: Standard markdown file
    assert.equal(
      isCanvasNote({
        kind: 'note',
        path: 'notes/intro.md',
        title: 'مقدمه',
        content: '# مقدمه بر جبر خطی\nمتن نمونه',
      }),
      false
    );

    // Negative case 2: Folder item
    assert.equal(
      isCanvasNote({
        kind: 'folder',
        path: 'diagrams.canvas',
        title: 'پوشه دیاگرام',
        content: '',
      }),
      false
    );

    // Negative case 3: Empty content
    assert.equal(
      isCanvasNote({
        kind: 'note',
        path: 'empty.canvas',
        title: 'خالی',
        content: '',
      }),
      false
    );
  });

  it('renders canvas figure element with properly encoded data and fallback title', () => {
    const renderCanvasFigure = (item) => {
      const isCanvas =
        item?.kind === 'note' &&
        item?.content &&
        (item.path?.endsWith('.canvas') ||
          item.title?.endsWith('.canvas') ||
          (item.content.trim().startsWith('{') && item.content.includes('"nodes"')));

      if (!isCanvas) return null;
      return `<figure class="canvas-diagram" data-canvas-title="${item.title || 'بوم ابسیدین'}" data-canvas-data="${encodeURIComponent(item.content)}"></figure>`;
    };

    const canvasJson = JSON.stringify({
      nodes: [
        { id: '1', type: 'text', text: 'گره اول: تعاریف اولیه', x: 0, y: 0, width: 200, height: 100 },
        { id: '2', type: 'file', file: 'notes/theorem.md', x: 300, y: 150, width: 220, height: 120 },
      ],
      edges: [{ id: 'e1', fromNode: '1', toNode: '2', label: 'نتیجه می‌دهد' }],
    });

    const rendered = renderCanvasFigure({
      kind: 'note',
      title: 'بوم آنالیز ریاضی',
      content: canvasJson,
    });

    assert.match(rendered, /^<figure class="canvas-diagram"/);
    assert.match(rendered, /data-canvas-title="بوم آنالیز ریاضی"/);

    // Verify URI encoded content correctly deserializes
    const matchData = rendered.match(/data-canvas-data="([^"]+)"/);
    assert.ok(matchData, 'data-canvas-data attribute must be present');
    const parsedData = JSON.parse(decodeURIComponent(matchData[1]));
    assert.equal(parsedData.nodes.length, 2);
    assert.equal(parsedData.edges.length, 1);
    assert.equal(parsedData.nodes[0].text, 'گره اول: تعاریف اولیه');

    // Fallback title check
    const untitledRendered = renderCanvasFigure({
      kind: 'note',
      path: 'untitled.canvas',
      title: '',
      content: '{"nodes": []}',
    });
    assert.match(untitledRendered, /data-canvas-title="بوم ابسیدین"/);
  });

  it('verifies CanvasViewer.astro contains toolbar controls, zoom/fit acts and obsidian color map', () => {
    const viewerSrc = readFileSync(canvasViewerAstroPath, 'utf8');

    // Controls and toolbar accessibility
    assert.match(viewerSrc, /class="canvas-toolbar"/);
    assert.match(viewerSrc, /role="toolbar"/);
    assert.match(viewerSrc, /aria-label="ابزارهای بوم"/);

    // Zoom and pan actions
    assert.match(viewerSrc, /data-act="zoom-in"/);
    assert.match(viewerSrc, /data-act="zoom-out"/);
    assert.match(viewerSrc, /data-act="reset"/);
    assert.match(viewerSrc, /data-act="fit"/);

    // Viewport region
    assert.match(viewerSrc, /class="canvas-viewport"/);
    assert.match(viewerSrc, /role="region"/);
    assert.match(viewerSrc, /aria-label="فضای بوم"/);

    // Stage and SVG edge layers
    assert.match(viewerSrc, /class="canvas-stage"/);
    assert.match(viewerSrc, /class="canvas-edges-layer"/);
    assert.match(viewerSrc, /class="canvas-nodes-layer"/);
    assert.match(viewerSrc, /id="arrow"/);

    // Node types support
    assert.match(viewerSrc, /canvas-node-\$\{n\.type\}/);
    assert.match(viewerSrc, /n\.type === 'text'/);
    assert.match(viewerSrc, /canvas-node-content/);
    assert.match(viewerSrc, /canvas-node-file-header/);
    assert.match(viewerSrc, /canvas-node-link-content/);
    assert.match(viewerSrc, /canvas-group-label/);

    // Obsidian color palette mapping
    assert.match(viewerSrc, /'1': '#e93535'/);
    assert.match(viewerSrc, /'2': '#ec7500'/);
    assert.match(viewerSrc, /'3': '#e0ac00'/);
    assert.match(viewerSrc, /'4': '#08b94e'/);
    assert.match(viewerSrc, /'5': '#00bfbc'/);
    assert.match(viewerSrc, /'6': '#7852ee'/);
  });

  it('verifies NoteProperties integration in library note detail page', () => {
    const pageSrc = readFileSync(libraryDetailAstroPath, 'utf8');
    const compSrc = readFileSync(notePropertiesAstroPath, 'utf8');

    // Note detail imports and uses NoteProperties
    assert.match(pageSrc, /import NoteProperties from '\.\.\/\.\.\/components\/NoteProperties\.astro'/);
    assert.match(pageSrc, /<NoteProperties note=\{noteProps\} \/>/);
    assert.match(pageSrc, /isCanvas/);
    assert.match(pageSrc, /figure class="canvas-diagram"/);

    // NoteProperties renders UMKO metadata badges
    assert.match(compSrc, /meta-badge-kind/);
    assert.match(compSrc, /meta-badge-level/);
    assert.match(compSrc, /meta-badge-track/);
    assert.match(compSrc, /meta-badge-status/);
    assert.match(compSrc, /note-slogan/);
    assert.match(compSrc, /note-deprecated-alert/);
    assert.match(compSrc, /role="alert"/);
  });
});

// ============================================================================
// 3. Link Resolution in Library & Shared Notes
// ============================================================================

describe('3. Link Resolution in Library & Shared Notes', () => {
  const libraryNotes = [
    { id: '101', title: 'limit-definition', path: '01-calculus/01-limits/limit-definition' },
    { id: '102', title: 'squeeze-theorem', path: '01-calculus/01-limits/squeeze-theorem' },
    { id: '103', title: 'chain-rule', path: '01-calculus/02-derivatives/chain-rule' },
    { id: '104', title: 'README', path: 'README' },
    { id: '105', title: 'تعریف ۱.۱ گروه آبلی G', path: '02-algebra/تعریف ۱.۱ گروه آبلی G' },
  ];

  it('resolves relative sibling, child and parent links correctly', () => {
    // Current note is in 01-calculus/01-limits/limit-definition
    const resolver = buildNoteLinkResolver(
      libraryNotes,
      '/library/',
      '01-calculus/01-limits/limit-definition'
    );

    // Sibling note in same folder with .md
    assert.equal(resolver('squeeze-theorem.md'), '/library/102');
    // Sibling note with leading ./
    assert.equal(resolver('./squeeze-theorem.md'), '/library/102');
    // Sibling note without extension
    assert.equal(resolver('squeeze-theorem'), '/library/102');

    // Parent directory traversal (up to 01-calculus then into 02-derivatives)
    assert.equal(resolver('../02-derivatives/chain-rule.md'), '/library/103');
    assert.equal(resolver('../02-derivatives/chain-rule'), '/library/103');

    // Full relative path from vault root
    assert.equal(resolver('01-calculus/02-derivatives/chain-rule.md'), '/library/103');
    assert.equal(resolver('README.md'), '/library/104');
    assert.equal(resolver('./README.md'), '/library/104');
  });

  it('resolves Persian note titles, encoded URIs and collapsed names', () => {
    const resolver = buildNoteLinkResolver(libraryNotes, '/library/', 'README');

    // Exact Persian title
    assert.equal(resolver('تعریف ۱.۱ گروه آبلی G'), '/library/105');
    assert.equal(resolver('تعریف ۱.۱ گروه آبلی G.md'), '/library/105');

    // URI-encoded Persian title
    assert.equal(resolver(encodeURIComponent('تعریف ۱.۱ گروه آبلی G.md')), '/library/105');
    assert.equal(resolver(encodeURIComponent('02-algebra/تعریف ۱.۱ گروه آبلی G.md')), '/library/105');

    // Collapsed spaces matching
    assert.equal(resolver('تعریف۱.۱گروهآبلیG'), '/library/105');
  });

  it('preserves section anchors while resolving note links', () => {
    const resolver = buildNoteLinkResolver(
      libraryNotes,
      '/library/',
      '01-calculus/01-limits/limit-definition'
    );

    const resolvedWithAnchor = resolver('squeeze-theorem.md#اثبات-هندسی');
    assert.equal(
      resolvedWithAnchor,
      `/library/102#${encodeURIComponent('اثبات-هندسی')}`
    );
  });

  it('leaves external links, email addresses and in-page anchors unresolved', () => {
    const resolver = buildNoteLinkResolver(libraryNotes, '/library/', 'README');

    // External protocols must return null
    assert.equal(resolver('https://en.wikipedia.org/wiki/Calculus'), null);
    assert.equal(resolver('http://example.com/notes'), null);
    assert.equal(resolver('mailto:user@mathgarden.org'), null);
    assert.equal(resolver('ftp://ftp.example.com/file'), null);

    // In-page hash anchor returns null
    assert.equal(resolver('#section-summary'), null);

    // Missing/unknown notes return null
    assert.equal(resolver('non-existent-note.md'), null);
  });

  it('safely transforms HTML anchors in note content without touching external URLs', () => {
    const resolver = buildNoteLinkResolver(
      libraryNotes,
      '/library/',
      '01-calculus/01-limits/limit-definition'
    );

    const rawHtml = `
      <p>مطالعهٔ <a href="./squeeze-theorem.md">قضیه ساندویچ</a> را ببینید.</p>
      <p>برای قاعده زنجیره‌ای به <a class="custom-class" href="../02-derivatives/chain-rule.md" target="_self">قاعده زنجیره‌ای</a> مراجعه کنید.</p>
      <p>مرجع خارجی: <a href="https://mathworld.wolfram.com" target="_blank" rel="noopener">Wolfram MathWorld</a></p>
      <p>ایمیل: <a href="mailto:info@mathgarden.org">ارتباط با ما</a></p>
      <p>بخش داخلی: <a href="#summary">خلاصه فصل</a></p>
      <p>پیوند از قبل مشخص: <a href="/library/already-resolved">کتابخانه</a> و <a href="/shared/TOKEN?note=101">اشتراک‌گذاری</a></p>
    `;

    // Execute the exact HTML regex replacement used in /library/[id].astro
    const transformedHtml = rawHtml.replace(
      /<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gi,
      (match, prefix, href, suffix) => {
        if (
          !href.startsWith('http://') &&
          !href.startsWith('https://') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('#') &&
          !href.startsWith('/shared/') &&
          !href.startsWith('/library/')
        ) {
          const resolved = resolver(href);
          if (resolved) {
            return `<a ${prefix}href="${resolved}"${suffix}>`;
          }
        }
        return match;
      }
    );

    // Relative links replaced
    assert.match(transformedHtml, /<a href="\/library\/102">قضیه ساندویچ<\/a>/);
    assert.match(
      transformedHtml,
      /<a class="custom-class" href="\/library\/103" target="_self">قاعده زنجیره‌ای<\/a>/
    );

    // External and special URLs preserved intact
    assert.match(transformedHtml, /href="https:\/\/mathworld\.wolfram\.com"/);
    assert.match(transformedHtml, /href="mailto:info@mathgarden\.org"/);
    assert.match(transformedHtml, /href="#summary"/);
    assert.match(transformedHtml, /href="\/library\/already-resolved"/);
    assert.match(transformedHtml, /href="\/shared\/TOKEN\?note=101"/);
  });
});

// ============================================================================
// 4. Backend Vault & Library Import Extension Permissions
// ============================================================================

describe('4. Backend Vault & Library Import Extension Permissions', () => {
  it('verifies ALLOWED_EXTENSIONS includes required document types and excludes executables', () => {
    assert.ok(existsSync(pythonBin), `Python virtualenv binary must exist at ${pythonBin}`);

    const pyCode = `
import json
from backend.app.library_import import ALLOWED_EXTENSIONS

result = {
    "allowed": sorted(list(ALLOWED_EXTENSIONS)),
    "has_canvas": ".canvas" in ALLOWED_EXTENSIONS,
    "has_pdf": ".pdf" in ALLOWED_EXTENSIONS,
    "has_ggb": ".ggb" in ALLOWED_EXTENSIONS,
    "has_md": ".md" in ALLOWED_EXTENSIONS,
    "has_txt": ".txt" in ALLOWED_EXTENSIONS,
    "disallowed_py": ".py" not in ALLOWED_EXTENSIONS,
    "disallowed_sh": ".sh" not in ALLOWED_EXTENSIONS,
    "disallowed_exe": ".exe" not in ALLOWED_EXTENSIONS,
    "disallowed_js": ".js" not in ALLOWED_EXTENSIONS,
}
print(json.dumps(result))
`;
    const stdout = execFileSync(pythonBin, ['-c', pyCode], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const res = JSON.parse(stdout);

    assert.equal(res.has_canvas, true, '.canvas must be allowed');
    assert.equal(res.has_pdf, true, '.pdf must be allowed');
    assert.equal(res.has_ggb, true, '.ggb must be allowed');
    assert.equal(res.has_md, true, '.md must be allowed');
    assert.equal(res.has_txt, true, '.txt must be allowed');

    assert.equal(res.disallowed_py, true, '.py must be disallowed');
    assert.equal(res.disallowed_sh, true, '.sh must be disallowed');
    assert.equal(res.disallowed_exe, true, '.exe must be disallowed');
    assert.equal(res.disallowed_js, true, '.js must be disallowed');
  });

  it('safely extracts zip archives with allowed extensions and blocks path traversal (Zip Slip)', () => {
    const pyCode = `
import io, os, zipfile, tempfile, json
from fastapi import HTTPException
from backend.app.library_import import extract_zip_archive, MAX_ZIP_SIZE, MAX_UNCOMPRESSED_SIZE, MAX_FILE_COUNT

results = {}

# Test 1: Safe extraction of allowed files (.canvas, .pdf, .ggb, .md, .txt)
with tempfile.TemporaryDirectory() as tmp_dir:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr("notes/linear-algebra.md", "# جبر خطی")
        zf.writestr("boards/concepts.canvas", '{"nodes": []}')
        zf.writestr("books/sample.pdf", b"%PDF-1.4 sample")
        zf.writestr("labs/triangle.ggb", b"geogebra archive content")
        zf.writestr("docs/readme.txt", "یادداشت متنی")
        zf.writestr("scripts/malicious.py", "import os; os.system('ls')")
        zf.writestr("scripts/danger.sh", "#!/bin/bash")

    count = extract_zip_archive(buf.getvalue(), tmp_dir)
    results["extracted_count"] = count
    results["canvas_exists"] = os.path.exists(os.path.join(tmp_dir, "boards", "concepts.canvas"))
    results["pdf_exists"] = os.path.exists(os.path.join(tmp_dir, "books", "sample.pdf"))
    results["ggb_exists"] = os.path.exists(os.path.join(tmp_dir, "labs", "triangle.ggb"))
    results["md_exists"] = os.path.exists(os.path.join(tmp_dir, "notes", "linear-algebra.md"))
    results["txt_exists"] = os.path.exists(os.path.join(tmp_dir, "docs", "readme.txt"))
    # Dangerous scripts must be excluded
    results["py_exists"] = os.path.exists(os.path.join(tmp_dir, "scripts", "malicious.py"))
    results["sh_exists"] = os.path.exists(os.path.join(tmp_dir, "scripts", "danger.sh"))

# Test 2: Zip Slip path traversal detection
with tempfile.TemporaryDirectory() as tmp_dir:
    buf_evil = io.BytesIO()
    with zipfile.ZipFile(buf_evil, 'w') as zf:
        zf.writestr("../../etc_passwd.txt", "root:x:0:0:")
    try:
        extract_zip_archive(buf_evil.getvalue(), tmp_dir)
        results["zip_slip_blocked"] = False
    except HTTPException as exc:
        results["zip_slip_blocked"] = (exc.status_code == 400 and "نامعتبر" in exc.detail)

# Test 3: Limits configuration
results["max_zip_size"] = MAX_ZIP_SIZE
results["max_uncompressed_size"] = MAX_UNCOMPRESSED_SIZE
results["max_file_count"] = MAX_FILE_COUNT

print(json.dumps(results))
`;
    const stdout = execFileSync(pythonBin, ['-c', pyCode], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const res = JSON.parse(stdout);

    assert.equal(res.extracted_count, 5, 'Must extract exactly the 5 allowed files');
    assert.equal(res.canvas_exists, true, '.canvas must be extracted');
    assert.equal(res.pdf_exists, true, '.pdf must be extracted');
    assert.equal(res.ggb_exists, true, '.ggb must be extracted');
    assert.equal(res.md_exists, true, '.md must be extracted');
    assert.equal(res.txt_exists, true, '.txt must be extracted');
    assert.equal(res.py_exists, false, '.py must not be extracted');
    assert.equal(res.sh_exists, false, '.sh must not be extracted');

    assert.equal(res.zip_slip_blocked, true, 'Zip slip attack must be rejected with HTTP 400');
    assert.equal(res.max_zip_size, 50 * 1024 * 1024, 'Max zip size is 50MB');
    assert.equal(res.max_uncompressed_size, 120 * 1024 * 1024, 'Max uncompressed size is 120MB');
    assert.equal(res.max_file_count, 1500, 'Max file count is 1500');
  });

  it('verifies backend/app/manage.py scan_vault and copy_assets extension support and symlink defenses', () => {
    const pyCode = `
import json, tempfile, os
from pathlib import Path
from backend.app.manage import scan_vault

results = {}

# Test scan_vault with .md, .canvas, .excalidraw
with tempfile.TemporaryDirectory() as tmp:
    vault_path = Path(tmp) / "test_vault"
    vault_path.mkdir()
    (vault_path / "note1.md").write_text("# Note 1", encoding="utf-8")
    (vault_path / "concept.canvas").write_text('{"nodes": []}', encoding="utf-8")
    (vault_path / "diagram.excalidraw").write_text('{}', encoding="utf-8")
    (vault_path / "ignored.py").write_text('print(1)', encoding="utf-8")

    scanned = scan_vault(vault_path, "vault", "math-book")
    titles = sorted([n["title"] for n in scanned])
    results["scanned_titles"] = titles
    results["canvas_slug_found"] = any("concept" in n["title"] for n in scanned)

# Test symlink vault directory rejection
with tempfile.TemporaryDirectory() as tmp:
    real_vault = Path(tmp) / "real_vault"
    real_vault.mkdir()
    sym_vault = Path(tmp) / "sym_vault"
    sym_vault.symlink_to(real_vault)
    try:
        scan_vault(sym_vault, "vault", "math-book")
        results["symlink_rejected"] = False
    except ValueError as e:
        results["symlink_rejected"] = "symlink" in str(e).lower()

print(json.dumps(results))
`;
    const stdout = execFileSync(pythonBin, ['-c', pyCode], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const res = JSON.parse(stdout);

    assert.deepEqual(res.scanned_titles, ['concept', 'diagram.excalidraw', 'note1']);
    assert.equal(res.canvas_slug_found, true, '.canvas files must be scanned as notes');
    assert.equal(res.symlink_rejected, true, 'Symlinked vault directories must be rejected');

    // Also verify manage.py source code rules
    const manageSrc = readFileSync(managePyPath, 'utf8');
    assert.match(manageSrc, /\{"\.md",\s*"\.excalidraw",\s*"\.canvas"\}/);
    assert.match(manageSrc, /"\.ggb",\s*"\.pdf",\s*"\.canvas"/);
    assert.match(manageSrc, /len\(data\) > 2_000_000/);
    assert.match(manageSrc, /len\(data\) > 5_000_000/);
  });
});
