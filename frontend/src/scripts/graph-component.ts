import {
  drag,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom,
  zoomIdentity,
  ZoomTransform,
  type DragBehavior,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type ZoomBehavior,
} from 'd3';
import { UMKO_KINDS, UMKO_RELATIONS, UMKO_RELATION_PLANES } from '../lib/umko.mjs';

export type RelationPlaneKey = keyof typeof UMKO_RELATION_PLANES;
export type LayoutMode = 'force' | 'dag';

export interface SitemapEntry {
  title?: string;
  exists?: boolean;
  external?: boolean;
  links?: string[];
  backlinks?: string[];
  rels?: Record<string, string[]>;
  tags?: string[];
  kind?: string;
  subtype?: string;
  level?: string;
  slogan?: string;
  uid?: string;
}

export interface GraphConfig {
  depth: number;
  prefetchPages: boolean;
  renderExternal: boolean;
  renderLabels: boolean;
  renderArrows: boolean;
  typedOnly: boolean;
  layoutMode: LayoutMode;
  labelFontSize: number;
  linkDistance: number;
  repelForce: number;
  centerForce: number;
  colliderPadding: number;
  alphaDecay: number;
  scale: number;
  minZoom: number;
  maxZoom: number;
  actions: string[];
}

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  shortTitle: string;
  fullShortTitle: string;
  kind: string;
  kindLabel: string;
  slogan: string;
  tags: string[];
  isCurrent: boolean;
  degree: number;
  outCount: number;
  inCount: number;
  radius: number;
  lightColor: string;
  darkColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  labelAlpha: number;
  hoverScale: number;
  dagRank?: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  source: GraphNode;
  target: GraphNode;
  relations: string[];
  primaryRel: string;
  plane: RelationPlaneKey;
  isTyped: boolean;
  isDag: boolean;
  bidirectional: boolean;
  curveOffset: number;
  lightColor: string;
  darkColor: string;
  dash: 'solid' | 'dashed' | 'dotted';
  shortLabel: string;
}

export interface RelationVisualMeta {
  key: string;
  plane: RelationPlaneKey;
  short: string;
  forward: string;
  reverse: string;
  icon: string;
  dag: boolean;
  symmetric: boolean;
  light: string;
  dark: string;
  dash: 'solid' | 'dashed' | 'dotted';
  priority: number;
}

interface KindVisual {
  label: string;
  light: string;
  dark: string;
  sizeBoost: number;
}

const DARK_KIND_COLORS: Record<string, string> = {
  assertion: '#60a5fa',
  concept: '#2dd4bf',
  proof: '#94a3b8',
  problem: '#fb923c',
  solution: '#34d399',
  technique: '#fbbf24',
  hint_ladder: '#f59e0b',
  problem_archetype: '#e879f9',
  pitfall: '#fbbf24',
  visual_lab: '#38bdf8',
  collection: '#a78bfa',
  axiom: '#22d3ee',
  theory: '#818cf8',
  remark: '#94a3b8',
  example: '#c084fc',
  counterexample: '#f87171',
  property: '#818cf8',
  algorithm: '#38bdf8',
  comparison: '#818cf8',
  code_kernel: '#94a3b8',
  symbol: '#94a3b8',
};

const KIND_SIZE_BOOST: Record<string, number> = {
  collection: 1.4,
  theory: 1.1,
  assertion: 0.4,
  concept: 0.4,
  visual_lab: 0.4,
  problem: 0.3,
  axiom: 0.3,
  problem_archetype: 0.3,
  counterexample: 0.2,
  algorithm: 0.2,
  comparison: 0.2,
  pitfall: 0.1,
  property: 0.1,
  technique: 0,
  example: -0.1,
  solution: -0.2,
  code_kernel: -0.2,
  proof: -0.4,
  symbol: -0.4,
  hint_ladder: -0.5,
  remark: -0.6,
};

function getKindVisual(kind: string): KindVisual {
  const entry = (UMKO_KINDS as Record<string, { label: string; color: string }>)[kind];
  if (!entry) {
    return { label: 'یادداشت', light: '#4f46e5', dark: '#818cf8', sizeBoost: 0 };
  }
  return {
    label: entry.label,
    light: entry.color,
    dark: DARK_KIND_COLORS[kind] || entry.color,
    sizeBoost: KIND_SIZE_BOOST[kind] ?? 0,
  };
}

export function classifyRelation(relKey: string): RelationVisualMeta {
  const raw = (UMKO_RELATIONS as Record<string, any>)[relKey];
  if (!raw) {
    const planeMeta = UMKO_RELATION_PLANES.context;
    return {
      key: 'local_context_uses',
      plane: 'context',
      short: 'ارجاع متنی',
      forward: 'ارجاع در متن',
      reverse: 'ارجاع‌شده از متن',
      icon: '🔗',
      dag: false,
      symmetric: false,
      light: planeMeta.light,
      dark: planeMeta.dark,
      dash: 'solid',
      priority: planeMeta.priority,
    };
  }
  const planeKey = (raw.plane in UMKO_RELATION_PLANES ? raw.plane : 'context') as RelationPlaneKey;
  const planeMeta = UMKO_RELATION_PLANES[planeKey];
  return {
    key: relKey,
    plane: planeKey,
    short: raw.short || raw.forward || relKey,
    forward: raw.forward || relKey,
    reverse: raw.reverse || raw.forward || relKey,
    icon: raw.icon || '🔗',
    dag: !!raw.dag,
    symmetric: !!raw.symmetric,
    light: raw.lightOverride || planeMeta.light,
    dark: raw.darkOverride || planeMeta.dark,
    dash: (raw.dashOverride || planeMeta.dash || 'solid') as 'solid' | 'dashed' | 'dotted',
    priority: planeMeta.priority,
  };
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function inferSemanticKind(entry: SitemapEntry): string {
  if (entry.kind && entry.kind in UMKO_KINDS) return entry.kind;
  const tags = entry.tags || [];
  const title = entry.title || '';

  for (const raw of tags) {
    const t = raw.startsWith('#') ? raw.slice(1) : raw;
    if (t.startsWith('kind:')) {
      const k = t.slice(5);
      if (k in UMKO_KINDS) return k;
    }
  }

  const tagSet = new Set(tags.map(t => (t.startsWith('#') ? t.slice(1) : t)));
  if (tagSet.has('MOC') || tagSet.has('نقشه_راه') || /^00-MOC|^MOC-/.test(title)) return 'collection';
  if (tagSet.has('جئوجبرا') || tagSet.has('تجسم_هندسی') || tagSet.has('شبیه‌ساز')) return 'visual_lab';
  if (tagSet.has('دام') || tagSet.has('کج‌فهمی')) return 'pitfall';
  if (tagSet.has('مثال_نقض')) return 'counterexample';
  if (tagSet.has('قضیه') || tagSet.has('لم') || tagSet.has('نتیجه') || tagSet.has('گزاره')) return 'assertion';
  if (tagSet.has('تعریف') || tagSet.has('مفهوم') || tagSet.has('پیش‌نیاز')) return 'concept';
  if (tagSet.has('اثبات') || tagSet.has('برهان')) return 'proof';
  if (tagSet.has('مثال')) return 'example';
  if (tagSet.has('نکته_امتحانی') || tagSet.has('تکنیک') || tagSet.has('شگرد')) return 'technique';
  if (tagSet.has('تمرین') || tagSet.has('مسئله')) {
    return title.startsWith('حل ') || title.startsWith('راه‌حل') ? 'solution' : 'problem';
  }
  if (tagSet.has('حل_تشریحی') || tagSet.has('راه‌حل')) return 'solution';
  if (/^قضیه|^لم|^نتیجه|^گزاره/.test(title)) return 'assertion';
  if (/^تعریف|^مفهوم/.test(title)) return 'concept';
  if (/^تمرین|^مسئله/.test(title)) return 'problem';
  if (/^حل |^راه‌حل/.test(title)) return 'solution';
  if (/^مثال/.test(title)) return 'example';
  if (/^اثبات|^برهان/.test(title)) return 'proof';
  return '';
}

function truncateLabel(title: string, maxChars: number): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > maxChars * 0.55 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + '…';
}

