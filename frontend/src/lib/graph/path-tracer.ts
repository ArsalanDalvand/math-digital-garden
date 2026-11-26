import { extractSectionOrder, getPedagogicalTier } from './dag-layout.ts';
import {
  classifyRelation,
  getKindVisual,
  inferSemanticKind,
  isMocOrRoadmap,
  isRawOcrOrphan,
} from './schema.ts';
import type {
  GraphLink,
  GraphNode,
  NeighborSummary,
  PathTraceMode,
  PathTraceResult,
  PathTraceStep,
  ShortestPathResult,
  ShortestPathStep,
  SitemapEntry,
  TheoremAnatomyResult,
} from './types.ts';

const FORWARD_PREREQ_SOURCE_RELS = new Set(['rel_generalizes', 'rel_implies']);

export function getLinkIdentityKey(link: GraphLink): string {
  return `${link.source.id}->${link.target.id}:${link.primaryRel}`;
}

/**
 * Resolves the dependency direction of an edge: returns `{ prereqId, dependentId }`.
 * Handles typed UMKO directionality, MOC hub roots, and pedagogical tier/section
 * fallback on untyped wikilinks so weak graphs align cleanly.
 */
export function getDirectedDependency(
  link: GraphLink,
  options: { currentId?: string; currentIsMoc?: boolean } = {},
): { prereqId: string; dependentId: string; primaryRel: string } | null {
  const s = link.source.id;
  const t = link.target.id;
  if (!s || !t || s === t) return null;

  if (
    options.currentIsMoc &&
    options.currentId &&
    (s === options.currentId || t === options.currentId)
  ) {
    const other = s === options.currentId ? t : s;
    return { prereqId: options.currentId, dependentId: other, primaryRel: link.primaryRel };
  }

  if (link.isTyped) {
    const meta = classifyRelation(link.primaryRel);
    if (meta.symmetric) return null;
    if (FORWARD_PREREQ_SOURCE_RELS.has(link.primaryRel)) {
      return { prereqId: s, dependentId: t, primaryRel: link.primaryRel };
    }
    return { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
  }

  if (link.bidirectional) return null;

  const ts = getPedagogicalTier(link.source.kind);
  const tt = getPedagogicalTier(link.target.kind);
  if (ts !== tt) {
    return ts < tt
      ? { prereqId: s, dependentId: t, primaryRel: link.primaryRel }
      : { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
  }

  const os = extractSectionOrder(link.source.title);
  const ot = extractSectionOrder(link.target.title);
  if (os !== null && ot !== null && Math.abs(os - ot) > 1e-6) {
    return os < ot
      ? { prereqId: s, dependentId: t, primaryRel: link.primaryRel }
      : { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
  }

  return { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
}

/**
 * Runs a cycle-safe BFS from `startId` in either `prerequisites` or `impact` mode.
 * Exposes `orderedSteps` (nearest hops first) AND `studyChecklist` (for `prerequisites`,
 * sorted foundation-first from deepest roots up toward `startId`).
 */
export function traceLearningPath(
  nodes: GraphNode[],
  links: GraphLink[],
  startId: string,
  mode: PathTraceMode,
): PathTraceResult {
  const nodeHops = new Map<string, number>();
  const highlightedLinkKeys = new Set<string>();
  const orderedSteps: PathTraceStep[] = [];

  if (mode === 'off' || !startId) {
    return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps, studyChecklist: [] };
  }

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);
  if (!nodeById.has(startId)) {
    return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps, studyChecklist: [] };
  }

  const adj = new Map<string, Array<{ nextId: string; linkKey: string; primaryRel: string }>>();
  for (const n of nodes) adj.set(n.id, []);

  for (const link of links) {
    const dep = getDirectedDependency(link);
    if (!dep) continue;
    const from = mode === 'prerequisites' ? dep.dependentId : dep.prereqId;
    const to = mode === 'prerequisites' ? dep.prereqId : dep.dependentId;
    if (!nodeById.has(from) || !nodeById.has(to)) continue;
    adj.get(from)?.push({
      nextId: to,
      linkKey: getLinkIdentityKey(link),
      primaryRel: dep.primaryRel,
    });
  }

  const queue: string[] = [startId];
  nodeHops.set(startId, 0);
  const edgeMetaToNode = new Map<string, string>();
  let head = 0;

  while (head < queue.length) {
    const curr = queue[head++];
    const currHop = nodeHops.get(curr) ?? 0;
    for (const edge of adj.get(curr) || []) {
      if (!nodeHops.has(edge.nextId)) {
        nodeHops.set(edge.nextId, currHop + 1);
        edgeMetaToNode.set(edge.nextId, edge.primaryRel);
        queue.push(edge.nextId);
      }
    }
  }

  for (const [fromId, edges] of adj.entries()) {
    if (!nodeHops.has(fromId)) continue;
    for (const edge of edges) {
      if (nodeHops.has(edge.nextId)) {
        highlightedLinkKeys.add(edge.linkKey);
      }
    }
  }

  for (const [id, hop] of nodeHops.entries()) {
    if (hop === 0) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    orderedSteps.push({
      nodeId: node.id,
      title: node.title,
      kind: node.kind,
      kindLabel: node.kindLabel,
      lightColor: node.lightColor,
      darkColor: node.darkColor,
      shape: node.shape,
      hop,
      viaRelation: edgeMetaToNode.get(id) || '',
    });
  }

  orderedSteps.sort((a, b) => a.hop - b.hop || a.title.localeCompare(b.title, 'fa'));

  const studyChecklist =
    mode === 'prerequisites'
      ? [...orderedSteps].sort((a, b) => b.hop - a.hop || a.title.localeCompare(b.title, 'fa'))
      : [...orderedSteps];

  return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps, studyChecklist };
}

