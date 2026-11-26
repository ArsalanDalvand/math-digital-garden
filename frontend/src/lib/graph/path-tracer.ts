import { classifyRelation } from './schema.ts';
import type {
  GraphLink,
  GraphNode,
  NeighborSummary,
  PathTraceMode,
  PathTraceResult,
  PathTraceStep,
} from './types.ts';

const FORWARD_PREREQ_SOURCE_RELS = new Set(['rel_generalizes', 'rel_implies']);

export function getLinkIdentityKey(link: GraphLink): string {
  return `${link.source.id}->${link.target.id}:${link.primaryRel}`;
}

/**
 * Resolves the dependency direction of an edge aligned with `computeDagLayout`:
 * returns `{ prereqId, dependentId }` where `prereqId` must be studied before
 * `dependentId`. Symmetric peer links (`rel_dual_of`, `rel_contrasts_with`, etc.)
 * and mutual untyped links return `null`.
 */
export function getDirectedDependency(
  link: GraphLink,
): { prereqId: string; dependentId: string; primaryRel: string } | null {
  const s = link.source.id;
  const t = link.target.id;
  if (!s || !t || s === t) return null;

  if (link.isTyped) {
    const meta = classifyRelation(link.primaryRel);
    if (meta.symmetric) return null;
    if (FORWARD_PREREQ_SOURCE_RELS.has(link.primaryRel)) {
      return { prereqId: s, dependentId: t, primaryRel: link.primaryRel };
    }
    return { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
  }

  if (link.bidirectional) return null;
  return { prereqId: t, dependentId: s, primaryRel: link.primaryRel };
}

/**
 * Runs a cycle-safe BFS from `startId` in either `prerequisites` mode (walking
 * upstream dependencies) or `impact` mode (walking downstream theorems, proofs,
 * and exercises that build on `startId`).
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
    return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps };
  }

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);
  if (!nodeById.has(startId)) {
    return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps };
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

  // Highlight every directed edge in the chosen trace orientation whose endpoints were both reached
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
  return { mode, startId, nodeHops, highlightedLinkKeys, orderedSteps };
}

/**
 * Summarizes 1-hop pedagogical neighbors of `currentId` into counts of
 * prerequisites, non-exercise dependents, and exercises/solutions.
 */
export function computeNeighborSummary(
  nodes: GraphNode[],
  links: GraphLink[],
  currentId: string,
  hiddenHubCount = 0,
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

    const dep = getDirectedDependency(link);
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