export function buildTypedGraphData(
  sitemap: Record<string, SitemapEntry>,
  currentPage: string,
  depth: number,
  renderExternal = false
): { nodes: GraphNode[]; links: GraphLink[]; adjacency: Map<string, Set<string>>; typedLinkCount: number } {
  const visited = new Set<string>();
  const hasCurrent = !!sitemap[currentPage];

  if (depth >= 5 || depth < 0) {
    for (const id of Object.keys(sitemap)) {
      const entry = sitemap[id];
      if (!entry || entry.exists === false) continue;
      if (!renderExternal && entry.external) continue;
      visited.add(id);
    }
  } else if (hasCurrent) {
    visited.add(currentPage);
    let frontier = [currentPage];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        const item = sitemap[id];
        if (!item) continue;
        const neighbors = [...(item.links || []), ...(item.backlinks || [])];
        for (const target of neighbors) {
          const entry = sitemap[target];
          if (!entry || entry.exists === false) continue;
          if (!renderExternal && entry.external) continue;
          if (!visited.has(target)) {
            visited.add(target);
            next.push(target);
          }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
  }

  // Collect all directed edges with their exact UMKO relation types
  const directedMap = new Map<string, { s: string; t: string; rels: string[] }>();
  for (const id of visited) {
    const item = sitemap[id];
    if (!item) continue;
    const relMap = item.rels || {};
    const allTargets = new Set<string>([...(item.links || []), ...Object.keys(relMap)]);
    for (const tgt of allTargets) {
      if (!visited.has(tgt) || tgt === id) continue;
      const explicitRels = Array.isArray(relMap[tgt]) ? relMap[tgt].filter(Boolean) : [];
      directedMap.set(`${id}\0${tgt}`, {
        s: id,
        t: tgt,
        rels: explicitRels.length ? [...new Set(explicitRels)] : ['local_context_uses'],
      });
    }
  }

  const adjacency = new Map<string, Set<string>>();
  const outCounts = new Map<string, number>();
  const inCounts = new Map<string, number>();
  for (const id of visited) {
    adjacency.set(id, new Set());
    outCounts.set(id, 0);
    inCounts.set(id, 0);
  }
  for (const edge of directedMap.values()) {
    adjacency.get(edge.s)!.add(edge.t);
    adjacency.get(edge.t)!.add(edge.s);
    outCounts.set(edge.s, (outCounts.get(edge.s) || 0) + 1);
    inCounts.set(edge.t, (inCounts.get(edge.t) || 0) + 1);
  }

  // Build nodes positioned in a deterministic golden-angle spiral
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const orderedIds = [...visited].sort((a, b) => {
    if (a === currentPage) return -1;
    if (b === currentPage) return 1;
    return (adjacency.get(b)?.size || 0) - (adjacency.get(a)?.size || 0);
  });

  const nodeMap = new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  const spreadStep = orderedIds.length <= 20 ? 36 : orderedIds.length <= 80 ? 22 : 13;

  orderedIds.forEach((id, idx) => {
    const item = sitemap[id];
    if (!item) return;
    const isCurrent = id === currentPage;
    const kind = inferSemanticKind(item);
    const visual = getKindVisual(kind);
    const degree = adjacency.get(id)?.size || 0;
    const baseRadius = 5.4 + visual.sizeBoost + Math.min(4.2, Math.log2(degree + 1) * 1.15);
    const radius = isCurrent ? Math.max(baseRadius + 1.5, 8.6) : Math.max(4.8, Math.min(11, baseRadius));

    const r = isCurrent ? 0 : Math.sqrt(idx) * spreadStep;
    const theta = idx * GOLDEN_ANGLE;
    const title = item.title || id.replace(/^notes\//, '');

    const node: GraphNode = {
      id,
      title,
      shortTitle: truncateLabel(title, 22),
      fullShortTitle: truncateLabel(title, 30),
      kind,
      kindLabel: visual.label,
      slogan: item.slogan || '',
      tags: item.tags || [],
      isCurrent,
      degree,
      outCount: outCounts.get(id) || 0,
      inCount: inCounts.get(id) || 0,
      radius,
      lightColor: visual.light,
      darkColor: visual.dark,
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      vx: 0,
      vy: 0,
      labelAlpha: isCurrent ? 1 : 0,
      hoverScale: 1,
    };
    nodes.push(node);
    nodeMap.set(id, node);
  });

  // Resolve pairs into clean straight or curved typed edges
  const links: GraphLink[] = [];
  const processedPairs = new Set<string>();
  let typedLinkCount = 0;

  const makeLink = (
    sId: string,
    tId: string,
    rels: string[],
    bidirectional: boolean,
    curveOffset: number
  ): GraphLink | null => {
    const source = nodeMap.get(sId);
    const target = nodeMap.get(tId);
    if (!source || !target) return null;
    const metas = rels.map(classifyRelation).sort((a, b) => a.priority - b.priority);
    const primary = metas[0];
    const isTyped = primary.key !== 'local_context_uses';
    if (isTyped) typedLinkCount++;
    return {
      id: `${sId}->${tId}`,
      source,
      target,
      relations: rels,
      primaryRel: primary.key,
      plane: primary.plane,
      isTyped,
      isDag: metas.some(m => m.dag),
      bidirectional,
      curveOffset,
      lightColor: primary.light,
      darkColor: primary.dark,
      dash: primary.dash,
      shortLabel: metas.length > 1 ? `${primary.short} (+${toPersianDigits(metas.length - 1)})` : primary.short,
    };
  };

  for (const edge of directedMap.values()) {
    const pairKey = edge.s < edge.t ? `${edge.s}\0${edge.t}` : `${edge.t}\0${edge.s}`;
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    const rev = directedMap.get(`${edge.t}\0${edge.s}`);
    const fwdTyped = edge.rels.some(r => r !== 'local_context_uses');
    const revTyped = !!rev && rev.rels.some(r => r !== 'local_context_uses');

    if (!rev) {
      const l = makeLink(edge.s, edge.t, edge.rels, false, 0);
      if (l) links.push(l);
    } else if (fwdTyped && !revTyped) {
      // Typed UMKO relation supersedes plain contextual back-reference
      const l = makeLink(edge.s, edge.t, edge.rels, false, 0);
      if (l) links.push(l);
    } else if (!fwdTyped && revTyped) {
      const l = makeLink(rev.s, rev.t, rev.rels, false, 0);
      if (l) links.push(l);
    } else if (fwdTyped && revTyped) {
      // Both directions carry explicit semantic relations: separate cleanly with symmetric Bezier arcs
      const l1 = makeLink(edge.s, edge.t, edge.rels, false, 20);
      const l2 = makeLink(rev.s, rev.t, rev.rels, false, 20);
      if (l1) links.push(l1);
      if (l2) links.push(l2);
    } else {
      // Both are plain contextual wikilinks: merge into one crisp bidirectional edge
      const l = makeLink(edge.s, edge.t, ['local_context_uses'], true, 0);
      if (l) links.push(l);
    }
  }

  return { nodes, links, adjacency, typedLinkCount };
}

/**
 * Computes a clean top-down hierarchical DAG layout following UMKO v1.1 backward-linking semantics:
 * prerequisites / foundational concepts / theorems sit in higher layers (rank 0),
 * while dependent theorems, proofs, problems, and solutions flow downward.
 */
export function computeDagLayout(
  nodes: GraphNode[],
  links: GraphLink[]
): Map<string, { x: number; y: number; rank: number }> {
  const result = new Map<string, { x: number; y: number; rank: number }>();
  if (!nodes.length) return result;

  const nodeIds = new Set(nodes.map(n => n.id));
  const typedDirectional = links.filter(l => l.isTyped && !classifyRelation(l.primaryRel).symmetric);
  // Prioritize strict DAG relations first, then include directional typed UMKO edges (e.g. illustrates, solves, visualizes)
  // so examples/solutions/labs neatly sit below the concepts/problems they belong to.
  const activeLinks = typedDirectional.length > 0 ? typedDirectional : links;

  // Build parent -> child directed edges (parent = foundational / prerequisite, child = dependent)
  const forwardRels = new Set(['rel_generalizes', 'rel_implies']);
  const rawChildren = new Map<string, string[]>();
  for (const n of nodes) rawChildren.set(n.id, []);

  for (const l of activeLinks) {
    const s = l.source.id;
    const t = l.target.id;
    if (!nodeIds.has(s) || !nodeIds.has(t) || s === t) continue;
    // Backward-linking: source depends on / proves / solves / illustrates / extends target -> target is parent
    const parent = forwardRels.has(l.primaryRel) ? s : t;
    const child = forwardRels.has(l.primaryRel) ? t : s;
    const list = rawChildren.get(parent)!;
    if (!list.includes(child)) list.push(child);
  }

  // Break any accidental cycles via DFS so topological layering is guaranteed to terminate
  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const n of nodes) {
    state.set(n.id, 0);
    children.set(n.id, []);
    parents.set(n.id, []);
  }

  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of rawChildren.get(u) || []) {
      const st = state.get(v) || 0;
      if (st === 1) continue; // cycle back-edge skipped
      children.get(u)!.push(v);
      parents.get(v)!.push(u);
      if (st === 0) dfs(v);
    }
    state.set(u, 2);
  };

  // Start DFS from highest-priority roots (no incoming parent or current/collection hubs)
  const inDegRaw = new Map<string, number>();
  for (const n of nodes) inDegRaw.set(n.id, 0);
  for (const list of rawChildren.values()) {
    for (const v of list) inDegRaw.set(v, (inDegRaw.get(v) || 0) + 1);
  }
  const dfsOrder = [...nodes].sort((a, b) => {
    const da = inDegRaw.get(a.id) || 0;
    const db = inDegRaw.get(b.id) || 0;
    if (da !== db) return da - db;
    return b.degree - a.degree;
  });
  for (const n of dfsOrder) {
    if (state.get(n.id) === 0) dfs(n.id);
  }

  // Longest-path topological ranking
  const inDeg = new Map<string, number>();
  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    const d = parents.get(n.id)!.length;
    inDeg.set(n.id, d);
    rank.set(n.id, 0);
    if (d === 0) queue.push(n.id);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const ru = rank.get(u) || 0;
    for (const v of children.get(u) || []) {
      if ((rank.get(v) || 0) < ru + 1) rank.set(v, ru + 1);
      const nextDeg = (inDeg.get(v) || 1) - 1;
      inDeg.set(v, nextDeg);
      if (nextDeg === 0) queue.push(v);
    }
  }

  // Group into layers & wrap very wide layers cleanly
  const byRank = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) || 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  }

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  const posX = new Map<string, number>();
  const colGap = nodes.length <= 25 ? 145 : nodes.length <= 100 ? 115 : 88;
  const rowGap = nodes.length <= 25 ? 112 : nodes.length <= 100 ? 96 : 82;
  const maxPerRow = nodes.length <= 40 ? 9 : 14;

  let visualRow = 0;
  for (const r of sortedRanks) {
    const layer = byRank.get(r)!;
    // Barycenter ordering by average parent X to minimize edge crossings
    layer.sort((a, b) => {
      const pa = parents.get(a.id) || [];
      const pb = parents.get(b.id) || [];
      const avgA = pa.length ? pa.reduce((s, p) => s + (posX.get(p) ?? 0), 0) / pa.length : 0;
      const avgB = pb.length ? pb.reduce((s, p) => s + (posX.get(p) ?? 0), 0) / pb.length : 0;
      if (Math.abs(avgA - avgB) > 0.5) return avgA - avgB;
      return b.degree - a.degree;
    });

    const subRows = Math.ceil(layer.length / maxPerRow);
    for (let sr = 0; sr < subRows; sr++) {
      const slice = layer.slice(sr * maxPerRow, (sr + 1) * maxPerRow);
      const totalWidth = (slice.length - 1) * colGap;
      slice.forEach((n, idx) => {
        const x = idx * colGap - totalWidth / 2;
        const y = visualRow * rowGap;
        posX.set(n.id, x);
        result.set(n.id, { x, y, rank: r });
      });
      visualRow++;
    }
  }

  // Center vertically around y = 0
  const maxY = Math.max(0, (visualRow - 1) * rowGap);
  for (const val of result.values()) {
    val.y -= maxY / 2;
  }
  return result;
}

const DEFAULT_CONFIG: GraphConfig = {
  depth: 1,
  prefetchPages: false,
  renderExternal: false,
  renderLabels: true,
  renderArrows: true,
  typedOnly: false,
  layoutMode: 'force',
  labelFontSize: 12,
  linkDistance: 120,
  repelForce: 150,
  centerForce: 0.12,
  colliderPadding: 24,
  alphaDecay: 0.028,
  scale: 1,
  minZoom: 0.08,
  maxZoom: 4.5,
  actions: ['reset-zoom', 'fullscreen', 'typed-only', 'render-arrows', 'settings'],
};

const ACTION_ICONS: Record<string, string> = {
  'reset-zoom':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>',
  fullscreen:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>',
  minimize:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/></svg>',
  'typed-only':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
  'render-arrows':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="M7 17 16.5 7.5"/><path d="M11 7h6v6"/></svg>',
  settings:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>',
};

const ACTION_TITLES: Record<string, string> = {
  'reset-zoom': 'بازنشانی زوم',
  fullscreen: 'تمام‌صفحه یا بازگشت',
  'typed-only': 'فقط روابط صوری UMKO (مخفی‌سازی ارجاعات متنی)',
  'render-arrows': 'نمایش یا حذف جهت پیوندها',
  settings: 'تنظیمات گراف',
};

const LEGEND_ITEMS = [
  { kind: 'assertion', label: 'قضیه', color: '#1d4ed8' },
  { kind: 'concept', label: 'مفهوم', color: '#0d9488' },
  { kind: 'problem', label: 'مسئله', color: '#ea580c' },
  { kind: 'solution', label: 'راه‌حل', color: '#059669' },
  { kind: 'collection', label: 'نقشه راه', color: '#7c3aed' },
  { kind: 'visual_lab', label: 'شبیه‌ساز', color: '#0284c7' },
  { kind: 'pitfall', label: 'دام', color: '#b45309' },
];

