import {
  KNOWLEDGE_SCHEMA,
  UMKO_KINDS,
  UMKO_RELATIONS,
  UMKO_RELATION_PLANES,
} from '../umko.mjs';
import type {
  GraphLink,
  GraphNode,
  KindVisual,
  RelationPlaneKey,
  RelationVisualMeta,
  SitemapEntry,
} from './types.ts';

export const DARK_KIND_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWLEDGE_SCHEMA.kinds).map(([kind, meta]) => [kind, meta.dark || meta.color]),
);

export const KIND_SIZE_BOOST: Record<string, number> = Object.fromEntries(
  Object.entries(KNOWLEDGE_SCHEMA.kinds).map(([kind, meta]) => [kind, meta.sizeBoost ?? 0]),
);

export const LEGEND_ITEMS: ReadonlyArray<{ kind: string; label: string; color: string }> =
  KNOWLEDGE_SCHEMA.legendKinds;

export const PLANE_FILTER_ITEMS: Array<{
  key: RelationPlaneKey;
  label: string;
  color: string;
  dash: 'solid' | 'dashed' | 'dotted';
}> = KNOWLEDGE_SCHEMA.planeFilters as Array<{
  key: RelationPlaneKey;
  label: string;
  color: string;
  dash: 'solid' | 'dashed' | 'dotted';
}>;

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function getKindVisual(kind: string): KindVisual {
  const kindsMap = UMKO_KINDS as Record<
    string,
    { label: string; color: string; dark?: string; sizeBoost?: number }
  >;
  const entry = kindsMap[kind];
  if (!entry) {
    return KNOWLEDGE_SCHEMA.fallbackKind;
  }
  return {
    label: entry.label,
    light: entry.color,
    dark: entry.dark || entry.color,
    sizeBoost: entry.sizeBoost ?? 0,
  };
}

export function classifyRelation(relKey: string): RelationVisualMeta {
  const rawMap = UMKO_RELATIONS as Record<
    string,
    {
      plane?: string;
      short?: string;
      forward?: string;
      reverse?: string;
      icon?: string;
      dag?: boolean;
      symmetric?: boolean;
      lightOverride?: string;
      darkOverride?: string;
      dashOverride?: string;
    }
  >;
  const planesMap = UMKO_RELATION_PLANES as Record<
    string,
    { light: string; dark: string; dash: string; priority: number; label: string }
  >;
  const raw = rawMap[relKey];
  if (!raw) {
    const planeMeta = planesMap.context;
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
  const planeKey = (raw.plane && raw.plane in planesMap ? raw.plane : 'context') as RelationPlaneKey;
  const planeMeta = planesMap[planeKey];
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

export function getPlaneLabel(plane: RelationPlaneKey): string {
  const planesMap = UMKO_RELATION_PLANES as Record<string, { label: string }>;
  return planesMap[plane]?.label || 'ارجاع متنی';
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

  const tagSet = new Set(tags.map((t) => (t.startsWith('#') ? t.slice(1) : t)));
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

export function truncateLabel(title: string, maxChars: number): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > maxChars * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${safe.trimEnd()}…`;
}

export function buildTypedGraphData(
  sitemap: Record<string, SitemapEntry>,
  currentPage: string,
  depth: number,
  renderExternal = false,
): {
  nodes: GraphNode[];
  links: GraphLink[];
  adjacency: Map<string, Set<string>>;
  typedLinkCount: number;
} {
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
    adjacency.get(edge.s)?.add(edge.t);
    adjacency.get(edge.t)?.add(edge.s);
    outCounts.set(edge.s, (outCounts.get(edge.s) || 0) + 1);
    inCounts.set(edge.t, (inCounts.get(edge.t) || 0) + 1);
  }

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
      level: item.level || '',
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

  const links: GraphLink[] = [];
  const processedPairs = new Set<string>();
  let typedLinkCount = 0;

  const makeLink = (
    sId: string,
    tId: string,
    rels: string[],
    bidirectional: boolean,
    curveOffset: number,
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
      isDag: metas.some((m) => m.dag),
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
    const fwdTyped = edge.rels.some((r) => r !== 'local_context_uses');
    const revTyped = !!rev && rev.rels.some((r) => r !== 'local_context_uses');

    if (!rev) {
      const l = makeLink(edge.s, edge.t, edge.rels, false, 0);
      if (l) links.push(l);
    } else if (fwdTyped && !revTyped) {
      const l = makeLink(edge.s, edge.t, edge.rels, false, 0);
      if (l) links.push(l);
    } else if (!fwdTyped && revTyped) {
      const l = makeLink(rev.s, rev.t, rev.rels, false, 0);
      if (l) links.push(l);
    } else if (fwdTyped && revTyped) {
      const l1 = makeLink(edge.s, edge.t, edge.rels, false, 20);
      const l2 = makeLink(rev.s, rev.t, rev.rels, false, 20);
      if (l1) links.push(l1);
      if (l2) links.push(l2);
    } else {
      const l = makeLink(edge.s, edge.t, ['local_context_uses'], true, 0);
      if (l) links.push(l);
    }
  }

  return { nodes, links, adjacency, typedLinkCount };
}

const graphSitemapCache = new Map<
  string,
  {
    promise: Promise<Record<string, SitemapEntry>>;
    data?: Record<string, SitemapEntry>;
    fetch: typeof globalThis.fetch;
  }
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
  const promise = currentFetch(url, { credentials: 'same-origin' }).then(async (response) => {
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
