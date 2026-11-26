import { KNOWLEDGE_SCHEMA, UMKO_KINDS, UMKO_RELATION_PLANES, UMKO_RELATIONS } from '../umko.mjs';
import type {
  BuildGraphOptions,
  GraphLink,
  GraphNode,
  GraphStats,
  KindVisual,
  NodeShape,
  RelationPlaneKey,
  RelationVisualMeta,
  SitemapEntry,
} from './types.ts';

export { KNOWLEDGE_SCHEMA };

export const DARK_KIND_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWLEDGE_SCHEMA.kinds).map(([kind, meta]) => [kind, meta.dark || meta.color]),
);

export const KIND_SIZE_BOOST: Record<string, number> = Object.fromEntries(
  Object.entries(KNOWLEDGE_SCHEMA.kinds).map(([kind, meta]) => [kind, meta.sizeBoost ?? 0]),
);

const KIND_ALIASES: Record<string, string> = {
  definition: 'concept',
  theorem: 'assertion',
  lemma: 'assertion',
  proposition: 'assertion',
  corollary: 'assertion',
  exercise: 'problem',
  moc: 'collection',
  roadmap: 'collection',
};

const VALID_SHAPES = new Set<NodeShape>([
  'circle',
  'double-circle',
  'hexagon',
  'square',
  'diamond',
  'triangle',
  'octagon',
]);

function asNodeShape(raw?: string): NodeShape {
  return raw && VALID_SHAPES.has(raw as NodeShape) ? (raw as NodeShape) : 'circle';
}

export function normalizeKind(rawKind?: string): string {
  const clean = (rawKind || '').trim().toLowerCase();
  if (!clean) return '';
  if (clean in UMKO_KINDS) return clean;
  return KIND_ALIASES[clean] || '';
}

export const LEGEND_ITEMS: ReadonlyArray<{
  kind: string;
  label: string;
  color: string;
  light: string;
  dark: string;
  shape: NodeShape;
}> = KNOWLEDGE_SCHEMA.legendKinds.map((item) => {
  const meta = (UMKO_KINDS as Record<string, { color: string; dark?: string; shape?: string }>)[
    item.kind
  ];
  return {
    ...item,
    light: meta?.color || item.color,
    dark: meta?.dark || item.color,
    shape: asNodeShape(meta?.shape),
  };
});

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

/** Formats internal UMKO difficulty keys (`L3_undergrad_core`) into human Persian labels. */
export function formatLevelLabel(level?: string): string {
  const clean = (level || '').trim();
  if (!clean) return '';
  const levelsMap = KNOWLEDGE_SCHEMA.levels as Record<string, { label?: string; short?: string }>;
  const entry = levelsMap[clean];
  if (!entry) return clean;
  if (entry.label && entry.short) return `${entry.label} (${entry.short})`;
  return entry.label || entry.short || clean;
}

const TOOLTIP_LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\trianglelefteq\b/g, '⊴'],
  [/\\trianglerighteq\b/g, '⊵'],
  [/\\notin\b/g, '∉'],
  [/\\in\b/g, '∈'],
  [/\\subseteq\b/g, '⊆'],
  [/\\subset\b/g, '⊂'],
  [/\\supseteq\b/g, '⊇'],
  [/\\neq\b/g, '≠'],
  [/\\leq\b|\\le\b/g, '≤'],
  [/\\geq\b|\\ge\b/g, '≥'],
  [/\\leftrightarrow\b/g, '↔'],
  [/\\rightarrow\b|\\to\b/g, '→'],
  [/\\leftarrow\b/g, '←'],
  [/\\mapsto\b/g, '↦'],
  [/\\implies\b/g, '⇒'],
  [/\\iff\b/g, '⇔'],
  [/\\forall\b/g, '∀'],
  [/\\exists\b/g, '∃'],
  [/\\times\b/g, '×'],
  [/\\cdot\b/g, '·'],
  [/\\circ\b/g, '∘'],
  [/\\infty\b/g, '∞'],
  [/\\mathbb\{([A-Za-z])\}/g, '$1'],
];

