import { getKindVisual, KNOWLEDGE_SCHEMA, LEGEND_ITEMS, normalizeKind } from './schema.ts';
import type { ColorByMode, ColorLegendItem, GraphNode, MasteryMap } from './types.ts';

const LEVEL_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  L1_intro: { light: '#16a34a', dark: '#4ade80', label: 'L1 · مقدماتی' },
  L2_calc_basic: { light: '#0d9488', dark: '#2dd4bf', label: 'L2 · پایه دانشگاهی' },
  L3_undergrad_core: { light: '#2563eb', dark: '#60a5fa', label: 'L3 · هسته کارشناسی' },
  L4_grad_advanced: { light: '#7c3aed', dark: '#a78bfa', label: 'L4 · تحصیلات تکمیلی' },
  L5_research: { light: '#db2777', dark: '#f472b6', label: 'L5 · پژوهشی' },
};

const LEVEL_UNKNOWN = { light: '#64748b', dark: '#94a3b8', label: 'بدون سطح' };

const MASTERY_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  mastered: { light: '#16a34a', dark: '#4ade80', label: 'تسلط دارم' },
  learning: { light: '#2563eb', dark: '#60a5fa', label: 'در حال مطالعه' },
  review: { light: '#d97706', dark: '#fbbf24', label: 'نیاز به مرور' },
  unseen: { light: '#64748b', dark: '#94a3b8', label: 'نخوانده' },
};

const CHAPTER_PALETTE: Array<{ light: string; dark: string }> = [
  { light: '#1d4ed8', dark: '#60a5fa' },
  { light: '#0d9488', dark: '#2dd4bf' },
  { light: '#7c3aed', dark: '#a78bfa' },
  { light: '#d97706', dark: '#fbbf24' },
  { light: '#059669', dark: '#34d399' },
  { light: '#e11d48', dark: '#fb7185' },
  { light: '#0284c7', dark: '#38bdf8' },
  { light: '#9333ea', dark: '#c084fc' },
];

const BOOK_SHORT_NAMES: Record<string, string> = {
  axler: 'آکسلر',
  'abstract-algebra': 'جبر و ماتریس‌ها',
};

const KIND_PRIORITY: Record<string, number> = {
  assertion: 1,
  concept: 2,
  axiom: 3,
  proof: 4,
  example: 5,
  counterexample: 6,
  problem: 7,
  solution: 8,
  pitfall: 9,
  visual_lab: 10,
  collection: 11,
};

function fnv1aHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getNodeChapterKey(node: Pick<GraphNode, 'bookSlug' | 'chapterSlug'>): string {
  const book = (node.bookSlug || '').trim();
  const chapter = (node.chapterSlug || '').trim();
  if (book && chapter) return `${book}::${chapter}`;
  if (chapter) return chapter;
  if (book) return book;
  return '__other__';
}

export function formatChapterLabel(
  node: Pick<GraphNode, 'bookSlug' | 'chapterSlug'>,
  multiBook: boolean,
): string {
  const chapter = (node.chapterSlug || '').trim();
  const book = (node.bookSlug || '').trim();
  const bookLabel = BOOK_SHORT_NAMES[book] || book;
  if (chapter && multiBook && bookLabel) return `${chapter} (${bookLabel})`;
  if (chapter) return chapter;
  if (bookLabel) return bookLabel;
  return 'سایر یادداشت‌ها';
}

/** Builds a deterministic sorted key-to-palette index map for all chapters in the active graph. */
export function buildChapterIndexMap(
  nodes: Array<Pick<GraphNode, 'bookSlug' | 'chapterSlug'>>,
): Map<string, number> {
  const keys = Array.from(new Set(nodes.map((n) => getNodeChapterKey(n)))).sort((a, b) =>
    a.localeCompare(b, 'fa'),
  );
  const map = new Map<string, number>();
  keys.forEach((key, idx) => {
    map.set(key, idx);
  });
  return map;
}

/** Resolves a node's fill color under the active Color-By lens (`kind` | `level` | `chapter` | `mastery`). */
export function resolveNodeColor(
  node: Pick<GraphNode, 'id' | 'lightColor' | 'darkColor' | 'level' | 'bookSlug' | 'chapterSlug'>,
  mode: ColorByMode,
  isDark: boolean,
  chapterIndexMap?: Map<string, number>,
  masteryMap?: MasteryMap,
): string {
  if (mode === 'level') {
    const entry = LEVEL_COLORS[node.level] || LEVEL_UNKNOWN;
    return isDark ? entry.dark : entry.light;
  }

  if (mode === 'mastery') {
    const status = masteryMap?.[node.id] || 'unseen';
    const entry = MASTERY_COLORS[status] || MASTERY_COLORS.unseen;
    return isDark ? entry.dark : entry.light;
  }

  if (mode === 'chapter') {
    const key = getNodeChapterKey(node);
    const mapped = chapterIndexMap?.get(key);
    const paletteIdx = mapped !== undefined ? mapped : fnv1aHash(key) % CHAPTER_PALETTE.length;
    const swatch = CHAPTER_PALETTE[paletteIdx % CHAPTER_PALETTE.length];
    return isDark ? swatch.dark : swatch.light;
  }

  return isDark ? node.darkColor : node.lightColor;
}

