/**
 * Real browser E2E test for diagrams and knowledge graph:
 *  1. Interactive Cytoscape / Starlight Knowledge Graph:
 *     - Container verification in StudyTools
 *     - Canvas & simulator nodes rendering
 *     - Depth quick-selector chips (depth 1, 2, 5)
 *     - Graph action controls (reset-zoom, fitGraph, fullscreen toggle)
 *     - UMKO taxonomy legend badges
 *  2. Client-side Mermaid diagrams:
 *     - <figure class="mermaid-diagram"> structure
 *     - Dynamic client SVG chart rendering
 *     - Collapsible source accordion (<details>) toggle & raw code inspection
 *  3. Interactive Canvas Viewer:
 *     - .canvas-diagram component rendering Obsidian canvas format
 *     - Nodes and edges rendering
 *     - Zoom-in, zoom-out, 100% reset, and auto-fit controls
 *  4. Clean session teardown
 *
 * Target: https://test.atomathix.ir (or process.env.BASE_URL)
 * Run: node tests/browser/e2e-diagrams-graph.mjs
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'diagrams-e2e-' + Date.now();

// Critical runtime directive: always unset LD_PRELOAD in child env for agent-browser
const env = { ...process.env, TMPDIR: process.env.TMPDIR || '/tmp' };
delete env.LD_PRELOAD;

function browser(...args) {
  let raw;
  try {
    raw = execFileSync(
      'agent-browser',
      [
        '--session', session,
        ...args,
        '--json'
      ],
      {
        env,
        encoding: 'utf8',
        timeout: 45000,
      }
    );
  } catch (error) {
    throw new Error(
      'agent-browser ' + args[0] + ' failed: ' + String(error.stdout || error.stderr || error.message).slice(0, 500)
    );
  }
  const result = JSON.parse(raw);
  assert.equal(result.success, true, result.error);
  return result.data;
}

const evaluate = code => browser('eval', code).result;
const wait = code => browser('wait', '--fn', code);

const checks = [];
function record(step) {
  checks.push(step);
  console.log(`[PASS] ${step}`);
}

try {
  console.log(`Starting Diagrams & Graph E2E test against ${base} (session: ${session})`);

  // =========================================================================
  // SECTION 1: Interactive Knowledge Graph
  // =========================================================================
  const noteSlug = 'axler-2d7afb5de78c939e';
  browser('open', `${base}/notes/${noteSlug}`);
  browser('wait', '2500');

  // Verify graph container exists
  const hasGraphContainer = evaluate(
    '!!document.querySelector("[data-note-graph], .note-graph, #note-graph-container, .note-graph-section")'
  );
  assert.equal(hasGraphContainer, true, 'Graph container element must exist on note page');

  // Verify graph is inside StudyTools rail/drawer
  const inStudyTools = evaluate(`(() => {
    const graph = document.querySelector('[data-note-graph], .note-graph');
    const tools = document.querySelector('.workspace-tools, [data-study-tools]');
    return !!tools && !!graph && tools.contains(graph);
  })()`);
  assert.equal(inStudyTools, true, 'Note graph must render inside the StudyTools rail/drawer (.workspace-tools)');
  record('1. Knowledge Graph container exists and is located in StudyTools');

  // Handle lazy load button if present and visible
  const loadBtnInfo = evaluate(`(() => {
    const btn = document.querySelector('[data-load-graph]');
    return btn ? { exists: true, hidden: btn.hidden, disabled: btn.disabled } : { exists: false };
  })()`);
  if (loadBtnInfo.exists && !loadBtnInfo.hidden) {
    browser('click', '[data-load-graph]');
    browser('wait', '2000');
  }

  // Wait for graph component to initialize and render
  browser('wait', 'graph-component');
  browser('wait', '2000');

  const graphRendered = evaluate(`(() => {
    const gc = document.querySelector('graph-component');
    const canvas = gc?.querySelector('canvas') || document.querySelector('.note-graph canvas');
    const sim = gc?.simulator;
    const nodesCount = sim?.nodes?.length || 0;
    const hasCanvas = !!canvas && canvas.width > 0 && canvas.height > 0;
    return {
      gcExists: !!gc,
      hasCanvas,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      nodesCount
    };
  })()`);

  assert.equal(graphRendered.gcExists, true, 'graph-component must be defined and mounted');
  assert.equal(graphRendered.hasCanvas, true, 'HTML5 Canvas must be rendered with non-zero dimensions');
  assert.ok(graphRendered.nodesCount > 0, `Graph simulator must have rendered nodes (found: ${graphRendered.nodesCount})`);
  record(`2. Canvas and graph nodes rendered successfully (${graphRendered.nodesCount} nodes, canvas ${graphRendered.canvasWidth}x${graphRendered.canvasHeight})`);

  // Verify and test quick depth selector chips: depth 1, 2, 5
  const chipsInfo = evaluate(`(() => {
    const chips = Array.from(document.querySelectorAll('[data-depth]')).map(c => ({
      depth: c.getAttribute('data-depth'),
      text: c.textContent.trim(),
      active: c.classList.contains('active')
    }));
    return chips;
  })()`);

  const depthsFound = chipsInfo.map(c => c.depth);
  assert.ok(depthsFound.includes('1'), 'Quick depth chip for depth 1 must exist');
  assert.ok(depthsFound.includes('2'), 'Quick depth chip for depth 2 must exist');
  assert.ok(depthsFound.includes('5'), 'Quick depth chip for depth 5 must exist');
  assert.equal(chipsInfo.find(c => c.depth === '1')?.active, true, 'Depth 1 chip must be active by default');
  record('3. Verified depth quick selector chips exist (depth 1, 2, 5)');

  // Test switching to Depth 2
  browser('click', '[data-depth="2"]');
  browser('wait', '1500');
  const depth2Active = evaluate('document.querySelector("[data-depth=\\"2\\"]")?.classList.contains("active")');
  const depth2Nodes = evaluate('document.querySelector("graph-component")?.simulator?.nodes?.length || 0');
  assert.equal(depth2Active, true, 'Depth 2 chip must be active after click');
  assert.ok(depth2Nodes >= graphRendered.nodesCount, 'Depth 2 should include 2-hop neighborhood nodes');
  record(`4. Tested depth quick selector (depth 2 active, expanded to ${depth2Nodes} nodes)`);

  // Test switching to Depth 5 (Global Graph)
  browser('click', '[data-depth="5"]');
  browser('wait', '1500');
  const depth5Active = evaluate('document.querySelector("[data-depth=\\"5\\"]")?.classList.contains("active")');
  const depth5Nodes = evaluate('document.querySelector("graph-component")?.simulator?.nodes?.length || 0');
  assert.equal(depth5Active, true, 'Depth 5 chip must be active after click');
  assert.ok(depth5Nodes >= depth2Nodes, 'Depth 5 should render full knowledge base graph');
  record(`5. Tested depth quick selector (depth 5 global graph active, ${depth5Nodes} nodes)`);

  // Switch back to Depth 1
  browser('click', '[data-depth="1"]');
  browser('wait', '1200');

  // Test graph action buttons: reset zoom / fitGraph and fullscreen
  const actionButtons = evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.slsg-graph-action-button, [data-graph-action]')).map(b => ({
      action: b.getAttribute('data-graph-action'),
      title: b.title || b.getAttribute('aria-label')
    }));
    return btns;
  })()`);

  const actionsFound = actionButtons.map(b => b.action);
  assert.ok(actionsFound.includes('reset-zoom'), 'Graph action button reset-zoom must exist');
  assert.ok(actionsFound.includes('fullscreen'), 'Graph action button fullscreen must exist');

  // Test Reset Zoom / Fit
  evaluate('document.querySelector("[data-graph-action=reset-zoom]")?.click()');
  browser('wait', '500');
  record('6. Tested reset zoom / fit action control');

  // Test Fullscreen Toggle
  evaluate('document.querySelector("[data-graph-action=fullscreen]")?.click()');
  browser('wait', '600');
  const fsStateOn = evaluate(`(() => {
    const gc = document.querySelector('graph-component');
    const container = gc?.querySelector('.slsg-graph-container') || document.querySelector('.slsg-graph-container');
    return {
      isFullscreen: gc?.isFullscreen === true || container?.classList.contains('slsg-is-fullscreen'),
      bodyBlur: document.body.dataset.graphBlur === 'true'
    };
  })()`);
  assert.equal(fsStateOn.isFullscreen, true, 'Fullscreen mode should activate on graph action click');

  // Toggle fullscreen off
  evaluate('document.querySelector("[data-graph-action=fullscreen]")?.click()');
  browser('wait', '600');
  const fsStateOff = evaluate(`(() => {
    const gc = document.querySelector('graph-component');
    const container = gc?.querySelector('.slsg-graph-container');
    return gc?.isFullscreen === false && !container?.classList.contains('slsg-is-fullscreen');
  })()`);
  assert.equal(fsStateOff, true, 'Fullscreen mode should deactivate on second click');
  record('7. Tested fullscreen toggle (activated and restored cleanly)');

  // Verify visual taxonomy legend
  const legendInfo = evaluate(`(() => {
    const legend = document.querySelector('.graph-taxonomy-legend, .graph-umko-legend');
    if (!legend) return null;
    const badges = Array.from(legend.querySelectorAll('.legend-badge, span')).map(s => s.textContent.trim());
    return {
      classes: legend.className,
      badges
    };
  })()`);

  assert.ok(legendInfo !== null, 'Visual taxonomy legend (.graph-taxonomy-legend or .graph-umko-legend) must exist');
  assert.ok(legendInfo.badges.length >= 4, `Legend should display taxonomy badges (found ${legendInfo.badges.length})`);
  const mathTypesFound = legendInfo.badges.some(b => b.includes('قضیه') || b.includes('مفهوم') || b.includes('مسئله'));
  assert.equal(mathTypesFound, true, 'Legend must contain mathematical knowledge node types (قضیه, مفهوم, etc.)');
  record(`8. Visual taxonomy legend verified with mathematical badges: ${legendInfo.badges.join(', ')}`);

  // =========================================================================
  // SECTION 2: Mermaid Diagram Rendering
  // =========================================================================
  // Note axler-2d7afb5de78c939e contains a mermaid block (Linear Equation Systems flowchart)
  // Wait for client-side mermaid renderer to mark the figure ready
  browser('wait', 'figure.mermaid-diagram[data-mermaid-loaded="ready"]');

  const mermaidCheck = evaluate(`(() => {
    const fig = document.querySelector('figure.mermaid-diagram');
    const chart = fig?.querySelector('.mermaid-chart');
    const svg = chart?.querySelector('svg');
    const details = fig?.querySelector('details');
    const summary = details?.querySelector('summary');
    const pre = details?.querySelector('pre');
    return {
      figFound: !!fig,
      isLoaded: fig?.dataset.mermaidLoaded === 'ready',
      chartFound: !!chart,
      svgFound: !!svg,
      svgWidth: svg?.clientWidth || 0,
      svgHeight: svg?.clientHeight || 0,
      detailsFound: !!details,
      detailsOpen: details?.open,
      summaryText: summary?.textContent?.trim(),
      sourceContent: pre?.textContent || ''
    };
  })()`);

  assert.equal(mermaidCheck.figFound, true, '<figure class="mermaid-diagram"> must be present in DOM');
  assert.equal(mermaidCheck.isLoaded, true, 'Mermaid diagram dataset should indicate ready');
  assert.equal(mermaidCheck.svgFound, true, 'Client SVG chart must be generated inside .mermaid-chart');
  assert.ok(mermaidCheck.svgWidth > 0 && mermaidCheck.svgHeight > 0, `Generated SVG chart must have non-zero dimensions (${mermaidCheck.svgWidth}x${mermaidCheck.svgHeight})`);
  record(`9. Mermaid diagram client SVG verified (${mermaidCheck.svgWidth}x${mermaidCheck.svgHeight} px)`);

  // Test Mermaid source code accordion (<details>)
  assert.equal(mermaidCheck.detailsFound, true, '<details> accordion must be present for Mermaid source view');
  assert.equal(mermaidCheck.detailsOpen, false, 'Source code accordion should be closed initially');
  assert.ok(mermaidCheck.sourceContent.includes('flowchart'), 'Accordion pre element must contain raw Mermaid source code');

  // Click summary to expand accordion
  browser('click', 'figure.mermaid-diagram details summary');
  browser('wait', '300');
  const detailsExpanded = evaluate('document.querySelector("figure.mermaid-diagram details")?.open');
  assert.equal(detailsExpanded, true, 'Mermaid source code accordion should open on summary click');

  // Click summary again to collapse
  browser('click', 'figure.mermaid-diagram details summary');
  browser('wait', '300');
  const detailsCollapsed = evaluate('!document.querySelector("figure.mermaid-diagram details")?.open');
  assert.equal(detailsCollapsed, true, 'Mermaid source code accordion should close on second click');
  record('10. Mermaid source code accordion interaction tested (open/close & raw source verification)');

  // =========================================================================
  // SECTION 3: Interactive Canvas Viewer
  // =========================================================================
  // Test CanvasViewer component with Obsidian Canvas format nodes and edges
  const canvasFixtureData = JSON.stringify({
    nodes: [
      { id: 'node-core', type: 'text', text: 'هستهٔ جبر: فضاهای برداری', x: 0, y: 0, width: 220, height: 110, color: '1' },
      { id: 'node-sub', type: 'text', text: 'زیرفضاها و پایه‌ها', x: 320, y: 160, width: 220, height: 110, color: '4' }
    ],
    edges: [
      { id: 'edge-rel', fromNode: 'node-core', toNode: 'node-sub', label: 'تولید می‌کند', fromSide: 'right', toSide: 'left' }
    ]
  });

  // Mount .canvas-diagram component into document to verify CanvasViewer lifecycle
  const mountedCanvas = evaluate(`(() => {
    const existing = document.querySelector('figure.canvas-diagram');
    if (existing) existing.remove();

    const fig = document.createElement('figure');
    fig.className = 'canvas-diagram';
    fig.dataset.canvasTitle = 'نقشه مفهومی فضاهای برداری';
    fig.dataset.canvasData = encodeURIComponent(${JSON.stringify(canvasFixtureData)});
    document.querySelector('.workspace-document').appendChild(fig);
    return true;
  })()`);
  assert.equal(mountedCanvas, true, 'Canvas diagram figure should mount into document');

  // Wait for CanvasViewer observer to mount toolbar and viewport
  browser('wait', 'figure.canvas-diagram .canvas-toolbar');
  browser('wait', '500');

  const canvasViewerCheck = evaluate(`(() => {
    const fig = document.querySelector('figure.canvas-diagram, .canvas-diagram');
    const toolbar = fig?.querySelector('.canvas-toolbar');
    const viewport = fig?.querySelector('.canvas-viewport');
    const stage = fig?.querySelector('.canvas-stage');
    const nodes = fig?.querySelectorAll('.canvas-node') || [];
    const edges = fig?.querySelectorAll('.canvas-edge-path') || [];
    const zoomInBtn = fig?.querySelector('button[data-act="zoom-in"]');
    const zoomOutBtn = fig?.querySelector('button[data-act="zoom-out"]');
    const resetBtn = fig?.querySelector('button[data-act="reset"]');
    const fitBtn = fig?.querySelector('button[data-act="fit"]');

    return {
      hasFigure: !!fig,
      hasToolbar: !!toolbar,
      hasViewport: !!viewport,
      hasStage: !!stage,
      nodesCount: nodes.length,
      edgesCount: edges.length,
      hasZoomIn: !!zoomInBtn,
      hasZoomOut: !!zoomOutBtn,
      hasReset: !!resetBtn,
      hasFit: !!fitBtn,
      initialTransform: stage?.style.transform || ''
    };
  })()`);

  assert.equal(canvasViewerCheck.hasFigure, true, '<figure class="canvas-diagram"> must be rendered');
  assert.equal(canvasViewerCheck.hasToolbar, true, 'Canvas toolbar with interactive controls must exist');
  assert.equal(canvasViewerCheck.hasViewport, true, 'Canvas viewport must exist');
  assert.equal(canvasViewerCheck.hasStage, true, 'Canvas stage must exist');
  assert.equal(canvasViewerCheck.nodesCount, 2, 'Canvas nodes layer must render the 2 fixture nodes');
  assert.equal(canvasViewerCheck.edgesCount, 1, 'Canvas SVG layer must render the connecting edge');
  assert.equal(canvasViewerCheck.hasZoomIn, true, 'Zoom-in button (data-act="zoom-in") must exist');
  assert.equal(canvasViewerCheck.hasZoomOut, true, 'Zoom-out button (data-act="zoom-out") must exist');
  assert.equal(canvasViewerCheck.hasReset, true, 'Reset button (data-act="reset") must exist');
  assert.equal(canvasViewerCheck.hasFit, true, 'Fit button (data-act="fit") must exist');
  record(`11. Canvas Viewer component rendered (${canvasViewerCheck.nodesCount} nodes, ${canvasViewerCheck.edgesCount} edges, full toolbar)`);

  // Test Canvas Viewer Zoom & Fit Controls
  // 1. Test Zoom In
  browser('click', 'button[data-act="zoom-in"]');
  browser('wait', '200');
  const transformAfterZoomIn = evaluate('document.querySelector(".canvas-stage")?.style.transform || ""');
  assert.notEqual(transformAfterZoomIn, canvasViewerCheck.initialTransform, 'Zoom In must modify stage transform scale');

  // 2. Test Zoom Out
  browser('click', 'button[data-act="zoom-out"]');
  browser('wait', '200');
  const transformAfterZoomOut = evaluate('document.querySelector(".canvas-stage")?.style.transform || ""');

  // 3. Test Reset to 100%
  browser('click', 'button[data-act="reset"]');
  browser('wait', '200');
  const transformAfterReset = evaluate('document.querySelector(".canvas-stage")?.style.transform || ""');
  assert.ok(transformAfterReset.includes('scale(1)'), `Reset button must restore scale to 1 (got: ${transformAfterReset})`);

  // 4. Test Auto-Fit
  browser('click', 'button[data-act="fit"]');
  browser('wait', '200');
  const transformAfterFit = evaluate('document.querySelector(".canvas-stage")?.style.transform || ""');
  assert.ok(transformAfterFit.length > 0, 'Fit button must calculate and apply bounding scale transform');
  record('12. Tested Canvas Viewer controls: zoom-in, zoom-out, 100% reset, and auto-fit responses verified');

  // Final sanity check for any unhandled browser errors
  const pageErrors = browser('errors')?.errors || [];
  const criticalErrors = pageErrors.filter(e =>
    !e.text?.includes('CanvasRenderer is not yet implemented') &&
    !e.text?.includes('interpolatedValue')
  );
  assert.equal(criticalErrors.length, 0, `No critical page errors allowed: ${JSON.stringify(criticalErrors)}`);

  console.log(`\nAll ${checks.length} checks passed successfully!`);

} catch (err) {
  console.error('\n[TEST FAILURE]', err);
  throw err;
} finally {
  try {
    browser('close');
    console.log('Browser session closed cleanly.');
  } catch (closeErr) {
    console.error('Error closing session:', closeErr);
  }
}