const PLANE_FILTER_ITEMS: Array<{ key: RelationPlaneKey; label: string; color: string; dash: string }> = [
  { key: 'deduction', label: 'استنتاج', color: '#2563eb', dash: 'solid' },
  { key: 'structure', label: 'ساختار', color: '#0d9488', dash: 'solid' },
  { key: 'problem_solving', label: 'مسئله و حل', color: '#ea580c', dash: 'solid' },
  { key: 'pedagogy', label: 'پیش‌نیاز', color: '#059669', dash: 'dashed' },
  { key: 'enrichment', label: 'مکمل', color: '#0284c7', dash: 'dotted' },
];

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface EdgeGeom {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  ex: number;
  ey: number;
  midX: number;
  midY: number;
  endAngle: number;
  startAngle: number;
  curved: boolean;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [100, 116, 139];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function getEdgeGeometry(link: GraphLink, layoutMode: LayoutMode): EdgeGeom | null {
  const s = link.source;
  const t = link.target;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const dist = Math.hypot(dx, dy);
  if (dist < s.radius + t.radius + 4) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const curve = link.curveOffset !== 0 ? link.curveOffset : layoutMode === 'dag' && Math.abs(dy) > 40 ? 0 : 0;

  if (Math.abs(curve) > 0.5) {
    // Perpendicular offset for quadratic Bezier arc
    const nx = -uy;
    const ny = ux;
    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const cx = mx + nx * curve;
    const cy = my + ny * curve;

    const sAng = Math.atan2(cy - s.y, cx - s.x);
    const eAng = Math.atan2(t.y - cy, t.x - cx);
    const sx = s.x + Math.cos(sAng) * (s.radius + 1.5);
    const sy = s.y + Math.sin(sAng) * (s.radius + 1.5);
    const ex = t.x - Math.cos(eAng) * (t.radius + 2);
    const ey = t.y - Math.sin(eAng) * (t.radius + 2);
    const midX = 0.25 * sx + 0.5 * cx + 0.25 * ex;
    const midY = 0.25 * sy + 0.5 * cy + 0.25 * ey;
    return { sx, sy, cx, cy, ex, ey, midX, midY, endAngle: eAng, startAngle: sAng + Math.PI, curved: true };
  }

  const sx = s.x + ux * (s.radius + 1.5);
  const sy = s.y + uy * (s.radius + 1.5);
  const ex = t.x - ux * (t.radius + 2);
  const ey = t.y - uy * (t.radius + 2);
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const ang = Math.atan2(dy, dx);
  return { sx, sy, cx: midX, cy: midY, ex, ey, midX, midY, endAngle: ang, startAngle: ang + Math.PI, curved: false };
}

function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

const graphSitemapCache = new Map<
  string,
  { promise: Promise<Record<string, SitemapEntry>>; data?: Record<string, SitemapEntry>; fetch: typeof globalThis.fetch }
>();

export function resetGraphSitemapCache() {
  graphSitemapCache.clear();
}

export async function fetchGraphSitemap(url: string): Promise<Record<string, SitemapEntry>> {
  const currentFetch = globalThis.fetch;
  const existing = graphSitemapCache.get(url);
  if (existing && existing.fetch === currentFetch) {
    if (existing.data) return existing.data;
    return existing.promise;
  }
  const promise = currentFetch(url, { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Graph sitemap fetch failed: ${response.status}`);
      }
      const data = (await response.json()) as Record<string, SitemapEntry>;
      const entry = graphSitemapCache.get(url);
      if (entry?.promise === promise) {
        entry.data = data;
      }
      return data;
    });
  graphSitemapCache.set(url, { promise, fetch: currentFetch });
  try {
    return await promise;
  } catch (error) {
    const entry = graphSitemapCache.get(url);
    if (entry?.promise === promise) {
      graphSitemapCache.delete(url);
    }
    throw error;
  }
}

export class GraphComponent extends HTMLElement {
  config!: GraphConfig;
  sitemap: Record<string, SitemapEntry> = {};
  graphUrl = '';
  currentPage = '';
  isFullscreen = false;

  graphContainer!: HTMLDivElement;
  actionContainer!: HTMLDivElement;
  canvas!: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  tooltipEl!: HTMLDivElement;
  fsHudEl!: HTMLDivElement;
  fsDockEl!: HTMLDivElement;
  blurEl: HTMLDivElement | null = null;
  placeholderEl: HTMLDivElement | null = null;

  nodes: GraphNode[] = [];
  links: GraphLink[] = [];
  private typedLinkCount = 0;
  private adjacency = new Map<string, Set<string>>();
  private simulation: Simulation<GraphNode, GraphLink> | null = null;
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  private dragBehavior: DragBehavior<HTMLCanvasElement, unknown, GraphNode | unknown> | null = null;

  private transform: ZoomTransform = zoomIdentity;
  private hoveredNode: GraphNode | null = null;
  private hoveredLink: GraphLink | null = null;
  private pointerScreenX = 0;
  private pointerScreenY = 0;
  private draggedNode: GraphNode | null = null;

  private activeKindFilter: string | null = null;
  private activePlaneFilter: RelationPlaneKey | null = null;
  private searchQuery = '';
  private searchMatches = new Set<string>();

  // Smooth layout transition state (Force <-> DAG)
  private layoutAnim: {
    startTime: number;
    duration: number;
    from: Map<string, { x: number; y: number }>;
    to: Map<string, { x: number; y: number }>;
  } | null = null;

  // Animation state
  private hoverMix = 0;
  private rafId = 0;
  private running = false;
  private mounted = false;
  private prefersReducedMotion = false;
  private lastViewportW = 0;
  private lastViewportH = 0;
  private labelWidthCache = new Map<string, number>();

  private themeObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundKeydown: ((e: KeyboardEvent) => void) | null = null;
  private boundOutsideClick: ((e: MouseEvent) => void) | null = null;

  simulator!: {
    readonly nodes: GraphNode[];
    readonly links: GraphLink[];
    userZoomed: boolean;
    centerTransform: ZoomTransform;
    zoomTransform: ZoomTransform;
    transform: ZoomTransform;
    renderer: { resetZoom: (t?: ZoomTransform) => void };
    updateZoom: (k?: number, x?: number, y?: number, immediate?: boolean) => void;
    update: () => void;
    requestRender: boolean;
  };

  constructor() {
    super();
    this.initConfig();
  }

  private initConfig() {
    let parsed: Partial<GraphConfig> = {};
    try {
      parsed = JSON.parse(this.dataset.config || '{}');
    } catch {
      parsed = {};
    }
    this.config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      actions: Array.isArray(parsed.actions) ? [...parsed.actions] : [...DEFAULT_CONFIG.actions],
    };
    try {
      this.sitemap = JSON.parse(this.dataset.sitemap || '{}');
    } catch {
      this.sitemap = {};
    }
    this.graphUrl = this.dataset.graphUrl || '/api/graph.json';
    this.currentPage = (this.dataset.slug || location.pathname.replace(/^\/+/, '')).replace(/\/+$/, '');
  }

  connectedCallback() {
    if (this.mounted) return;
    this.mounted = true;

    this.prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const prev = this.previousElementSibling;
    if (prev && prev.classList.contains('slsg-graph-skeleton')) {
      prev.remove();
    }

    this.classList.add('slsg-graph-component');
    this.style.visibility = 'visible';
    this.style.opacity = '1';

    this.graphContainer = document.createElement('div');
    this.graphContainer.className = 'slsg-graph-container kg-container';
    this.graphContainer.tabIndex = 0;
    this.appendChild(this.graphContainer);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'graph-canvas-2d kg-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'نمودار ارتباطات؛ فهرست متنی پیوندها در ادامهٔ صفحه است');
    this.graphContainer.appendChild(this.canvas);

    this.ctx = typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;

    this.actionContainer = document.createElement('div');
    this.actionContainer.className = 'slsg-graph-action-container kg-actions';
    this.graphContainer.appendChild(this.actionContainer);
    this.renderActionButtons();

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'kg-tooltip';
    this.tooltipEl.setAttribute('aria-hidden', 'true');
    this.tooltipEl.hidden = true;
    this.graphContainer.appendChild(this.tooltipEl);

    // Fullscreen Top-Right HUD (Search + Depth + Layout Mode + UMKO Typed-Only + Stats)
    this.fsHudEl = document.createElement('div');
    this.fsHudEl.className = 'kg-fs-hud';
    this.fsHudEl.hidden = true;
    this.fsHudEl.innerHTML = `
      <div class="kg-fs-search-wrap">
        <svg class="kg-fs-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" class="kg-fs-search" placeholder="جست‌وجوی یادداشت…" aria-label="جست‌وجوی یادداشت در گراف" />
      </div>
      <div class="kg-fs-group" role="group" aria-label="عمق نمایش">
        <button type="button" class="kg-fs-chip" data-fs-depth="1">۱ گام</button>
        <button type="button" class="kg-fs-chip" data-fs-depth="2">۲ گام</button>
        <button type="button" class="kg-fs-chip" data-fs-depth="5">سراسری</button>
      </div>
      <div class="kg-fs-group" role="group" aria-label="نوع چیدمان">
        <button type="button" class="kg-fs-chip active" data-fs-layout="force" title="چیدمان فیزیکی شبکه‌ای">شبکه‌ای</button>
        <button type="button" class="kg-fs-chip" data-fs-layout="dag" title="چیدمان درختی پیش‌نیاز و استنتاج (DAG)">درختی DAG</button>
      </div>
      <button type="button" class="kg-fs-toggle" data-fs-typed-only aria-pressed="false" title="مخفی‌سازی ارجاعات متنی عادی و نمایش خالص روابط صوری UMKO">فقط UMKO</button>
      <span class="kg-fs-stats" data-fs-stats></span>
    `;
    this.graphContainer.appendChild(this.fsHudEl);
    this.bindFullscreenHud();

    // Fullscreen Bottom Unified Dock: Node Kinds + Edge Semantic Planes
    this.fsDockEl = document.createElement('div');
    this.fsDockEl.className = 'kg-fs-legend';
    this.fsDockEl.hidden = true;
    const kindChips = LEGEND_ITEMS.map(
      item =>
        `<button type="button" class="kg-fs-legend-chip" data-fs-kind="${item.kind}" style="--chip-c:${item.color}"><span class="kg-dot"></span>${item.label}</button>`
    ).join('');
    const planeChips = PLANE_FILTER_ITEMS.map(
      p =>
        `<button type="button" class="kg-fs-plane-chip" data-fs-plane="${p.key}" style="--plane-c:${p.color}" title="فیلتر پیوندهای صفحهٔ ${p.label}"><span class="kg-line-sample kg-line-${p.dash}"></span>${p.label}</button>`
    ).join('');
    this.fsDockEl.innerHTML = `
      <div class="kg-dock-section" role="group" aria-label="فیلتر نوع گره">${kindChips}</div>
      <span class="kg-dock-sep" aria-hidden="true"></span>
      <div class="kg-dock-section" role="group" aria-label="فیلتر صفحهٔ پیوند">${planeChips}</div>
    `;
    this.graphContainer.appendChild(this.fsDockEl);
    this.fsDockEl.addEventListener('click', e => {
      const kindBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-kind]');
      if (kindBtn) {
        const kind = kindBtn.dataset.fsKind || '';
        this.setKindFilter(this.activeKindFilter === kind ? null : kind);
        return;
      }
      const planeBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-plane]');
      if (planeBtn) {
        const plane = planeBtn.dataset.fsPlane as RelationPlaneKey;
        this.setPlaneFilter(this.activePlaneFilter === plane ? null : plane);
      }
    });

    const self = this;
    this.simulator = {
      get nodes() {
        return self.nodes;
      },
      get links() {
        return self.links;
      },
      userZoomed: false,
      centerTransform: zoomIdentity,
      zoomTransform: zoomIdentity,
      transform: zoomIdentity,
      renderer: {
        resetZoom: (t?: ZoomTransform) => {
          if (t && Number.isFinite(t.k)) {
            self.applyTransform(t, false);
          } else {
            self.fitToBounds(true);
          }
        },
      },
      updateZoom: (k?: number, x?: number, y?: number, immediate = false) => {
        const nk = Number.isFinite(k) ? (k as number) : self.transform.k;
        const nx = Number.isFinite(x) ? (x as number) : self.transform.x;
        const ny = Number.isFinite(y) ? (y as number) : self.transform.y;
        self.applyTransform(new ZoomTransform(nk, nx, ny), !immediate);
      },
      update: () => {
        if (self.config.layoutMode === 'force') {
          self.applyForces(true);
        } else {
          self.scheduleFrame();
        }
      },
      get requestRender() {
        return self.running;
      },
      set requestRender(val: boolean) {
        if (val) self.scheduleFrame();
      },
    };

    this.setupInteractions();
    this.setupObservers();
    if (Object.keys(this.sitemap).length > 0) {
      this.buildSubgraph(this.config.depth);
      this.dataset.graphReady = 'true';
    } else if (this.graphUrl) {
      this.dataset.graphReady = 'loading';
      void fetchGraphSitemap(this.graphUrl)
        .then(data => {
          if (!this.isConnected || !this.mounted) return;
          this.sitemap = data;
          this.buildSubgraph(this.config.depth);
          this.dataset.graphReady = 'true';
        })
        .catch(() => {
          if (this.isConnected && this.mounted) {
            this.dataset.graphReady = 'error';
          }
        });
    } else {
      this.buildSubgraph(this.config.depth);
      this.dataset.graphReady = 'true';
    }
  }

  disconnectedCallback() {
    this.cleanup();
    this.mounted = false;
  }

  private cleanup() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.running = false;
    this.simulation?.stop();
    this.simulation = null;
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.boundKeydown) {
      document.removeEventListener('keydown', this.boundKeydown);
      this.boundKeydown = null;
    }
    if (this.boundOutsideClick) {
      document.removeEventListener('mousedown', this.boundOutsideClick);
      this.boundOutsideClick = null;
    }
    if (this.isFullscreen) {
      this.disableFullscreen();
    }
  }

  public full_refresh() {
    this.buildSubgraph(this.config.depth);
    this.syncControls();
  }

  public fitGraph() {
    this.fitToBounds(true);
  }

  public setKindFilter(kind: string | null) {
    this.activeKindFilter = kind;
    const host = this.closest('[data-note-graph]');
    host?.querySelectorAll<HTMLElement>('[data-legend-kind]').forEach(el => {
      const active = !!kind && el.dataset.legendKind === kind;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    this.fsDockEl?.querySelectorAll<HTMLElement>('[data-fs-kind]').forEach(el => {
      el.classList.toggle('is-active', !!kind && el.dataset.fsKind === kind);
    });
    this.scheduleFrame();
  }

  public setPlaneFilter(plane: RelationPlaneKey | null) {
    this.activePlaneFilter = plane;
    this.fsDockEl?.querySelectorAll<HTMLElement>('[data-fs-plane]').forEach(el => {
      el.classList.toggle('is-active', !!plane && el.dataset.fsPlane === plane);
    });
    this.scheduleFrame();
  }

  public setTypedOnly(typedOnly: boolean) {
    this.config.typedOnly = typedOnly;
    this.hoveredLink = null;
    this.updateTooltip();
    this.syncControls();
    if (this.config.layoutMode === 'dag') {
      this.applyDagLayout(true);
    } else {
      this.scheduleFrame();
    }
  }

  public setLayoutMode(mode: LayoutMode) {
    if (this.config.layoutMode === mode && !this.layoutAnim) return;
    this.config.layoutMode = mode;
    this.syncControls();
    if (mode === 'dag') {
      this.applyDagLayout(true);
    } else {
      this.layoutAnim = null;
      for (const n of this.nodes) {
        n.fx = null;
        n.fy = null;
      }
      this.applyForces(true);
      setTimeout(() => this.fitToBounds(true), 240);
    }
  }

  private getVisibleLinks(): GraphLink[] {
    if (!this.config.typedOnly) return this.links;
    return this.links.filter(l => l.isTyped);
  }

  private applyDagLayout(animated: boolean) {
    this.simulation?.stop();
    const visibleLinks = this.getVisibleLinks();
    const layoutMap = computeDagLayout(this.nodes, visibleLinks);

    if (!animated || this.prefersReducedMotion) {
      for (const n of this.nodes) {
        const target = layoutMap.get(n.id);
        if (target) {
          n.x = target.x;
          n.y = target.y;
          n.vx = 0;
          n.vy = 0;
          n.dagRank = target.rank;
        }
      }
      this.layoutAnim = null;
      this.fitToBounds(false);
      this.scheduleFrame();
      return;
    }

    const from = new Map<string, { x: number; y: number }>();
    const to = new Map<string, { x: number; y: number }>();
    for (const n of this.nodes) {
      from.set(n.id, { x: n.x, y: n.y });
      const target = layoutMap.get(n.id);
      if (target) {
        to.set(n.id, { x: target.x, y: target.y });
        n.dagRank = target.rank;
      } else {
        to.set(n.id, { x: n.x, y: n.y });
      }
    }

    this.layoutAnim = {
      startTime: performance.now(),
      duration: 360,
      from,
      to,
    };
    this.scheduleFrame();

    // Fit camera smoothly to the target DAG bounding box
    const targetNodes = this.nodes.map(n => {
      const p = to.get(n.id);
      return p ? { x: p.x, y: p.y, radius: n.radius } : { x: n.x, y: n.y, radius: n.radius };
    });
    this.fitPoints(targetNodes, true);
  }

  private syncControls() {
    const depth = Number(this.config.depth);
    const host = this.closest('[data-note-graph]');
    host?.querySelectorAll<HTMLButtonElement>('[data-depth]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.depth) === depth);
    });
    this.fsHudEl?.querySelectorAll<HTMLButtonElement>('[data-fs-depth]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.fsDepth) === depth);
    });
    this.fsHudEl?.querySelectorAll<HTMLButtonElement>('[data-fs-layout]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.fsLayout === this.config.layoutMode);
    });
    const typedBtn = this.fsHudEl?.querySelector<HTMLButtonElement>('[data-fs-typed-only]');
    if (typedBtn) {
      typedBtn.classList.toggle('active', !!this.config.typedOnly);
      typedBtn.setAttribute('aria-pressed', String(!!this.config.typedOnly));
      typedBtn.disabled = this.typedLinkCount === 0;
    }
    const stats = this.fsHudEl?.querySelector('[data-fs-stats]');
    if (stats) {
      const visLinks = this.getVisibleLinks().length;
      const typedSuffix = this.typedLinkCount > 0 && !this.config.typedOnly ? ` (${toPersianDigits(this.typedLinkCount)} صوری)` : '';
      stats.textContent = `${toPersianDigits(this.nodes.length)} یادداشت · ${toPersianDigits(visLinks)} پیوند${typedSuffix}`;
    }
    this.renderActionButtons();
  }

  private bindFullscreenHud() {
    this.fsHudEl.addEventListener('click', e => {
      const depthBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-depth]');
      if (depthBtn) {
        this.config.depth = Number(depthBtn.dataset.fsDepth);
        this.full_refresh();
        return;
      }
      const layoutBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-layout]');
      if (layoutBtn) {
        const mode = layoutBtn.dataset.fsLayout as LayoutMode;
        this.setLayoutMode(mode);
        return;
      }
      const typedBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-typed-only]');
      if (typedBtn && !typedBtn.disabled) {
        this.setTypedOnly(!this.config.typedOnly);
      }
    });

    const input = this.fsHudEl.querySelector<HTMLInputElement>('.kg-fs-search');
    if (input) {
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        this.searchQuery = q;
        this.searchMatches.clear();
        if (q) {
          for (const n of this.nodes) {
            if (
              n.title.toLowerCase().includes(q) ||
              n.kindLabel.toLowerCase().includes(q) ||
              n.slogan.toLowerCase().includes(q)
            ) {
              this.searchMatches.add(n.id);
            }
          }
        }
        this.scheduleFrame();
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && this.searchMatches.size > 0) {
          e.preventDefault();
          const firstId = this.searchMatches.values().next().value;
          const target = this.nodes.find(n => n.id === firstId);
          if (target) this.focusNode(target);
        } else if (e.key === 'Escape' && input.value) {
          e.stopPropagation();
          input.value = '';
          this.searchQuery = '';
          this.searchMatches.clear();
          this.scheduleFrame();
        }
      });
    }
  }

  private focusNode(node: GraphNode) {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 300;
    const targetK = Math.max(1.35, Math.min(2.2, this.transform.k));
    const tx = w / 2 - node.x * targetK;
    const ty = h / 2 - node.y * targetK;
    this.hoveredNode = node;
    this.hoveredLink = null;
    this.applyTransform(new ZoomTransform(targetK, tx, ty), true);
    this.updateTooltip();
    this.scheduleFrame();
  }

  private renderActionButtons() {
    this.actionContainer.replaceChildren();
    for (const action of this.config.actions) {
      // Hide typed-only toolbar icon when current subgraph has zero typed UMKO relations (e.g. non-UMKO vault)
      if (action === 'typed-only' && this.typedLinkCount === 0) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slsg-graph-action-button kg-action-btn';
      btn.dataset.graphAction = action;
      const title = ACTION_TITLES[action] ?? action;
      btn.title = title;
      btn.setAttribute('aria-label', title);

      if (action === 'fullscreen') {
        btn.innerHTML = this.isFullscreen ? ACTION_ICONS.minimize : ACTION_ICONS.fullscreen;
        btn.setAttribute('aria-pressed', String(this.isFullscreen));
        btn.addEventListener('click', e => {
          e.stopPropagation();
          if (this.isFullscreen) this.disableFullscreen();
          else this.enableFullscreen();
        });
      } else if (action === 'reset-zoom') {
        btn.innerHTML = ACTION_ICONS['reset-zoom'];
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.fitToBounds(true);
        });
      } else if (action === 'typed-only') {
        btn.innerHTML = ACTION_ICONS['typed-only'];
        btn.classList.toggle('is-active', !!this.config.typedOnly);
        btn.setAttribute('aria-pressed', String(!!this.config.typedOnly));
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.setTypedOnly(!this.config.typedOnly);
        });
      } else if (action === 'render-arrows') {
        btn.innerHTML = ACTION_ICONS['render-arrows'];
        btn.classList.toggle('is-active', !!this.config.renderArrows);
        btn.setAttribute('aria-pressed', String(!!this.config.renderArrows));
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.config.renderArrows = !this.config.renderArrows;
          btn.classList.toggle('is-active', !!this.config.renderArrows);
          btn.setAttribute('aria-pressed', String(!!this.config.renderArrows));
          this.scheduleFrame();
        });
      } else if (action === 'settings') {
        btn.innerHTML = ACTION_ICONS.settings;
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.toggleSettingsPopup();
        });
      }
      this.actionContainer.appendChild(btn);
    }
  }

  public enableFullscreen() {
    if (this.isFullscreen) return;
    this.isFullscreen = true;

    this.placeholderEl = document.createElement('div');
    this.placeholderEl.className = 'kg-placeholder';
    this.placeholderEl.style.height = `${this.graphContainer.clientHeight || 256}px`;
    this.appendChild(this.placeholderEl);

    this.blurEl = document.createElement('div');
    this.blurEl.className = 'slsg-background-blur kg-backdrop';
    this.blurEl.addEventListener('click', () => this.disableFullscreen());
    this.appendChild(this.blurEl);

    this.graphContainer.classList.add('slsg-is-fullscreen');
    document.body.dataset['graphBlur'] = 'true';
    this.fsHudEl.hidden = false;
    this.fsDockEl.hidden = false;
    this.syncControls();

    requestAnimationFrame(() => {
      this.syncCanvasSize();
      this.fitToBounds(true);
    });
  }

  public disableFullscreen() {
    if (!this.isFullscreen) return;
    this.isFullscreen = false;

    this.graphContainer.classList.remove('slsg-is-fullscreen');
    document.body.dataset['graphBlur'] = '';
    this.fsHudEl.hidden = true;
    this.fsDockEl.hidden = true;
    this.blurEl?.remove();
    this.blurEl = null;
    this.placeholderEl?.remove();
    this.placeholderEl = null;

    const input = this.fsHudEl.querySelector<HTMLInputElement>('.kg-fs-search');
    if (input) input.value = '';
    this.searchQuery = '';
    this.searchMatches.clear();

    this.syncControls();
    requestAnimationFrame(() => {
      this.syncCanvasSize();
      this.fitToBounds(true);
    });
  }

  private toggleSettingsPopup() {
    const existing = this.querySelector('.slsg-popup-menu');
    if (existing) {
      existing.remove();
      return;
    }
    const popup = document.createElement('div');
    popup.className = 'slsg-popup-menu kg-settings-popup';
    popup.innerHTML = `
      <div class="slsg-popup-menu-content">
        <div class="kg-popup-header">
          <strong>تنظیمات گراف</strong>
          <button type="button" class="kg-popup-reset" data-reset-settings title="بازنشانی پیش‌فرض">پیش‌فرض</button>
        </div>
        <div data-extra-settings>
          <label class="kg-field-label">عمق ارتباطات
            <select data-opt="depth" aria-label="عمق ارتباطات">
              <option value="0">فقط این یادداشت</option>
              <option value="1">همسایه‌ها (۱ گام)</option>
              <option value="2">دو مرحله (۲ گام)</option>
              <option value="3">سه مرحله</option>
              <option value="4">چهار مرحله</option>
              <option value="5">همه یادداشت‌ها (سراسری)</option>
            </select>
          </label>
          <label class="kg-field-label">حالت چیدمان
            <select data-opt="layout" aria-label="حالت چیدمان">
              <option value="force">شبکه‌ای نیرویی (ارگانیک)</option>
              <option value="dag">درختی پیش‌نیاز و استنتاج (DAG)</option>
            </select>
          </label>
          <label class="kg-field-label">صفحهٔ معنایی پیوندها
            <select data-opt="plane" aria-label="صفحهٔ معنایی پیوندها">
              <option value="">همهٔ پیوندها</option>
              <option value="deduction">استنتاج و برهان</option>
              <option value="structure">ساختار و سلسله‌مراتب</option>
              <option value="problem_solving">حل مسئله و آزمون</option>
              <option value="pedagogy">پیش‌نیاز و آموزش</option>
              <option value="enrichment">شبیه‌ساز و مکمل</option>
            </select>
          </label>
          <label class="kg-toggle-row">
            <input type="checkbox" data-opt="typedOnly" ${this.config.typedOnly ? 'checked' : ''} ${this.typedLinkCount === 0 ? 'disabled' : ''} />
            <span>فقط روابط صوری UMKO</span>
          </label>
          <label class="kg-toggle-row">
            <input type="checkbox" data-opt="arrows" ${this.config.renderArrows ? 'checked' : ''} />
            <span>جهت پیوندها</span>
          </label>
          <label class="kg-toggle-row">
            <input type="checkbox" data-opt="labels" ${this.config.renderLabels ? 'checked' : ''} />
            <span>برچسب‌های هوشمند</span>
          </label>
        </div>
        <div class="slsg-value-slider">
          <div class="kg-slider-top">
            <span class="slsg-value-slider-label">نیروی دافعه</span>
            <output data-out="repel">${toPersianDigits(this.config.repelForce)}</output>
          </div>
          <input type="range" data-slider="repelForce" min="40" max="400" step="10" value="${this.config.repelForce}" aria-label="نیروی دافعه" />
        </div>
        <div class="slsg-value-slider">
          <div class="kg-slider-top">
            <span class="slsg-value-slider-label">فاصلهٔ نودها</span>
            <output data-out="collider">${toPersianDigits(this.config.colliderPadding)}</output>
          </div>
          <input type="range" data-slider="colliderPadding" min="4" max="50" step="2" value="${this.config.colliderPadding}" aria-label="فاصلهٔ نودها" />
        </div>
        <div class="slsg-value-slider">
          <div class="kg-slider-top">
            <span class="slsg-value-slider-label">طول پیوندها</span>
            <output data-out="link">${toPersianDigits(this.config.linkDistance)}</output>
          </div>
          <input type="range" data-slider="linkDistance" min="40" max="220" step="5" value="${this.config.linkDistance}" aria-label="طول پیوندها" />
        </div>
        <div class="slsg-value-slider">
          <div class="kg-slider-top">
            <span class="slsg-value-slider-label">نیروی مرکز</span>
            <output data-out="center">${toPersianDigits(this.config.centerForce.toFixed(2))}</output>
          </div>
          <input type="range" data-slider="centerForce" min="0.02" max="0.4" step="0.02" value="${this.config.centerForce}" aria-label="نیروی مرکز" />
        </div>
      </div>
    `;

    const depthSel = popup.querySelector<HTMLSelectElement>('[data-opt="depth"]')!;
    depthSel.value = String(this.config.depth);
    depthSel.addEventListener('change', () => {
      this.config.depth = Number(depthSel.value);
      this.full_refresh();
    });

    const layoutSel = popup.querySelector<HTMLSelectElement>('[data-opt="layout"]')!;
    layoutSel.value = this.config.layoutMode;
    layoutSel.addEventListener('change', () => {
      this.setLayoutMode(layoutSel.value as LayoutMode);
    });

    const planeSel = popup.querySelector<HTMLSelectElement>('[data-opt="plane"]')!;
    planeSel.value = this.activePlaneFilter || '';
    planeSel.addEventListener('change', () => {
      this.setPlaneFilter((planeSel.value || null) as RelationPlaneKey | null);
    });

    const typedCheck = popup.querySelector<HTMLInputElement>('[data-opt="typedOnly"]')!;
    typedCheck.addEventListener('change', () => this.setTypedOnly(typedCheck.checked));

    const arrowsCheck = popup.querySelector<HTMLInputElement>('[data-opt="arrows"]')!;
    arrowsCheck.addEventListener('change', () => {
      this.config.renderArrows = arrowsCheck.checked;
      this.renderActionButtons();
      this.scheduleFrame();
    });

    const labelsCheck = popup.querySelector<HTMLInputElement>('[data-opt="labels"]')!;
    labelsCheck.addEventListener('change', () => {
      this.config.renderLabels = labelsCheck.checked;
      this.scheduleFrame();
    });

    const bindSlider = (key: 'repelForce' | 'colliderPadding' | 'linkDistance' | 'centerForce', outName: string, digits = 0) => {
      const input = popup.querySelector<HTMLInputElement>(`[data-slider="${key}"]`);
      const out = popup.querySelector<HTMLOutputElement>(`[data-out="${outName}"]`);
      if (!input) return;
      input.addEventListener('input', () => {
        const val = Number(input.value);
        this.config[key] = val;
        if (out) out.textContent = toPersianDigits(digits ? val.toFixed(digits) : val);
        if (this.config.layoutMode === 'force') this.applyForces(true);
      });
    };
    bindSlider('repelForce', 'repel');
    bindSlider('colliderPadding', 'collider');
    bindSlider('linkDistance', 'link');
    bindSlider('centerForce', 'center', 2);

    popup.querySelector('[data-reset-settings]')?.addEventListener('click', () => {
      this.config.repelForce = DEFAULT_CONFIG.repelForce;
      this.config.colliderPadding = DEFAULT_CONFIG.colliderPadding;
      this.config.linkDistance = DEFAULT_CONFIG.linkDistance;
      this.config.centerForce = DEFAULT_CONFIG.centerForce;
      this.config.renderArrows = true;
      this.config.renderLabels = true;
      this.config.typedOnly = false;
      this.setPlaneFilter(null);
      this.setKindFilter(null);
      this.setLayoutMode('force');
      popup.remove();
      this.toggleSettingsPopup();
    });

    this.appendChild(popup);
  }

  private buildSubgraph(depth: number) {
    const built = buildTypedGraphData(this.sitemap, this.currentPage, depth, this.config.renderExternal);
    this.nodes = built.nodes;
    this.links = built.links;
    this.adjacency = built.adjacency;
    this.typedLinkCount = built.typedLinkCount;

    if (this.typedLinkCount === 0 && this.config.typedOnly) {
      this.config.typedOnly = false;
    }

    this.hoveredNode = null;
    this.hoveredLink = null;
    this.draggedNode = null;
    this.hoverMix = 0;
    this.layoutAnim = null;
    this.labelWidthCache.clear();
    this.updateTooltip();

    this.simulation?.stop();
    this.simulation = forceSimulation<GraphNode>(this.nodes);
    this.applyForces(false);

    if (this.config.layoutMode === 'dag') {
      this.simulation.stop();
      this.syncCanvasSize();
      this.applyDagLayout(false);
      this.syncControls();
      return;
    }

    const currentNode = this.nodes.find(n => n.isCurrent);
    if (currentNode) {
      currentNode.fx = 0;
      currentNode.fy = 0;
    }
    const warmTicks = this.nodes.length > 150 ? 65 : this.nodes.length > 40 ? 90 : 120;
    this.simulation.stop();
    for (let i = 0; i < warmTicks; i++) {
      if (i === 35 && currentNode) {
        currentNode.fx = null;
        currentNode.fy = null;
      }
      this.simulation.tick();
    }
    if (currentNode) {
      currentNode.fx = null;
      currentNode.fy = null;
    }

    this.simulation.on('tick', () => this.scheduleFrame());
    this.simulation.alpha(this.prefersReducedMotion ? 0.01 : 0.16).restart();

    this.syncCanvasSize();
    this.syncControls();
    this.fitToBounds(false);
    this.scheduleFrame();
  }

  private applyForces(restart: boolean) {
    if (!this.simulation) return;
    const n = this.nodes.length;
    const isSmall = n <= 24;
    const isMedium = n > 24 && n <= 120;

    const baseRepel = Number(this.config.repelForce) || 150;
    const baseDist = Number(this.config.linkDistance) || 120;
    const baseCollider = Number(this.config.colliderPadding) || 24;
    const baseCenter = Number(this.config.centerForce) || 0.12;

    const effectiveRepel = isSmall ? baseRepel * 2.1 : isMedium ? baseRepel * 1.45 : baseRepel * 0.95;
    const effectiveDist = isSmall ? Math.max(74, baseDist * 0.9) : isMedium ? Math.max(58, baseDist * 0.68) : Math.max(38, baseDist * 0.45);
    const effectiveCollider = isSmall ? Math.max(20, baseCollider) : isMedium ? Math.max(11, baseCollider * 0.55) : Math.max(5, baseCollider * 0.28);
    const effectiveCenter = isSmall ? Math.max(0.06, baseCenter * 0.65) : isMedium ? Math.max(0.07, baseCenter * 0.75) : Math.max(0.09, baseCenter * 0.9);

    this.simulation
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(this.links)
          .id(d => d.id)
          .distance(l => (l.isTyped ? effectiveDist * 0.92 : effectiveDist * 1.08))
          .strength(l => (l.isTyped ? (isSmall ? 0.48 : 0.38) : (isSmall ? 0.34 : 0.22)))
      )
      .force(
        'charge',
        forceManyBody<GraphNode>()
          .strength(-effectiveRepel)
          .distanceMax(isSmall ? 650 : isMedium ? 480 : 340)
          .theta(n > 120 ? 0.9 : 0.8)
      )
      .force(
        'collide',
        forceCollide<GraphNode>()
          .radius(d => d.radius + effectiveCollider)
          .strength(0.85)
          .iterations(isSmall ? 3 : 2)
      )
      .force('x', forceX<GraphNode>(0).strength(effectiveCenter))
      .force('y', forceY<GraphNode>(0).strength(effectiveCenter))
      .alphaDecay(this.config.alphaDecay || 0.028);

    if (restart) {
      this.simulation.alpha(0.55).restart();
      this.scheduleFrame();
    }
  }

  private setupInteractions() {
    if (!this.canvas) return;
    const canvasSel = select(this.canvas);

    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([this.config.minZoom || 0.08, this.config.maxZoom || 4.5])
      .filter(event => {
        if (event.type === 'wheel') return true;
        if (event.type === 'dblclick') return false;
        if (event.type === 'touchstart' && event.touches && event.touches.length >= 2) return true;
        if (event.type === 'mousedown' || event.type === 'pointerdown' || event.type === 'touchstart') {
          if (event.button && event.button !== 0) return false;
          const pt = this.clientPointToCanvas(event);
          if (pt && this.findNodeAtCanvas(pt[0], pt[1])) return false;
        }
        return true;
      })
      .on('start', event => {
        if (event.sourceEvent && (event.sourceEvent.type === 'mousedown' || event.sourceEvent.type === 'pointerdown')) {
          this.canvas.style.cursor = 'grabbing';
        }
      })
      .on('zoom', event => {
        this.transform = event.transform;
        this.simulator.userZoomed = true;
        this.simulator.zoomTransform = event.transform;
        this.simulator.transform = event.transform;
        this.updateTooltip();
        this.scheduleFrame();
      })
      .on('end', () => {
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
      });

    let dragStartX = 0;
    let dragStartY = 0;
    let didDrag = false;

    this.dragBehavior = drag<HTMLCanvasElement, unknown>()
      .subject(event => this.findNodeAtCanvas(event.x, event.y) || undefined)
      .on('start', event => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        this.draggedNode = node;
        this.hoveredNode = node;
        this.hoveredLink = null;
        this.layoutAnim = null;
        dragStartX = event.x;
        dragStartY = event.y;
        didDrag = false;
        node.fx = node.x;
        node.fy = node.y;
        this.tooltipEl.hidden = true;
        this.canvas.style.cursor = 'grabbing';
        if (this.config.layoutMode === 'force' && !event.active && this.simulation) {
          this.simulation.alphaTarget(0.28).restart();
        }
        this.scheduleFrame();
      })
      .on('drag', event => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        if (Math.hypot(event.x - dragStartX, event.y - dragStartY) > 4) didDrag = true;
        const [wx, wy] = this.transform.invert([event.x, event.y]);
        node.fx = wx;
        node.fy = wy;
        node.x = wx;
        node.y = wy;
        this.scheduleFrame();
      })
      .on('end', event => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        if (this.config.layoutMode === 'force') {
          if (!event.active && this.simulation) this.simulation.alphaTarget(0);
          node.fx = null;
          node.fy = null;
        }
        this.draggedNode = null;
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';

        if (!didDrag) {
          const src = event.sourceEvent as MouseEvent | undefined;
          if (node.isCurrent) {
            this.focusNode(node);
          } else if (src && (src.metaKey || src.ctrlKey)) {
            window.open('/' + node.id, '_blank', 'noopener');
          } else {
            window.location.href = '/' + node.id;
          }
        } else {
          this.updateTooltip();
        }
        this.scheduleFrame();
      });

    canvasSel.call(this.dragBehavior as any);
    canvasSel.call(this.zoomBehavior);
    this.canvas.style.cursor = 'grab';

    // Hover tracking: node priority first, then semantic edge hit-testing
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.draggedNode || e.buttons !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.pointerScreenX = mx;
      this.pointerScreenY = my;

      const hitNode = this.findNodeAtCanvas(mx, my);
      if (hitNode) {
        const changed = hitNode !== this.hoveredNode || this.hoveredLink !== null;
        this.hoveredNode = hitNode;
        this.hoveredLink = null;
        this.canvas.style.cursor = 'pointer';
        this.updateTooltip();
        if (changed) this.scheduleFrame();
        return;
      }

      const hitLink = this.findLinkAtCanvas(mx, my);
      const changed = this.hoveredNode !== null || hitLink !== this.hoveredLink;
      this.hoveredNode = null;
      this.hoveredLink = hitLink;
      this.canvas.style.cursor = hitLink ? 'help' : 'grab';
      this.updateTooltip();
      if (changed) this.scheduleFrame();
    });

    this.canvas.addEventListener('pointerleave', () => {
      if (this.draggedNode) return;
      if (this.hoveredNode || this.hoveredLink) {
        this.hoveredNode = null;
        this.hoveredLink = null;
        this.canvas.style.cursor = 'grab';
        this.updateTooltip();
        this.scheduleFrame();
      }
    });

    this.canvas.addEventListener('dblclick', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const hit = this.findNodeAtCanvas(e.clientX - rect.left, e.clientY - rect.top);
      if (!hit) this.fitToBounds(true);
    });
  }

  private setupObservers() {
    if (typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => this.scheduleFrame());
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const w = this.graphContainer.clientWidth;
        const h = this.graphContainer.clientHeight;
        if (!w || !h) return;
        const sizeChanged = Math.abs(w - this.lastViewportW) > 4 || Math.abs(h - this.lastViewportH) > 4;
        this.syncCanvasSize();
        if (sizeChanged && !this.simulator.userZoomed) this.fitToBounds(false);
        else this.scheduleFrame();
      });
      this.resizeObserver.observe(this.graphContainer);
    }

    this.boundKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const popup = this.querySelector('.slsg-popup-menu');
      if (popup) {
        e.preventDefault();
        popup.remove();
        this.actionContainer.querySelector<HTMLButtonElement>('[data-graph-action="settings"]')?.focus();
        return;
      }
      if (this.isFullscreen) {
        e.preventDefault();
        this.disableFullscreen();
        this.actionContainer.querySelector<HTMLButtonElement>('[data-graph-action="fullscreen"]')?.focus();
      }
    };
    document.addEventListener('keydown', this.boundKeydown);

    this.boundOutsideClick = (e: MouseEvent) => {
      const popup = this.querySelector('.slsg-popup-menu');
      if (!popup) return;
      const target = e.target as Node;
      if (!popup.contains(target) && !this.actionContainer.contains(target)) {
        popup.remove();
      }
    };
    document.addEventListener('mousedown', this.boundOutsideClick);
  }

  private clientPointToCanvas(event: any): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect();
    let cx: number | undefined;
    let cy: number | undefined;
    if (event.touches && event.touches.length) {
      cx = event.touches[0].clientX;
      cy = event.touches[0].clientY;
    } else if (typeof event.clientX === 'number') {
      cx = event.clientX;
      cy = event.clientY;
    }
    if (cx === undefined || cy === undefined) return null;
    return [cx - rect.left, cy - rect.top];
  }

  private findNodeAtCanvas(mx: number, my: number): GraphNode | null {
    const [wx, wy] = this.transform.invert([mx, my]);
    const k = Math.max(0.15, this.transform.k);
    const slop = Math.max(7, 11 / k);
    let best: GraphNode | null = null;
    let bestDistSq = Infinity;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      const hitR = n.radius + slop;
      const d2 = dx * dx + dy * dy;
      if (d2 <= hitR * hitR && d2 < bestDistSq) {
        best = n;
        bestDistSq = d2;
      }
    }
    return best;
  }

  private findLinkAtCanvas(mx: number, my: number): GraphLink | null {
    const k = this.transform.k;
    const tx = this.transform.x;
    const ty = this.transform.y;
    const thresholdSq = 7.5 * 7.5;
    let best: GraphLink | null = null;
    let bestDistSq = thresholdSq;

    const visibleLinks = this.getVisibleLinks();
    for (const l of visibleLinks) {
      if (this.activePlaneFilter && l.plane !== this.activePlaneFilter) continue;
      const g = getEdgeGeometry(l, this.config.layoutMode);
      if (!g) continue;

      const sSx = g.sx * k + tx;
      const sSy = g.sy * k + ty;
      const eSx = g.ex * k + tx;
      const eSy = g.ey * k + ty;

      // Quick AABB reject
      const cSx = g.cx * k + tx;
      const cSy = g.cy * k + ty;
      const minX = Math.min(sSx, eSx, cSx) - 10;
      const maxX = Math.max(sSx, eSx, cSx) + 10;
      const minY = Math.min(sSy, eSy, cSy) - 10;
      const maxY = Math.max(sSy, eSy, cSy) + 10;
      if (mx < minX || mx > maxX || my < minY || my > maxY) continue;

      let d2 = Infinity;
      if (!g.curved) {
        d2 = pointToSegmentDistSq(mx, my, sSx, sSy, eSx, eSy);
      } else {
        // Sample 6 segments along quadratic Bezier curve
        let prevX = sSx;
        let prevY = sSy;
        for (let step = 1; step <= 6; step++) {
          const u = step / 6;
          const inv = 1 - u;
          const px = inv * inv * sSx + 2 * inv * u * cSx + u * u * eSx;
          const py = inv * inv * sSy + 2 * inv * u * cSy + u * u * eSy;
          const segD2 = pointToSegmentDistSq(mx, my, prevX, prevY, px, py);
          if (segD2 < d2) d2 = segD2;
          prevX = px;
          prevY = py;
        }
      }

      // Slightly prefer typed edges when overlapping
      const weighted = l.isTyped ? d2 * 0.75 : d2;
      if (weighted < bestDistSq) {
        bestDistSq = weighted;
        best = l;
      }
    }
    return best;
  }

  private syncCanvasSize() {
    if (!this.canvas) return;
    const w = this.graphContainer.clientWidth || 300;
    const h = this.graphContainer.clientHeight || 256;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.lastViewportW = w;
    this.lastViewportH = h;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  public fitToBounds(animated = true) {
    if (!this.canvas || !this.nodes.length) return;
    const valid = this.nodes.filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!valid.length) return;
    this.fitPoints(valid, animated);
  }

  private fitPoints(points: Array<{ x: number; y: number; radius: number }>, animated: boolean) {
    if (!this.canvas || !points.length) return;
    const w = this.graphContainer.clientWidth || this.canvas.clientWidth || 300;
    const h = this.graphContainer.clientHeight || this.canvas.clientHeight || 256;
    if (!w || !h) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of points) {
      const r = n.radius + 8;
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r > maxY) maxY = n.y + r;
    }

    const padX = this.isFullscreen ? 88 : 42;
    const padTop = this.isFullscreen ? 76 : 44;
    const padBottom = this.isFullscreen ? 78 : 34;

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const availW = Math.max(60, w - padX * 2);
    const availH = Math.max(60, h - padTop - padBottom);

    const maxFitScale = points.length <= 2 ? 1.1 : this.isFullscreen ? 1.35 : 1.08;
    const k = Math.max(this.config.minZoom || 0.08, Math.min(maxFitScale, availW / spanX, availH / spanY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = w / 2 - cx * k;
    const ty = padTop + availH / 2 - cy * k;

    this.applyTransform(new ZoomTransform(k, tx, ty), animated);
  }

  private applyTransform(target: ZoomTransform, animated: boolean) {
    this.simulator.zoomTransform = target;
    this.simulator.transform = target;

    if (!this.zoomBehavior || !this.canvas) {
      this.transform = target;
      this.scheduleFrame();
      return;
    }

    const sel = select(this.canvas);
    if (animated && !this.prefersReducedMotion && typeof (sel as any).transition === 'function') {
      (sel as any).transition().duration(280).call(this.zoomBehavior.transform, target);
    } else {
      sel.call(this.zoomBehavior.transform, target);
    }
    this.transform = target;
    this.scheduleFrame();
  }

  private findDirectRelationWithCurrent(node: GraphNode): string | null {
    if (node.isCurrent) return null;
    for (const l of this.links) {
      if (!l.isTyped) continue;
      if (l.source.id === this.currentPage && l.target.id === node.id) {
        const meta = classifyRelation(l.primaryRel);
        return `${meta.icon} ${meta.forward}`;
      }
      if (l.target.id === this.currentPage && l.source.id === node.id) {
        const meta = classifyRelation(l.primaryRel);
        return `${meta.icon} ${meta.reverse}`;
      }
    }
    return null;
  }

  private updateTooltip() {
    if (!this.tooltipEl) return;
    if (this.draggedNode) {
      this.tooltipEl.hidden = true;
      return;
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const w = this.graphContainer.clientWidth || 300;
    const h = this.graphContainer.clientHeight || 256;

    // 1. Node hover tooltip
    if (this.hoveredNode) {
      const n = this.hoveredNode;
      const dotColor = isDark ? n.darkColor : n.lightColor;
      const connText = n.degree === 0 ? 'بدون پیوند' : `${toPersianDigits(n.degree)} ارتباط`;
      const relWithCurrent = this.findDirectRelationWithCurrent(n);
      const relHtml = relWithCurrent
        ? `<div class="kg-tooltip-rel">${this.escapeHtml(relWithCurrent)}</div>`
        : '';
      const sloganHtml =
        this.isFullscreen && n.slogan
          ? `<div class="kg-tooltip-slogan">${this.escapeHtml(truncateLabel(n.slogan, 95))}</div>`
          : '';

      this.tooltipEl.innerHTML = `
        <div class="kg-tooltip-top">
          <span class="kg-tooltip-kind" style="--kind-c:${dotColor}"><span class="kg-dot"></span>${this.escapeHtml(n.kindLabel)}</span>
          <span class="kg-tooltip-meta">${connText}</span>
        </div>
        <div class="kg-tooltip-title">${this.escapeHtml(n.title)}</div>
        ${relHtml}
        ${sloganHtml}
      `;
      this.tooltipEl.hidden = false;

      const sx = n.x * this.transform.k + this.transform.x;
      const sy = n.y * this.transform.k + this.transform.y;
      this.positionTooltip(sx, sy, n.radius * this.transform.k + 12, w, h);
      return;
    }

    // 2. Semantic Edge hover tooltip
    if (this.hoveredLink) {
      const l = this.hoveredLink;
      const planeInfo = UMKO_RELATION_PLANES[l.plane];
      const accent = isDark ? l.darkColor : l.lightColor;
      const relBadges = l.relations
        .map(rk => {
          const m = classifyRelation(rk);
          return `<span class="kg-edge-pill" style="--edge-c:${isDark ? m.dark : m.light}">${m.icon} ${this.escapeHtml(m.forward)}</span>`;
        })
        .join('');

      this.tooltipEl.innerHTML = `
        <div class="kg-tooltip-top">
          <span class="kg-tooltip-kind" style="--kind-c:${accent}">
            <span class="kg-line-sample kg-line-${l.dash}"></span>
            ${this.escapeHtml(planeInfo.label)}
          </span>
        </div>
        <div class="kg-edge-pills">${relBadges}</div>
        <div class="kg-edge-endpoints">
          <span>${this.escapeHtml(truncateLabel(l.source.title, 26))}</span>
          <span class="kg-edge-arrow" aria-hidden="true">${l.bidirectional ? '↔' : '←'}</span>
          <span>${this.escapeHtml(truncateLabel(l.target.title, 26))}</span>
        </div>
      `;
      this.tooltipEl.hidden = false;
      this.positionTooltip(this.pointerScreenX, this.pointerScreenY, 14, w, h);
      return;
    }

    this.tooltipEl.hidden = true;
  }

  private positionTooltip(anchorX: number, anchorY: number, offset: number, w: number, h: number) {
    const tipW = this.tooltipEl.offsetWidth || 220;
    const tipH = this.tooltipEl.offsetHeight || 64;
    const margin = 10;

    let left = anchorX - tipW / 2;
    if (left < margin) left = margin;
    if (left + tipW > w - margin) left = Math.max(margin, w - tipW - margin);

    let top = anchorY - offset - tipH;
    const topSafe = this.isFullscreen ? 58 : 44;
    if (top < topSafe) top = anchorY + offset;
    if (top + tipH > h - margin) top = Math.max(margin, h - tipH - margin);

    this.tooltipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private scheduleFrame() {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    this.rafId = 0;
    this.running = false;
    const needsMore = this.draw();
    if (needsMore) this.scheduleFrame();
  }

  private measureShortLabel(ctx: CanvasRenderingContext2D, text: string, font: string): number {
    const key = `${font}|${text}`;
    let cached = this.labelWidthCache.get(key);
    if (cached === undefined) {
      ctx.font = font;
      cached = ctx.measureText(text).width;
      this.labelWidthCache.set(key, cached);
    }
    return cached;
  }

  private draw(): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return false;

    let needsMoreFrames = false;

    // Advance Force <-> DAG smooth position transition if active
    if (this.layoutAnim) {
      const elapsed = performance.now() - this.layoutAnim.startTime;
      const rawT = Math.min(1, elapsed / this.layoutAnim.duration);
      const ease = 1 - Math.pow(1 - rawT, 3); // cubic ease-out
      for (const n of this.nodes) {
        const a = this.layoutAnim.from.get(n.id);
        const b = this.layoutAnim.to.get(n.id);
        if (a && b) {
          n.x = a.x + (b.x - a.x) * ease;
          n.y = a.y + (b.y - a.y) * ease;
        }
      }
      if (rawT < 1) needsMoreFrames = true;
      else this.layoutAnim = null;
    }

    const w = this.graphContainer.clientWidth || 300;
    const h = this.graphContainer.clientHeight || 256;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const k = this.transform.k;
    const tx = this.transform.x;
    const ty = this.transform.y;

    const visibleLinks = this.getVisibleLinks();
    const hasFilter = !!(
      this.hoveredNode ||
      this.hoveredLink ||
      this.activeKindFilter ||
      this.activePlaneFilter ||
      this.searchQuery
    );
    const targetHoverMix = hasFilter ? 1 : 0;
    const lerpSpeed = this.prefersReducedMotion ? 1 : 0.24;

    if (Math.abs(this.hoverMix - targetHoverMix) > 0.005) {
      this.hoverMix += (targetHoverMix - this.hoverMix) * lerpSpeed;
      needsMoreFrames = true;
    } else {
      this.hoverMix = targetHoverMix;
    }

    // Build highlighted node set based on active focus/filter
    const highlightedNodes = new Set<string>();
    const highlightedLinks = new Set<GraphLink>();

    if (this.hoveredNode) {
      highlightedNodes.add(this.hoveredNode.id);
      for (const l of visibleLinks) {
        if (l.source === this.hoveredNode || l.target === this.hoveredNode) {
          highlightedLinks.add(l);
          highlightedNodes.add(l.source.id);
          highlightedNodes.add(l.target.id);
        }
      }
    } else if (this.hoveredLink) {
      highlightedLinks.add(this.hoveredLink);
      highlightedNodes.add(this.hoveredLink.source.id);
      highlightedNodes.add(this.hoveredLink.target.id);
    } else if (this.activePlaneFilter) {
      for (const l of visibleLinks) {
        if (l.plane === this.activePlaneFilter) {
          highlightedLinks.add(l);
          highlightedNodes.add(l.source.id);
          highlightedNodes.add(l.target.id);
        }
      }
    } else if (this.searchQuery) {
      for (const id of this.searchMatches) highlightedNodes.add(id);
    } else if (this.activeKindFilter) {
      for (const n of this.nodes) {
        if (n.kind === this.activeKindFilter) highlightedNodes.add(n.id);
      }
    }

    // When typedOnly is enabled, subtly track nodes connected by at least one typed edge
    const typedConnectedNodes = new Set<string>();
    if (this.config.typedOnly) {
      typedConnectedNodes.add(this.currentPage);
      for (const l of visibleLinks) {
        typedConnectedNodes.add(l.source.id);
        typedConnectedNodes.add(l.target.id);
      }
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Subtle dot-grid canvas backdrop
    const gridSpacing = Math.max(18, Math.min(36, 26 * Math.sqrt(Math.max(0.35, Math.min(2, k)))));
    const ox = ((tx % gridSpacing) + gridSpacing) % gridSpacing;
    const oy = ((ty % gridSpacing) + gridSpacing) % gridSpacing;
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.055)';
    for (let gx = ox; gx < w; gx += gridSpacing) {
      for (let gy = oy; gy < h; gy += gridSpacing) {
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }

    // World-space pass for typed links & nodes
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const surfaceBg = isDark ? '#1b1b1e' : '#ffffff';
    const showArrows = !!this.config.renderArrows && (k >= 0.42 || this.nodes.length <= 40);
    const invK = 1 / Math.max(0.25, k);
    const edgeLabelsToDraw: Array<{ link: GraphLink; mx: number; my: number; color: string }> = [];

    const drawLinkPass = (highlightPass: boolean) => {
      for (const link of visibleLinks) {
        const isHighlighted =
          highlightedLinks.has(link) ||
          (!this.hoveredNode &&
            !this.hoveredLink &&
            !this.activePlaneFilter &&
            hasFilter &&
            highlightedNodes.has(link.source.id) &&
            highlightedNodes.has(link.target.id));

        if (highlightPass !== isHighlighted) continue;

        const g = getEdgeGeometry(link, this.config.layoutMode);
        if (!g) continue;

        const baseHex = isDark ? link.darkColor : link.lightColor;

        // Visual hierarchy: typed UMKO relations shine clearly, plain contextual links stay whisper-quiet
        let alpha: number;
        let lineW: number;
        if (highlightPass) {
          alpha = link.isTyped ? 0.52 + 0.46 * this.hoverMix : 0.35 + 0.42 * this.hoverMix;
          lineW = Math.min(2.6, Math.max(1.25, (link.isTyped ? 1.85 : 1.35) * invK));
        } else {
          const restAlpha = link.isTyped
            ? this.nodes.length > 120
              ? 0.34
              : 0.56
            : this.nodes.length > 120
            ? 0.12
            : this.typedLinkCount > 0
            ? 0.2
            : 0.28;
          alpha = Math.max(0.04, restAlpha * (1 - 0.82 * this.hoverMix));
          lineW = Math.min(1.8, Math.max(0.65, (link.isTyped ? 1.3 : 0.9) * invK));
        }

        // Line dash pattern (Orthogonal channel: solid=deduction/structure/problem, dashed=pedagogy/pitfall/refutes, dotted=enrichment)
        if (link.dash === 'dashed') {
          ctx.setLineDash([5.5 * Math.sqrt(invK), 3.6 * Math.sqrt(invK)]);
        } else if (link.dash === 'dotted') {
          ctx.setLineDash([2.1 * Math.sqrt(invK), 3.2 * Math.sqrt(invK)]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(g.sx, g.sy);
        if (g.curved) {
          ctx.quadraticCurveTo(g.cx, g.cy, g.ex, g.ey);
        } else {
          ctx.lineTo(g.ex, g.ey);
        }
        ctx.strokeStyle = rgba(baseHex, alpha);
        ctx.lineWidth = lineW;
        ctx.stroke();
        ctx.setLineDash([]);

        // Crisp directional arrowhead aligned to true curve tangent
        if (showArrows && (highlightPass || link.isTyped || this.nodes.length <= 100 || k > 0.9)) {
          const headLen = Math.min(8, Math.max(4.4, (highlightPass ? 7.2 : link.isTyped ? 5.8 : 4.8) * Math.sqrt(invK)));
          const drawHead = (tipX: number, tipY: number, ang: number) => {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - headLen * Math.cos(ang - 0.44), tipY - headLen * Math.sin(ang - 0.44));
            ctx.lineTo(tipX - headLen * Math.cos(ang + 0.44), tipY - headLen * Math.sin(ang + 0.44));
            ctx.closePath();
            ctx.fillStyle = rgba(baseHex, Math.min(1, alpha + 0.1));
            ctx.fill();
          };
          drawHead(g.ex, g.ey, g.endAngle);
          if (link.bidirectional && highlightPass) {
            drawHead(g.sx, g.sy, g.startAngle);
          }
        }

        // Collect typed edge midpoint labels when hovering a node (progressive disclosure!)
        if (highlightPass && this.hoveredNode && link.isTyped) {
          edgeLabelsToDraw.push({
            link,
            mx: g.midX * k + tx,
            my: g.midY * k + ty,
            color: baseHex,
          });
        }
      }
    };

    drawLinkPass(false);
    if (this.hoverMix > 0.01) drawLinkPass(true);

    // Draw nodes (dimmed first, active/current/hovered on top)
    const drawNode = (n: GraphNode) => {
      const isHovered = n === this.hoveredNode;
      const isEdgeEndpoint = !!this.hoveredLink && (this.hoveredLink.source === n || this.hoveredLink.target === n);
      const isActive =
        (!hasFilter || highlightedNodes.has(n.id)) && (!this.config.typedOnly || typedConnectedNodes.has(n.id));
      const targetScale = isHovered ? 1.24 : isEdgeEndpoint ? 1.15 : 1;
      if (Math.abs(n.hoverScale - targetScale) > 0.005) {
        n.hoverScale += (targetScale - n.hoverScale) * lerpSpeed;
        needsMoreFrames = true;
      } else {
        n.hoverScale = targetScale;
      }

      const r = n.radius * n.hoverScale;
      const fillHex = isDark ? n.darkColor : n.lightColor;
      const nodeAlpha = isActive ? 1 : this.config.typedOnly && !typedConnectedNodes.has(n.id) ? 0.16 : 1 - 0.82 * this.hoverMix;

      if ((n.isCurrent || isHovered || isEdgeEndpoint) && nodeAlpha > 0.3) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + (isHovered ? 6 : 5), 0, Math.PI * 2);
        ctx.fillStyle = rgba(fillHex, isHovered ? 0.24 : isDark ? 0.18 : 0.14);
        ctx.fill();

        if (n.isCurrent) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.2, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(fillHex, 0.72);
          ctx.lineWidth = Math.min(2, Math.max(1.1, 1.5 * invK));
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = surfaceBg;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(fillHex, nodeAlpha);
      ctx.fill();

      if (isHovered || isEdgeEndpoint) {
        ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.lineWidth = Math.min(2.2, Math.max(1.2, 1.8 * invK));
        ctx.stroke();
      }
    };

    for (const n of this.nodes) {
      if (!n.isCurrent && n !== this.hoveredNode && (!hasFilter || !highlightedNodes.has(n.id))) drawNode(n);
    }
    for (const n of this.nodes) {
      if (hasFilter && highlightedNodes.has(n.id) && !n.isCurrent && n !== this.hoveredNode) drawNode(n);
    }
    const currentNode = this.nodes.find(n => n.isCurrent);
    if (currentNode && currentNode !== this.hoveredNode) drawNode(currentNode);
    if (this.hoveredNode) drawNode(this.hoveredNode);

    ctx.restore(); // Exit world transform -> crisp screen-space labels!

    // Screen-space collision-protected labels (nodes + hovered semantic edge pills)
    const placed: Rect[] = [{ x1: 0, y1: 0, x2: 186, y2: 46 }];
    if (this.isFullscreen) {
      placed.push({ x1: Math.max(0, w - 580), y1: 0, x2: w, y2: 56 });
      placed.push({ x1: 0, y1: Math.max(0, h - 56), x2: w, y2: h });
    }

    if (this.config.renderLabels) {
      const fontSize = this.isFullscreen ? 12 : 11;
      const regularFont = `500 ${fontSize}px Vazirmatn, system-ui, sans-serif`;
      const boldFont = `600 ${fontSize}px Vazirmatn, system-ui, sans-serif`;
      const labelHeight = fontSize + 5;

      const nCount = this.nodes.length;
      const minZoomForAll =
        this.config.layoutMode === 'dag'
          ? 0.45
          : nCount <= 14
          ? 0.42
          : nCount <= 35
          ? 0.68
          : nCount <= 100
          ? 0.92
          : this.isFullscreen
          ? 0.95
          : 1.15;

      const candidates: Array<{ node: GraphNode; priority: number }> = [];
      for (const n of this.nodes) {
        if (n === this.hoveredNode && !this.draggedNode) {
          n.labelAlpha = 0;
          continue;
        }
        if (this.config.typedOnly && !typedConnectedNodes.has(n.id)) {
          n.labelAlpha = 0;
          continue;
        }
        const sx = n.x * k + tx;
        const sy = n.y * k + ty;
        if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) {
          n.labelAlpha = 0;
          continue;
        }

        let priority = -1;
        if (n.isCurrent) {
          priority = 1000;
        } else if ((this.hoveredNode || this.hoveredLink) && highlightedNodes.has(n.id)) {
          priority = 800 + n.degree;
        } else if ((this.searchQuery || this.activeKindFilter || this.activePlaneFilter) && highlightedNodes.has(n.id)) {
          priority = 700 + n.degree;
        } else if (!hasFilter) {
          if (k >= minZoomForAll) {
            priority = 100 + n.degree + (n.kind === 'collection' ? 40 : 0);
          } else if (this.isFullscreen && n.degree >= 10) {
            priority = 50 + n.degree;
          }
        }

        if (priority >= 0) {
          candidates.push({ node: n, priority });
        } else if (n.labelAlpha > 0.02) {
          n.labelAlpha *= 1 - lerpSpeed;
          needsMoreFrames = true;
        } else {
          n.labelAlpha = 0;
        }
      }

      candidates.sort((a, b) => b.priority - a.priority);

      const textColor = isDark ? '#f4f4f5' : '#0f172a';
      const mutedTextColor = isDark ? '#cbd5e1' : '#334155';
      const haloColor = isDark ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.92)';

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      const maxLabels = this.isFullscreen ? 44 : 12;
      let drawnCount = 0;

      for (const { node: n, priority } of candidates) {
        const sx = n.x * k + tx;
        const sy = n.y * k + ty;
        const text = this.isFullscreen ? n.fullShortTitle : n.shortTitle;
        const font = n.isCurrent ? boldFont : regularFont;
        const textW = this.measureShortLabel(ctx, text, font);
        const halfW = textW / 2 + 11;
        const rScreen = n.radius * n.hoverScale * k;
        const gap = n.isCurrent ? 7 : 5;

        const belowY = sy + rScreen + labelHeight / 2 + gap;
        const aboveY = sy - rScreen - labelHeight / 2 - gap;
        const tryPositions = [belowY, aboveY];
        let chosenY: number | null = null;
        let chosenRect: Rect | null = null;

        if (drawnCount < maxLabels || n.isCurrent) {
          for (const cy of tryPositions) {
            const rect: Rect = {
              x1: sx - halfW,
              y1: cy - labelHeight / 2 - 4,
              x2: sx + halfW,
              y2: cy + labelHeight / 2 + 4,
            };
            if (rect.x1 < 6 || rect.x2 > w - 6 || rect.y1 < 6 || rect.y2 > h - 6) continue;

            let collides = false;
            for (const p of placed) {
              if (rectsOverlap(rect, p)) {
                collides = true;
                break;
              }
            }
            if (!collides && nCount <= 60) {
              for (const other of this.nodes) {
                if (other === n) continue;
                const ox2 = other.x * k + tx;
                const oy2 = other.y * k + ty;
                const or2 = other.radius * k + 2;
                if (ox2 + or2 > rect.x1 && ox2 - or2 < rect.x2 && oy2 + or2 > rect.y1 && oy2 - or2 < rect.y2) {
                  collides = true;
                  break;
                }
              }
            }
            if (!collides) {
              chosenY = cy;
              chosenRect = rect;
              break;
            }
          }
        }

        const targetAlpha = chosenY !== null ? (priority >= 700 ? 1 : 0.88) : 0;
        if (Math.abs(n.labelAlpha - targetAlpha) > 0.015) {
          n.labelAlpha += (targetAlpha - n.labelAlpha) * lerpSpeed;
          needsMoreFrames = true;
        } else {
          n.labelAlpha = targetAlpha;
        }

        if (chosenY !== null && chosenRect && n.labelAlpha > 0.04) {
          placed.push(chosenRect);
          drawnCount++;

          ctx.save();
          ctx.globalAlpha = n.labelAlpha;
          ctx.font = font;
          if (n.isCurrent) {
            const pillX = sx - textW / 2 - 6;
            const pillY = chosenY - labelHeight / 2;
            const pillW = textW + 12;
            ctx.fillStyle = isDark ? 'rgba(32, 32, 36, 0.92)' : 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = rgba(isDark ? n.darkColor : n.lightColor, 0.48);
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(pillX, pillY, pillW, labelHeight, 5);
            else ctx.rect(pillX, pillY, pillW, labelHeight);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = textColor;
            ctx.fillText(text, sx, chosenY + 0.5);
          } else {
            ctx.strokeStyle = haloColor;
            ctx.lineWidth = 3.6;
            ctx.strokeText(text, sx, chosenY);
            ctx.fillStyle = priority >= 700 ? textColor : mutedTextColor;
            ctx.fillText(text, sx, chosenY);
          }
          ctx.restore();
        }
      }

      // Draw crisp progressive-disclosure semantic pills on typed edges connected to hoveredNode
      if (edgeLabelsToDraw.length > 0 && this.hoverMix > 0.2) {
        const edgeFont = '500 10px Vazirmatn, system-ui, sans-serif';
        const pillH = 17;
        ctx.font = edgeFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let edgePillsDrawn = 0;
        const maxEdgePills = this.isFullscreen ? 12 : 4;
        for (const item of edgeLabelsToDraw) {
          if (edgePillsDrawn >= maxEdgePills) break;
          const tw = this.measureShortLabel(ctx, item.link.shortLabel, edgeFont);
          const pw = tw + 12;
          const rect: Rect = {
            x1: item.mx - pw / 2 - 3,
            y1: item.my - pillH / 2 - 2,
            x2: item.mx + pw / 2 + 3,
            y2: item.my + pillH / 2 + 2,
          };
          if (rect.x1 < 6 || rect.x2 > w - 6 || rect.y1 < 6 || rect.y2 > h - 6) continue;
          let collides = false;
          for (const p of placed) {
            if (rectsOverlap(rect, p)) {
              collides = true;
              break;
            }
          }
          if (collides) continue;

          placed.push(rect);
          edgePillsDrawn++;

          ctx.save();
          ctx.globalAlpha = Math.min(0.96, this.hoverMix);
          ctx.fillStyle = isDark ? 'rgba(24, 24, 28, 0.92)' : 'rgba(255, 255, 255, 0.94)';
          ctx.strokeStyle = rgba(item.color, 0.55);
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(item.mx - pw / 2, item.my - pillH / 2, pw, pillH, 999);
          } else {
            ctx.rect(item.mx - pw / 2, item.my - pillH / 2, pw, pillH);
          }
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = item.color;
          ctx.fillText(item.link.shortLabel, item.mx, item.my + 0.5);
          ctx.restore();
        }
      }
    }

    ctx.restore();
    return needsMoreFrames;
  }
}