/** Returns true when a Color-By lens legend has at most 1 non-empty category in view. */
export function isLensMonochrome(items: ColorLegendItem[]): boolean {
  return items.filter((i) => (i.count ?? 1) > 0).length <= 1;
}

/** Produces the active dynamic Color-By legend entries for HUD and fullscreen docks. */
export function getColorLensLegend(
  nodes: GraphNode[],
  mode: ColorByMode,
  isDark: boolean,
  masteryMap?: MasteryMap,
): ColorLegendItem[] {
  const realNodes = nodes.filter((n) => !n.isOverflowCluster);

  if (mode === 'level') {
    const counts = new Map<string, number>();
    for (const n of realNodes) {
      const key = LEVEL_COLORS[n.level] ? n.level : '__unknown__';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const items: ColorLegendItem[] = Object.keys(KNOWLEDGE_SCHEMA.levels).map((lvl) => {
      const palette = LEVEL_COLORS[lvl] || LEVEL_UNKNOWN;
      return {
        id: lvl,
        label: palette.label,
        color: isDark ? palette.dark : palette.light,
        shape: 'circle',
        count: counts.get(lvl) || 0,
      };
    });
    if ((counts.get('__unknown__') || 0) > 0) {
      items.push({
        id: '__unknown__',
        label: LEVEL_UNKNOWN.label,
        color: isDark ? LEVEL_UNKNOWN.dark : LEVEL_UNKNOWN.light,
        shape: 'circle',
        count: counts.get('__unknown__') || 0,
      });
    }
    return items;
  }

  if (mode === 'mastery') {
    const counts = new Map<string, number>();
    for (const n of realNodes) {
      const st = masteryMap?.[n.id] || 'unseen';
      counts.set(st, (counts.get(st) || 0) + 1);
    }
    return (['mastered', 'learning', 'review', 'unseen'] as const).map((status) => {
      const palette = MASTERY_COLORS[status];
      return {
        id: status,
        label: palette.label,
        color: isDark ? palette.dark : palette.light,
        shape: 'circle',
        count: counts.get(status) || 0,
      };
    });
  }

  if (mode === 'chapter') {
    const indexMap = buildChapterIndexMap(realNodes);
    const distinctBooks = new Set(realNodes.map((n) => n.bookSlug).filter(Boolean));
    const multiBook = distinctBooks.size > 1;
    const grouped = new Map<string, { label: string; count: number; idx: number }>();

    for (const n of realNodes) {
      const key = getNodeChapterKey(n);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, {
          label: formatChapterLabel(n, multiBook),
          count: 1,
          idx: indexMap.get(key) ?? 0,
        });
      }
    }

    return Array.from(grouped.entries()).map(([key, info]) => {
      const swatch = CHAPTER_PALETTE[info.idx % CHAPTER_PALETTE.length];
      return {
        id: key,
        label: info.label,
        color: isDark ? swatch.dark : swatch.light,
        shape: 'circle',
        count: info.count,
      };
    });
  }

  // Dynamic 'kind' legend built from all normalized kinds actually present in visible nodes
  if (!realNodes.length) {
    return LEGEND_ITEMS.map((item) => ({
      id: item.kind,
      label: item.label,
      color: isDark ? item.dark : item.light,
      shape: item.shape,
    }));
  }

  const kindCounts = new Map<string, number>();
  for (const n of realNodes) {
    const normalized = normalizeKind(n.kind) || '__untyped__';
    kindCounts.set(normalized, (kindCounts.get(normalized) || 0) + 1);
  }

  return Array.from(kindCounts.entries())
    .sort(([ka], [kb]) => {
      const pa = KIND_PRIORITY[ka] ?? 50;
      const pb = KIND_PRIORITY[kb] ?? 50;
      if (pa !== pb) return pa - pb;
      return ka.localeCompare(kb);
    })
    .map(([kindKey, count]) => {
      const lookup = kindKey === '__untyped__' ? '' : kindKey;
      const visual = getKindVisual(lookup);
      return {
        id: kindKey,
        label: visual.label,
        color: isDark ? visual.dark : visual.light,
        shape: visual.shape,
        count,
      };
    });
}