/** Summarizes direct neighbors around `currentId`, handling MOCs and untyped graphs cleanly. */
export function computeNeighborSummary(
  nodes: GraphNode[],
  links: GraphLink[],
  currentId: string,
  hiddenHubCount = 0,
  currentIsMoc = false,
): NeighborSummary {
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const prereqIds = new Set<string>();
  const dependentIds = new Set<string>();
  const exerciseIds = new Set<string>();

  for (const link of links) {
    const s = link.source.id;
    const t = link.target.id;
    if (s !== currentId && t !== currentId) continue;
    const otherId = s === currentId ? t : s;
    if (!otherId || otherId === currentId) continue;

    const other = nodeById.get(otherId);
    const isExercise =
      other?.kind === 'problem' ||
      other?.kind === 'solution' ||
      link.relations.includes('rel_solves');

    if (isExercise) {
      exerciseIds.add(otherId);
      continue;
    }

    const dep = getDirectedDependency(link, { currentId, currentIsMoc });
    if (!dep) continue;
    if (dep.dependentId === currentId) {
      prereqIds.add(otherId);
    } else if (dep.prereqId === currentId) {
      dependentIds.add(otherId);
    }
  }

  return {
    prereqCount: prereqIds.size,
    dependentCount: dependentIds.size,
    exerciseCount: exerciseIds.size,
    hiddenHubCount,
  };
}

/**
 * Finds the shortest conceptual reasoning path between two notes anywhere in `sitemap`,
 * preferring typed UMKO edges (weight 1.0) over plain wikilinks (weight 1.6).
 */
