import { classifyRelation } from './schema.ts';
import type { GraphLink, GraphNode } from './types.ts';

/**
 * Computes a deterministic top-down hierarchical DAG layout following UMKO v1.1 semantics:
 * prerequisites and foundational concepts/theorems sit in earlier layers (rank 0),
 * while dependent theorems, proofs, problems, and solutions flow downward.
 * Safely breaks cycles via DFS back-edge pruning so arbitrary note graphs always terminate.
 */
export function computeDagLayout(
  nodes: GraphNode[],
  links: GraphLink[],
): Map<string, { x: number; y: number; rank: number }> {
  const result = new Map<string, { x: number; y: number; rank: number }>();
  if (!nodes.length) return result;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const typedDirectional = links.filter(
    (l) => l.isTyped && !classifyRelation(l.primaryRel).symmetric,
  );
  const activeLinks = typedDirectional.length > 0 ? typedDirectional : links;

  const forwardRels = new Set(['rel_generalizes', 'rel_implies']);
  const rawChildren = new Map<string, string[]>();
  for (const n of nodes) rawChildren.set(n.id, []);

  for (const l of activeLinks) {
    const s = l.source.id;
    const t = l.target.id;
    if (!nodeIds.has(s) || !nodeIds.has(t) || s === t) continue;
    const parent = forwardRels.has(l.primaryRel) ? s : t;
    const child = forwardRels.has(l.primaryRel) ? t : s;
    const list = rawChildren.get(parent);
    if (list && !list.includes(child)) list.push(child);
  }

  // Break cycles via DFS so topological ranking is guaranteed to terminate
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

  const byRank = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) || 0;
    const bucket = byRank.get(r);
    if (bucket) bucket.push(n);
    else byRank.set(r, [n]);
  }

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  const posX = new Map<string, number>();
  const colGap = nodes.length <= 25 ? 145 : nodes.length <= 100 ? 115 : 88;
  const rowGap = nodes.length <= 25 ? 112 : nodes.length <= 100 ? 96 : 82;
  const maxPerRow = nodes.length <= 40 ? 9 : 14;

  let visualRow = 0;
  for (const r of sortedRanks) {
    const layer = byRank.get(r)!;
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

  const maxY = Math.max(0, (visualRow - 1) * rowGap);
  for (const val of result.values()) {
    val.y -= maxY / 2;
  }
  return result;
}
