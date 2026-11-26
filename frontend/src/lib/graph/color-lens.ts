import { KNOWLEDGE_SCHEMA, LEGEND_ITEMS } from './schema.ts';
import type { ColorByMode, ColorLegendItem, GraphNode } from './types.ts';

const LEVEL_COLORS: Record<string, { light: string; dark: string; label: string }> = {
  L1_intro: { light: '#16a34a', dark: '#4ade80', label: 'L1 · مقدماتی' },
  L2_calc_basic: { light: '#0d9488', dark: '#2dd4bf', label: 'L2 · پایه دانشگاهی' },
  L3_undergrad_core: { light: '#2563eb', dark: '#60a5fa', label: 'L3 · هسته کارشناسی' },
  L4_grad_advanced: { light: '#7c3aed', dark: '#a78bfa', label: 'L4 · تحصیلات تکمیلی' },
  L5_research: { light: '#db2777', dark: '#f472b6', label: 'L5 · پژوهشی' },
};

const LEVEL_UNKNOWN = { light: '#64748b', dark: '#94a3b8', label: 'بدون سطح' };

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

/** Resolves a node's fill color under the active Color-By analytical lens (`kind` | `level` | `chapter`). */
export function resolveNodeColor(
  node: Pick<GraphNode, 'lightColor' | 'darkColor' | 'level' | 'bookSlug' | 'chapterSlug'>,
  mode: ColorByMode,
  isDark: boolean,
  chapterIndexMap?: Map<string, number>,
): string {
  if (mode === 'level') {
    const entry = LEVEL_COLORS[node.level] || LEVEL_UNKNOWN;
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

/** Produces the active Color-By legend entries for HUD and fullscreen docks. */
export function getColorLensLegend(
  nodes: GraphNode[],
  mode: ColorByMode,
  isDark: boolean,
): ColorLegendItem[] {
  if (mode === 'level') {
    const counts = new Map<string, number>();
    for (const n of nodes) {
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

  if (mode === 'chapter') {
    const indexMap = buildChapterIndexMap(nodes);
    const distinctBooks = new Set(nodes.map((n) => n.bookSlug).filter(Boolean));
    const multiBook = distinctBooks.size > 1;
    const grouped = new Map<string, { label: string; count: number; idx: number }>();

    for (const n of nodes) {
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

  return LEGEND_ITEMS.map((item) => ({
    id: item.kind,
    label: item.label,
    color: isDark ? item.dark : item.light,
    shape: item.shape,
  }));
}