export function findShortestPath(
  sitemap: Record<string, SitemapEntry>,
  fromId: string,
  toId: string,
  options: { showHubsAndRaw?: boolean } = {},
): ShortestPathResult {
  const empty: ShortestPathResult = {
    fromId,
    toId,
    found: false,
    steps: [],
    nodeIds: new Set(),
    linkKeys: new Set(),
  };

  if (!fromId || !toId || !sitemap[fromId] || !sitemap[toId]) return empty;
  if (fromId === toId) {
    const entry = sitemap[fromId];
    const kind = inferSemanticKind(entry);
    const visual = getKindVisual(kind);
    return {
      fromId,
      toId,
      found: true,
      steps: [
        {
          id: fromId,
          title: entry.title || fromId,
          kind,
          kindLabel: visual.label,
          lightColor: visual.light,
          darkColor: visual.dark,
          shape: visual.shape,
          viaRelationFromPrev: '',
          relationLabelFromPrev: '',
        },
      ],
      nodeIds: new Set([fromId]),
      linkKeys: new Set(),
    };
  }

  const showHubsAndRaw = Boolean(options.showHubsAndRaw);
  const canVisit = (id: string): boolean => {
    const entry = sitemap[id];
    if (!entry || entry.exists === false || entry.external) return false;
    if (id === fromId || id === toId || showHubsAndRaw) return true;
    return !isMocOrRoadmap(entry, id) && !isRawOcrOrphan(entry, id);
  };

  interface AdjEdge {
    next: string;
    weight: number;
    rel: string;
    linkKey: string;
    reverseKey: string;
  }
  const adj = new Map<string, AdjEdge[]>();
  const ensure = (id: string) => {
    let list = adj.get(id);
    if (!list) {
      list = [];
      adj.set(id, list);
    }
    return list;
  };

  for (const [id, entry] of Object.entries(sitemap)) {
    if (!canVisit(id)) continue;
    const relMap = entry.rels || {};
    const targets = new Set<string>([...(entry.links || []), ...Object.keys(relMap)]);
    for (const tgt of targets) {
      if (tgt === id || !canVisit(tgt)) continue;
      const rels = Array.isArray(relMap[tgt]) ? relMap[tgt].filter(Boolean) : [];
      const metas = (rels.length ? rels : ['local_context_uses'])
        .map(classifyRelation)
        .sort((a, b) => a.priority - b.priority);
      const primary = metas[0];
      const typed = primary.key !== 'local_context_uses';
      const weight = typed ? 1.0 : 1.6;
      const linkKey = `${id}->${tgt}:${primary.key}`;
      const reverseKey = `${tgt}->${id}:${primary.key}`;
      ensure(id).push({ next: tgt, weight, rel: primary.key, linkKey, reverseKey });
      ensure(tgt).push({ next: id, weight, rel: primary.key, linkKey, reverseKey });
    }
  }

  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<
    string,
    { parent: string; rel: string; linkKey: string; reverseKey: string }
  >();
  const pq: Array<{ id: string; d: number }> = [{ id: fromId, d: 0 }];
  const settled = new Set<string>();

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { id: u } = pq.shift()!;
    if (settled.has(u)) continue;
    settled.add(u);
    if (u === toId) break;

    const du = dist.get(u) ?? Infinity;
    for (const edge of adj.get(u) || []) {
      if (settled.has(edge.next)) continue;
      const nd = du + edge.weight;
      if (nd < (dist.get(edge.next) ?? Infinity)) {
        dist.set(edge.next, nd);
        prev.set(edge.next, {
          parent: u,
          rel: edge.rel,
          linkKey: edge.linkKey,
          reverseKey: edge.reverseKey,
        });
        pq.push({ id: edge.next, d: nd });
      }
    }
  }

  if (!prev.has(toId)) return empty;

  const rawChain: Array<{ id: string; rel: string; linkKey: string; reverseKey: string }> = [];
  let cur: string | undefined = toId;
  while (cur) {
    const p = prev.get(cur);
    rawChain.push({
      id: cur,
      rel: p?.rel || '',
      linkKey: p?.linkKey || '',
      reverseKey: p?.reverseKey || '',
    });
    cur = p?.parent;
  }
  rawChain.reverse();

  const nodeIds = new Set<string>();
  const linkKeys = new Set<string>();
  const steps: ShortestPathStep[] = rawChain.map((item) => {
    nodeIds.add(item.id);
    if (item.linkKey) {
      linkKeys.add(item.linkKey);
      linkKeys.add(item.reverseKey);
    }
    const entry = sitemap[item.id];
    const kind = inferSemanticKind(entry);
    const visual = getKindVisual(kind);
    const relMeta = item.rel ? classifyRelation(item.rel) : null;
    return {
      id: item.id,
      title: entry.title || item.id.replace(/^notes\//, ''),
      kind,
      kindLabel: visual.label,
      lightColor: visual.light,
      darkColor: visual.dark,
      shape: visual.shape,
      viaRelationFromPrev: item.rel,
      relationLabelFromPrev: relMeta ? relMeta.short : '',
    };
  });

  return { fromId, toId, found: true, steps, nodeIds, linkKeys };
}

/**
 * Partitions a theorem or proposition's local neighborhood into structural anatomy bands:
 * `premises` (foundations needed), `proofsAndRefutations` (proofs, counterexamples, pitfalls),
 * and `applications` (corollaries, downstream theorems, and exercises).
 */
export function computeTheoremAnatomy(
  nodes: GraphNode[],
  links: GraphLink[],
  focusId: string,
): TheoremAnatomyResult {
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const premisesMap = new Map<string, GraphNode>();
  const proofsMap = new Map<string, GraphNode>();
  const appsMap = new Map<string, GraphNode>();
  const highlightedNodeIds = new Set<string>();
  const highlightedLinkKeys = new Set<string>();

  if (nodeById.has(focusId)) highlightedNodeIds.add(focusId);

  const proofKinds = new Set(['proof', 'counterexample', 'pitfall', 'remark']);
  const proofRels = new Set(['rel_proves', 'rel_refutes', 'rel_triggers_pitfall', 'rel_annotates']);

  for (const link of links) {
    const s = link.source.id;
    const t = link.target.id;
    if (s !== focusId && t !== focusId) continue;
    const other = s === focusId ? link.target : link.source;
    if (!other || other.id === focusId) continue;

    highlightedNodeIds.add(other.id);
    highlightedLinkKeys.add(getLinkIdentityKey(link));

    if (proofKinds.has(other.kind) || proofRels.has(link.primaryRel)) {
      proofsMap.set(other.id, other);
      continue;
    }

    const dep = getDirectedDependency(link);
    if (dep && dep.dependentId === focusId) {
      premisesMap.set(other.id, other);
    } else {
      appsMap.set(other.id, other);
    }
  }

  return {
    focusId,
    premises: [...premisesMap.values()],
    proofsAndRefutations: [...proofsMap.values()],
    applications: [...appsMap.values()],
    highlightedNodeIds,
    highlightedLinkKeys,
  };
}