/** Converts inline `$...$` expressions inside hover tooltips into clean readable Unicode text. */
export function stripRawLatexForTooltip(text?: string): string {
  if (!text) return '';
  let out = text.replace(/\$\$/g, '').replace(/\$/g, '');
  for (const [pattern, replacement] of TOOLTIP_LATEX_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/\\([A-Za-z]+)/g, '$1').replace(/[{}]/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

export function getKindVisual(kind: string): KindVisual {
  const kindsMap = UMKO_KINDS as Record<
    string,
    { label: string; color: string; dark?: string; sizeBoost?: number; shape?: string }
  >;
  const normalized = normalizeKind(kind);
  const entry = normalized ? kindsMap[normalized] : undefined;
  if (!entry) {
    const fallback = KNOWLEDGE_SCHEMA.fallbackKind as {
      label: string;
      light: string;
      dark: string;
      sizeBoost?: number;
      shape?: string;
    };
    return {
      label: fallback.label,
      light: fallback.light,
      dark: fallback.dark,
      sizeBoost: fallback.sizeBoost ?? 0,
      shape: asNodeShape(fallback.shape),
    };
  }
  return {
    label: entry.label,
    light: entry.color,
    dark: entry.dark || entry.color,
    sizeBoost: entry.sizeBoost ?? 0,
    shape: asNodeShape(entry.shape),
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
  const planeKey = (
    raw.plane && raw.plane in planesMap ? raw.plane : 'context'
  ) as RelationPlaneKey;
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
  const direct = normalizeKind(entry.kind);
  if (direct) return direct;
  const tags = entry.tags || [];
  const title = entry.title || '';

  for (const raw of tags) {
    const t = raw.startsWith('#') ? raw.slice(1) : raw;
    if (t.startsWith('kind:')) {
      const normalized = normalizeKind(t.slice(5));
      if (normalized) return normalized;
    }
  }

  const tagSet = new Set(tags.map((t) => (t.startsWith('#') ? t.slice(1) : t)));
  if (tagSet.has('MOC') || tagSet.has('نقشه_راه') || /^00-MOC|^MOC-/.test(title))
    return 'collection';
  if (tagSet.has('جئوجبرا') || tagSet.has('تجسم_هندسی') || tagSet.has('شبیه‌ساز'))
    return 'visual_lab';
  if (tagSet.has('دام') || tagSet.has('کج‌فهمی')) return 'pitfall';
  if (tagSet.has('مثال_نقض')) return 'counterexample';
  if (tagSet.has('قضیه') || tagSet.has('لم') || tagSet.has('نتیجه') || tagSet.has('گزاره'))
    return 'assertion';
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

const MOC_TITLE_RE =
  /(?:^|[\s\-_/])(?:00-?MOC|نقشه(?:\s*های)?\s*راه|نقشه\s*گراف|فهرست|درسنامه\s*و\s*نقشه|MOC\b|Roadmap|README|Templates)/i;

const RAW_OCR_TITLE_RE = /^(?:صفحه[-\s]*[0-9۰-۹]+|متن\s*خام\s*OCR)(?:\b|[\s\-_]|$)/i;
const RAW_OCR_TOKEN_RE = /(?:^|[\s\-_/])(?:متن\s*خام\s*OCR|OCR)(?:$|[\s\-_/])/i;

/** Returns true for hub MOCs, roadmaps, and structural index notes. */
export function isMocOrRoadmap(entry: SitemapEntry | undefined | null, id = ''): boolean {
  if (!entry && !id) return false;
  const normalizedKind = normalizeKind(entry?.kind);
  if (normalizedKind === 'collection') return true;
  const tags = entry?.tags || [];
  for (const raw of tags) {
    const clean = raw.trim().toLowerCase().replace(/^#/, '');
    if (
      clean === 'kind:collection' ||
      clean === 'collection' ||
      clean === 'moc' ||
      clean === 'sub:roadmap' ||
      clean === 'sub:chapter_handout' ||
      clean === 'نقشه_راه'
    ) {
      return true;
    }
  }
  const title = (entry?.title || '').trim();
  return MOC_TITLE_RE.test(title) || MOC_TITLE_RE.test(id);
}

/** Returns true for raw OCR page dumps and untyped archival page stubs. */
export function isRawOcrOrphan(entry: SitemapEntry | undefined | null, id = ''): boolean {
  if (!entry && !id) return false;
  const title = (entry?.title || '').trim();
  if (RAW_OCR_TITLE_RE.test(title) || RAW_OCR_TOKEN_RE.test(title) || RAW_OCR_TOKEN_RE.test(id)) {
    return true;
  }
  const hasSemanticKind = Boolean(normalizeKind(entry?.kind));
  const hasTags = Array.isArray(entry?.tags) && entry.tags.length > 0;
  if (!hasSemanticKind && !hasTags) {
    const chapter = entry?.chapter_slug || '';
    if (/مراجع\s*و\s*اسناد\s*اولیه|00-مراجع/i.test(chapter)) {
      return true;
    }
  }
  return false;
}

export function buildTypedGraphData(
  sitemap: Record<string, SitemapEntry>,
  currentPage: string,
  depth: number,
  options: boolean | BuildGraphOptions = false,
): {
  nodes: GraphNode[];
  links: GraphLink[];
  adjacency: Map<string, Set<string>>;
  typedLinkCount: number;
  stats: GraphStats;
} {
  const renderExternal = typeof options === 'boolean' ? options : Boolean(options.renderExternal);
  const showHubsAndRaw = typeof options === 'boolean' ? false : Boolean(options.showHubsAndRaw);

  const visited = new Set<string>();
  const hiddenHubIds = new Set<string>();
  const currentEntry = sitemap[currentPage];
  const hasCurrent = !!currentEntry;
  const currentIsMoc = isMocOrRoadmap(currentEntry, currentPage);
  const currentIsRaw = isRawOcrOrphan(currentEntry, currentPage);

  const shouldFilterNode = (id: string, entry: SitemapEntry | undefined): boolean => {
    if (!entry || entry.exists === false) return false;
    if (showHubsAndRaw || id === currentPage) return false;
    if (!currentIsMoc && isMocOrRoadmap(entry, id)) return true;
    if (!currentIsRaw && isRawOcrOrphan(entry, id)) return true;
    return false;
  };

  if (depth >= 5 || depth < 0) {
    for (const id of Object.keys(sitemap)) {
      const entry = sitemap[id];
      if (!entry || entry.exists === false) continue;
      if (!renderExternal && entry.external) continue;
      if (shouldFilterNode(id, entry)) {
        hiddenHubIds.add(id);
        continue;
      }
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
          if (shouldFilterNode(target, entry)) {
            hiddenHubIds.add(target);
            continue;
          }
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
    const radius = isCurrent
      ? Math.max(baseRadius + 1.5, 8.6)
      : Math.max(4.8, Math.min(11, baseRadius));

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
      shape: visual.shape,
      level: item.level || '',
      bookSlug: item.book_slug || '',
      chapterSlug: item.chapter_slug || '',
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
      shortLabel:
        metas.length > 1
          ? `${primary.short} (+${toPersianDigits(metas.length - 1)})`
          : primary.short,
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

  return {
    nodes,
    links,
    adjacency,
    typedLinkCount,
    stats: {
      nodeCount: nodes.length,
      linkCount: links.length,
      typedLinkCount,
      hiddenHubCount: hiddenHubIds.size,
    },
  };
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
