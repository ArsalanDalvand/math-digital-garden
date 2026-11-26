import { classifyRelation, normalizeKind, toPersianDigits } from './schema.ts';
import type {
  DagLaneMeta,
  DagLayoutOptions,
  DagLayoutOutput,
  GraphLink,
  GraphNode,
} from './types.ts';

const DIGIT_MAP: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

function toAsciiDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (ch) => DIGIT_MAP[ch] ?? ch);
}

/**
 * Extracts a numeric section ordering token (e.g., `۲۰.۱` -> `20.1`, `۱.۳۱` -> `1.31`,
 * `11-دستگاه` -> `11`) so untyped notes follow pedagogical chapter sequence.
 */
export function extractSectionOrder(title: string): number | null {
  if (!title) return null;
  const normalized = toAsciiDigits(title);
  const dotted = normalized.match(/(\d+)\.(\d+)/);
  if (dotted) {
    const num = Number.parseFloat(`${dotted[1]}.${dotted[2]}`);
    return Number.isFinite(num) ? num : null;
  }
  const prefixed = normalized.match(/^\s*0*(\d+)\s*[-–—:]/);
  if (prefixed) {
    const num = Number.parseInt(prefixed[1], 10);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

const PEDAGOGICAL_TIER: Record<string, number> = {
  axiom: 0,
  theory: 0,
  symbol: 0,
  concept: 1,
  property: 1,
  comparison: 1,
  assertion: 2,
  algorithm: 2,
  technique: 2,
  proof: 3,
  remark: 3,
  visual_lab: 3,
  code_kernel: 3,
  example: 4,
  counterexample: 4,
  pitfall: 4,
  problem: 5,
  hint_ladder: 5,
  problem_archetype: 5,
  solution: 6,
  collection: 2,
};

/** Maps any UMKO kind (or alias) to a monotonic foundation-to-practice tier index. */
export function getPedagogicalTier(kind: string): number {
  const clean = normalizeKind(kind) || kind.trim().toLowerCase();
  return PEDAGOGICAL_TIER[clean] ?? 2;
}

const FORWARD_RELS = new Set(['rel_generalizes', 'rel_implies']);

function laneTitleForRank(rank: number, maxRank: number, currentIsMoc: boolean): string {
  if (currentIsMoc) {
    if (rank === 0) return 'نقشهٔ راه و محور';
    if (rank === maxRank) return 'تمرین‌ها و کاربردها';
    return `بخش ${toPersianDigits(rank)}`;
  }
  if (maxRank <= 0) return 'مفهوم محوری';
  if (rank === 0) return 'مبانی و پیش‌نیازها';
  if (rank === maxRank && maxRank >= 2) return 'نتایج، مثال‌ها و تمرین‌ها';
  if (maxRank >= 3 && rank === maxRank - 1) return 'قضایا و برهان‌ها';
  return `لایه ${toPersianDigits(rank + 1)}`;
}

/**
 * Builds a bounded 3-band Ego-DAG subgraph for narrow sidebar canvases (~250px):
 * keeps high-signal prerequisites above, current node + direct peers in the middle,
 * and dependents/exercises below, collapsing any tail overflow into clickable cluster nodes.
 */
export function buildSidebarEgoSubgraph(
  nodes: GraphNode[],
  links: GraphLink[],
  currentId: string,
  currentIsMoc = false,
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (nodes.length <= 10) {
    return { nodes, links };
  }

  const currentNode = nodes.find((n) => n.id === currentId || n.isCurrent);
  if (!currentNode) {
    return { nodes: nodes.slice(0, 12), links: [] };
  }

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const scoreNode = (n: GraphNode): number => {
    const tierScore = (6 - getPedagogicalTier(n.kind)) * 4;
    const hasTyped = links.some((l) => l.isTyped && (l.source.id === n.id || l.target.id === n.id));
    return Math.min(20, n.degree) + (hasTyped ? 18 : 0) + tierScore;
  };

  const makeClusterNode = (
    id: string,
    title: string,
    count: number,
    category: 'prerequisites' | 'dependents' | 'children',
    xHint: number,
    yHint: number,
  ): GraphNode => ({
    id,
    title,
    shortTitle: title,
    fullShortTitle: title,
    kind: 'collection',
    kindLabel: 'خوشه تجمیعی',
    shape: 'octagon',
    level: '',
    bookSlug: currentNode.bookSlug,
    chapterSlug: currentNode.chapterSlug,
    slogan: `برای مشاهده همهٔ ${toPersianDigits(count)} یادداشت روی نمای تمام‌صفحه کلیک کنید`,
    tags: [],
    isCurrent: false,
    degree: count,
    outCount: 0,
    inCount: 1,
    radius: 9.2,
    lightColor: '#7c3aed',
    darkColor: '#a78bfa',
    x: xHint,
    y: yHint,
    vx: 0,
    vy: 0,
    labelAlpha: 1,
    hoverScale: 1,
    isOverflowCluster: true,
    overflowCount: count,
    overflowCategory: category,
  });

  const makeClusterLink = (
    sNode: GraphNode,
    tNode: GraphNode,
    rel = 'rel_is_part_of',
  ): GraphLink => ({
    id: `${sNode.id}->${tNode.id}`,
    source: sNode,
    target: tNode,
    relations: [rel],
    primaryRel: rel,
    plane: 'structure',
    isTyped: true,
    isDag: true,
    bidirectional: false,
    curveOffset: 0,
    lightColor: '#7c3aed',
    darkColor: '#a78bfa',
    dash: 'dashed',
    shortLabel: 'گروه',
  });

  const others = nodes.filter((n) => n.id !== currentNode.id);

  if (currentIsMoc) {
    const sorted = [...others].sort((a, b) => scoreNode(b) - scoreNode(a));
    const maxKids = 6;
    const keptKids = sorted.slice(0, maxKids);
    const hiddenCount = others.length - keptKids.length;
    const keptSet = new Set([currentNode.id, ...keptKids.map((n) => n.id)]);
    const keptNodes = [currentNode, ...keptKids];
    const keptLinks = links.filter((l) => keptSet.has(l.source.id) && keptSet.has(l.target.id));

    if (hiddenCount > 0) {
      const cluster = makeClusterNode(
        '__cluster__children',
        `+${toPersianDigits(hiddenCount)} مورد دیگر ↗`,
        hiddenCount,
        'children',
        currentNode.x + 60,
        currentNode.y + 80,
      );
      keptNodes.push(cluster);
      keptLinks.push(makeClusterLink(cluster, currentNode, 'rel_is_part_of'));
    }
    return { nodes: keptNodes, links: keptLinks };
  }

  // Classify atomic neighbors into prerequisites vs dependents using edge semantics + pedagogical tier
  const prereqScore = new Map<string, number>();
  const dependentScore = new Map<string, number>();

  for (const l of links) {
    const s = l.source.id;
    const t = l.target.id;
    if (s !== currentNode.id && t !== currentNode.id) continue;
    const other = s === currentNode.id ? l.target : l.source;
    if (l.isTyped && !classifyRelation(l.primaryRel).symmetric) {
      const isForward = FORWARD_RELS.has(l.primaryRel);
      const prereqId = isForward ? s : t;
      if (prereqId === other.id) {
        prereqScore.set(other.id, (prereqScore.get(other.id) || 0) + 10);
      } else {
        dependentScore.set(other.id, (dependentScore.get(other.id) || 0) + 10);
      }
    }
  }

  const curTier = getPedagogicalTier(currentNode.kind);
  const curOrd = extractSectionOrder(currentNode.title);
  const prereqs: GraphNode[] = [];
  const dependents: GraphNode[] = [];

  for (const n of others) {
    const pS = prereqScore.get(n.id) || 0;
    const dS = dependentScore.get(n.id) || 0;
    if (pS > dS) {
      prereqs.push(n);
    } else if (dS > pS) {
      dependents.push(n);
    } else {
      const nTier = getPedagogicalTier(n.kind);
      const nOrd = extractSectionOrder(n.title);
      if (
        nTier < curTier ||
        (nTier === curTier && curOrd !== null && nOrd !== null && nOrd < curOrd)
      ) {
        prereqs.push(n);
      } else {
        dependents.push(n);
      }
    }
  }

  prereqs.sort((a, b) => scoreNode(b) - scoreNode(a));
  dependents.sort((a, b) => scoreNode(b) - scoreNode(a));

  const maxPrereqs = 5;
  const maxDeps = 6;
  const keptPrereqs = prereqs.slice(0, maxPrereqs);
  const keptDeps = dependents.slice(0, maxDeps);
  const hiddenPrereqCount = prereqs.length - keptPrereqs.length;
  const hiddenDepCount = dependents.length - keptDeps.length;

  const keptNodes: GraphNode[] = [currentNode, ...keptPrereqs, ...keptDeps];
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const keptLinks = links.filter((l) => keptIds.has(l.source.id) && keptIds.has(l.target.id));

  if (hiddenPrereqCount > 0) {
    const cluster = makeClusterNode(
      '__cluster__prereqs',
      `+${toPersianDigits(hiddenPrereqCount)} پیش‌نیاز ↗`,
      hiddenPrereqCount,
      'prerequisites',
      currentNode.x,
      currentNode.y - 80,
    );
    keptNodes.push(cluster);
    keptLinks.push(makeClusterLink(currentNode, cluster, 'rel_requires'));
  }

  if (hiddenDepCount > 0) {
    const cluster = makeClusterNode(
      '__cluster__dependents',
      `+${toPersianDigits(hiddenDepCount)} وابسته ↗`,
      hiddenDepCount,
      'dependents',
      currentNode.x,
      currentNode.y + 80,
    );
    keptNodes.push(cluster);
    keptLinks.push(makeClusterLink(cluster, currentNode, 'rel_requires'));
  }

  return { nodes: keptNodes, links: keptLinks };
}

/**
 * Computes an aspect-balanced, crossing-minimized hierarchical DAG layout.
 * Handles typed UMKO semantics, MOC roots, pedagogical Axler fallback for untyped links,
 * cycle breaking, barycenter sweeps, and vertical/horizontal RTL orientations.
 */
export function computeEnhancedDagLayout(
  nodes: GraphNode[],
  links: GraphLink[],
  options: DagLayoutOptions = {},
): DagLayoutOutput {
  const positions = new Map<string, { x: number; y: number; rank: number }>();
  const lanes: DagLaneMeta[] = [];
  if (!nodes.length) return { positions, lanes };

  const orientation = options.orientation || 'vertical';
  const viewportW = Math.max(240, options.viewportWidth || 1000);
  const viewportH = Math.max(220, options.viewportHeight || 720);
  const currentIsMoc = Boolean(options.currentIsMoc);
  const currentId = options.currentId || '';

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const typedDirectional = links.filter(
    (l) => l.isTyped && !classifyRelation(l.primaryRel).symmetric,
  );
  const activeLinks = typedDirectional.length > 0 ? links : links;

  const rawChildren = new Map<string, string[]>();
  for (const n of nodes) rawChildren.set(n.id, []);

  const addRawEdge = (parent: string, child: string) => {
    if (parent === child) return;
    const list = rawChildren.get(parent);
    if (list && !list.includes(child)) list.push(child);
  };

  for (const l of activeLinks) {
    const s = l.source.id;
    const t = l.target.id;
    if (!nodeById.has(s) || !nodeById.has(t) || s === t) continue;

    // 1. Overflow cluster nodes follow semantic slot
    if (l.target.isOverflowCluster && l.target.overflowCategory === 'prerequisites') {
      addRawEdge(t, s);
      continue;
    }
    if (l.target.isOverflowCluster && l.target.overflowCategory === 'dependents') {
      addRawEdge(s, t);
      continue;
    }
    if (l.source.isOverflowCluster) {
      addRawEdge(s, t);
      continue;
    }

    // 2. MOC roots always anchor above their child items
    if (currentIsMoc && currentId && (s === currentId || t === currentId)) {
      const other = s === currentId ? t : s;
      addRawEdge(currentId, other);
      continue;
    }

    // 3. Explicit directional typed UMKO edge
    if (l.isTyped) {
      const relMeta = classifyRelation(l.primaryRel);
      if (relMeta.symmetric) continue;
      const parent = FORWARD_RELS.has(l.primaryRel) ? s : t;
      const child = FORWARD_RELS.has(l.primaryRel) ? t : s;
      addRawEdge(parent, child);
      continue;
    }

    // 4. Untyped / plain wikilink pedagogical fallback (tier -> section order)
    const ns = nodeById.get(s)!;
    const nt = nodeById.get(t)!;
    const ts = getPedagogicalTier(ns.kind);
    const tt = getPedagogicalTier(nt.kind);
    if (ts !== tt) {
      if (ts < tt) addRawEdge(s, t);
      else addRawEdge(t, s);
      continue;
    }

    const os = extractSectionOrder(ns.title);
    const ot = extractSectionOrder(nt.title);
    if (os !== null && ot !== null && Math.abs(os - ot) > 1e-6) {
      if (os < ot) addRawEdge(s, t);
      else addRawEdge(t, s);
      continue;
    }

    // Only chain equal-tier untyped edges when no typed backbone already exists
    if (typedDirectional.length === 0) {
      addRawEdge(t, s);
    }
  }

  // Break cycles via DFS so topological ranking always terminates
  const state = new Map<string, 0 | 1 | 2>();
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
      if (st === 1) continue;
      children.get(u)?.push(v);
      parents.get(v)?.push(u);
      if (st === 0) dfs(v);
    }
    state.set(u, 2);
  };

  const inDegRaw = new Map<string, number>();
  for (const n of nodes) inDegRaw.set(n.id, 0);
  for (const list of rawChildren.values()) {
    for (const v of list) inDegRaw.set(v, (inDegRaw.get(v) || 0) + 1);
  }
  const dfsOrder = [...nodes].sort((a, b) => {
    if (currentIsMoc && a.id === currentId) return -1;
    if (currentIsMoc && b.id === currentId) return 1;
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
    const d = parents.get(n.id)?.length || 0;
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

  // Anchor MOC root strictly at rank 0 and shift any sibling roots to rank >= 1
  if (currentIsMoc && currentId && rank.has(currentId)) {
    rank.set(currentId, 0);
    for (const n of nodes) {
      if (n.id !== currentId && (rank.get(n.id) || 0) === 0) {
        rank.set(n.id, 1);
      }
    }
  }

  // Compress overly deep untyped ladders on large viewports (> 7 ranks) by pedagogical tier normalization
  let maxRankFound = 0;
  for (const r of rank.values()) {
    if (r > maxRankFound) maxRankFound = r;
  }

  const byRank = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) || 0;
    const bucket = byRank.get(r);
    if (bucket) bucket.push(n);
    else byRank.set(r, [n]);
  }

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  // Initial degree ordering within ranks
  for (const r of sortedRanks) {
    byRank.get(r)?.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.degree - a.degree;
    });
  }

  // 3-pass Barycenter crossing minimization (down -> up -> down)
  const orderIdx = new Map<string, number>();
  const refreshIndices = () => {
    for (const r of sortedRanks) {
      const layer = byRank.get(r)!;
      layer.forEach((node, idx) => orderIdx.set(node.id, (idx + 1) / (layer.length + 1)));
    }
  };
  refreshIndices();

  for (let pass = 0; pass < 3; pass++) {
    const sweepRanks = pass % 2 === 1 ? [...sortedRanks].reverse() : sortedRanks;
    const useChildren = pass % 2 === 1;
    for (const r of sweepRanks) {
      const layer = byRank.get(r)!;
      layer.sort((a, b) => {
        const nbrA = (useChildren ? children.get(a.id) : parents.get(a.id)) || [];
        const nbrB = (useChildren ? children.get(b.id) : parents.get(b.id)) || [];
        const baryA = nbrA.length
          ? nbrA.reduce((acc, id) => acc + (orderIdx.get(id) ?? 0.5), 0) / nbrA.length
          : (orderIdx.get(a.id) ?? 0.5);
        const baryB = nbrB.length
          ? nbrB.reduce((acc, id) => acc + (orderIdx.get(id) ?? 0.5), 0) / nbrB.length
          : (orderIdx.get(b.id) ?? 0.5);
        if (Math.abs(baryA - baryB) > 0.002) return baryA - baryB;
        return b.degree - a.degree;
      });
    }
    refreshIndices();
  }

  const isCompact = viewportW < 360 || viewportH < 320;
  const colGap = isCompact
    ? nodes.length <= 8
      ? 92
      : 78
    : nodes.length <= 25
      ? 148
      : nodes.length <= 85
        ? 120
        : 94;
  const rowGap = isCompact
    ? nodes.length <= 8
      ? 78
      : 66
    : maxRankFound > 5
      ? Math.max(70, Math.min(104, Math.floor((viewportH - 120) / (maxRankFound + 1))))
      : nodes.length <= 25
        ? 112
        : 92;

  const maxPerRow = isCompact
    ? 5
    : orientation === 'horizontal'
      ? Math.max(5, Math.min(10, Math.floor(viewportH / 76)))
      : Math.max(7, Math.min(15, Math.floor((viewportW - 100) / Math.max(85, colGap * 0.85))));

  let visualBand = 0;
  const rankBands: Array<{ rank: number; startBand: number; endBand: number }> = [];

  for (const r of sortedRanks) {
    const layer = byRank.get(r)!;
    const subBands = Math.ceil(layer.length / maxPerRow);
    const startBand = visualBand;

    for (let sb = 0; sb < subBands; sb++) {
      const slice = layer.slice(sb * maxPerRow, (sb + 1) * maxPerRow);
      const secondaryGap = orientation === 'horizontal' ? Math.max(72, rowGap * 0.84) : colGap;
      const totalSecondary = (slice.length - 1) * secondaryGap;

      slice.forEach((n, idx) => {
        const secCoord = idx * secondaryGap - totalSecondary / 2;
        if (orientation === 'horizontal') {
          // RTL flow: earlier ranks start at positive X (right) and advance leftward (-x)
          positions.set(n.id, { x: -(visualBand * colGap), y: secCoord, rank: r });
        } else {
          positions.set(n.id, { x: secCoord, y: visualBand * rowGap, rank: r });
        }
      });
      visualBand++;
    }
    rankBands.push({ rank: r, startBand, endBand: visualBand - 1 });
  }

  const primaryStep = orientation === 'horizontal' ? colGap : rowGap;
  const totalPrimary = Math.max(0, (visualBand - 1) * primaryStep);

  for (const val of positions.values()) {
    if (orientation === 'horizontal') {
      val.x += totalPrimary / 2;
    } else {
      val.y -= totalPrimary / 2;
    }
  }

  const effectiveMaxRank = sortedRanks.length ? sortedRanks[sortedRanks.length - 1] : 0;
  for (const rb of rankBands) {
    if (orientation === 'horizontal') {
      const rawStart = -(rb.startBand * colGap) + totalPrimary / 2 + colGap * 0.44;
      const rawEnd = -(rb.endBand * colGap) + totalPrimary / 2 - colGap * 0.44;
      lanes.push({
        rank: rb.rank,
        label: laneTitleForRank(rb.rank, effectiveMaxRank, currentIsMoc),
        startCoord: Math.min(rawStart, rawEnd),
        endCoord: Math.max(rawStart, rawEnd),
        orientation,
      });
    } else {
      const rawStart = rb.startBand * rowGap - totalPrimary / 2 - rowGap * 0.44;
      const rawEnd = rb.endBand * rowGap - totalPrimary / 2 + rowGap * 0.44;
      lanes.push({
        rank: rb.rank,
        label: laneTitleForRank(rb.rank, effectiveMaxRank, currentIsMoc),
        startCoord: Math.min(rawStart, rawEnd),
        endCoord: Math.max(rawStart, rawEnd),
        orientation,
      });
    }
  }

  return { positions, lanes };
}

/** Backwards-compatible wrapper returning coordinate map with default vertical DAG layout. */
export function computeDagLayout(
  nodes: GraphNode[],
  links: GraphLink[],
): Map<string, { x: number; y: number; rank: number }> {
  return computeEnhancedDagLayout(nodes, links, { orientation: 'vertical' }).positions;
}
