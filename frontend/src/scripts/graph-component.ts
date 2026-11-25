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

export interface SitemapEntry {
  title?: string;
  exists?: boolean;
  external?: boolean;
  links?: string[];
  backlinks?: string[];
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
  labelFontSize: number;
  linkDistance: number;
  repelForce: number;
  centerForce: number;
  colliderPadding: number;
  alphaDecay: number;
  scale: number;
  minZoom: number;
  maxZoom: number;
  tagRenderMode: string;
  tagStyles: Record<string, {
    shape?: string;
    shapeSize?: number;
    shapeColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
  }>;
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
  // Smooth animation state
  labelAlpha: number;
  hoverScale: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
  bidirectional: boolean;
}

interface KindVisual {
  label: string;
  light: string;
  dark: string;
  sizeBoost: number;
}

const KIND_VISUALS: Record<string, KindVisual> = {
  assertion:         { label: 'گزاره و قضیه',     light: '#1d4ed8', dark: '#60a5fa', sizeBoost: 0.4 },
  concept:           { label: 'مفهوم و ساختار',   light: '#0d9488', dark: '#2dd4bf', sizeBoost: 0.4 },
  proof:             { label: 'برهان و اثبات',    light: '#64748b', dark: '#94a3b8', sizeBoost: -0.4 },
  problem:           { label: 'مسئله و آزمون',    light: '#ea580c', dark: '#fb923c', sizeBoost: 0.3 },
  solution:          { label: 'راه‌حل و شگرد',    light: '#059669', dark: '#34d399', sizeBoost: -0.2 },
  technique:         { label: 'تکنیک و شگرد',     light: '#d97706', dark: '#fbbf24', sizeBoost: 0 },
  hint_ladder:       { label: 'نردبان سقراطی',    light: '#d97706', dark: '#f59e0b', sizeBoost: -0.5 },
  problem_archetype: { label: 'تیپ مسئله',        light: '#c026d3', dark: '#e879f9', sizeBoost: 0.3 },
  pitfall:           { label: 'دام و کج‌فهمی',    light: '#b45309', dark: '#fbbf24', sizeBoost: 0.1 },
  visual_lab:        { label: 'آزمایشگاه تعاملی', light: '#0284c7', dark: '#38bdf8', sizeBoost: 0.4 },
  collection:        { label: 'مجموعه و نقشه راه', light: '#7c3aed', dark: '#a78bfa', sizeBoost: 1.4 },
  axiom:             { label: 'اصل موضوعه',       light: '#0e7490', dark: '#22d3ee', sizeBoost: 0.3 },
  theory:            { label: 'چارچوب نظری',      light: '#4338ca', dark: '#818cf8', sizeBoost: 1.1 },
  remark:            { label: 'یادداشت تفسیری',   light: '#64748b', dark: '#94a3b8', sizeBoost: -0.6 },
  example:           { label: 'مثال و مصداق',     light: '#9333ea', dark: '#c084fc', sizeBoost: -0.1 },
  counterexample:    { label: 'مثال نقض',         light: '#dc2626', dark: '#f87171', sizeBoost: 0.2 },
  property:          { label: 'ویژگی و ناوردا',   light: '#6366f1', dark: '#818cf8', sizeBoost: 0.1 },
  algorithm:         { label: 'الگوریتم',         light: '#0284c7', dark: '#38bdf8', sizeBoost: 0.2 },
  comparison:        { label: 'تحلیل مقایسه‌ای',  light: '#4f46e5', dark: '#818cf8', sizeBoost: 0.2 },
  code_kernel:       { label: 'هسته محاسباتی',    light: '#475569', dark: '#94a3b8', sizeBoost: -0.2 },
  symbol:            { label: 'نماد و قرارداد',   light: '#334155', dark: '#94a3b8', sizeBoost: -0.4 },
};

const DEFAULT_VISUAL: KindVisual = {
  label: 'یادداشت',
  light: '#4f46e5',
  dark: '#818cf8',
  sizeBoost: 0,
};

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)] ?? d);
}

function inferSemanticKind(entry: SitemapEntry): string {
  if (entry.kind && KIND_VISUALS[entry.kind]) return entry.kind;
  const tags = entry.tags || [];
  const title = entry.title || '';

  for (const raw of tags) {
    const t = raw.startsWith('#') ? raw.slice(1) : raw;
    if (t.startsWith('kind:')) {
      const k = t.slice(5);
      if (KIND_VISUALS[k]) return k;
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

const DEFAULT_CONFIG: GraphConfig = {
  depth: 1,
  prefetchPages: false,
  renderExternal: false,
  renderLabels: true,
  renderArrows: true,
  labelFontSize: 12,
  linkDistance: 120,
  repelForce: 150,
  centerForce: 0.12,
  colliderPadding: 24,
  alphaDecay: 0.028,
  scale: 1,
  minZoom: 0.08,
  maxZoom: 4.5,
  tagRenderMode: 'same',
  tagStyles: {},
  actions: ['reset-zoom', 'fullscreen', 'render-arrows', 'settings'],
};

const ACTION_ICONS: Record<string, string> = {
  'reset-zoom':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>',
  fullscreen:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>',
  minimize:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/></svg>',
  'render-arrows':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="M7 17 16.5 7.5"/><path d="M11 7h6v6"/></svg>',
  settings:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>',
};

const ACTION_TITLES: Record<string, string> = {
  'reset-zoom': 'بازنشانی زوم',
  fullscreen: 'تمام‌صفحه یا بازگشت',
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

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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

export class GraphComponent extends HTMLElement {
  config!: GraphConfig;
  sitemap: Record<string, SitemapEntry> = {};
  currentPage = '';
  isFullscreen = false;

  graphContainer!: HTMLDivElement;
  actionContainer!: HTMLDivElement;
  canvas!: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  tooltipEl!: HTMLDivElement;
  fsHudEl!: HTMLDivElement;
  fsLegendEl!: HTMLDivElement;
  blurEl: HTMLDivElement | null = null;
  placeholderEl: HTMLDivElement | null = null;

  nodes: GraphNode[] = [];
  links: GraphLink[] = [];
  private adjacency = new Map<string, Set<string>>();
  private simulation: Simulation<GraphNode, GraphLink> | null = null;
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  private dragBehavior: DragBehavior<HTMLCanvasElement, unknown, GraphNode | unknown> | null = null;

  private transform: ZoomTransform = zoomIdentity;
  private hoveredNode: GraphNode | null = null;
  private draggedNode: GraphNode | null = null;
  private activeKindFilter: string | null = null;
  private searchQuery = '';
  private searchMatches = new Set<string>();

  // Animation states
  private hoverMix = 0;
  private rafId = 0;
  private running = false;
  private mounted = false;
  private prefersReducedMotion = false;
  private lastViewportW = 0;
  private lastViewportH = 0;
  private labelWidthCache = new Map<string, number>();

  // Observers & listeners for clean teardown
  private themeObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundKeydown: ((e: KeyboardEvent) => void) | null = null;
  private boundOutsideClick: ((e: MouseEvent) => void) | null = null;

  // Public simulator facade compatible with fitGraph, tests, and controls
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
      tagStyles: { ...(parsed.tagStyles || {}) },
      actions: Array.isArray(parsed.actions) ? [...parsed.actions] : [...DEFAULT_CONFIG.actions],
    };
    try {
      this.sitemap = JSON.parse(this.dataset.sitemap || '{}');
    } catch {
      this.sitemap = {};
    }
    this.currentPage = (this.dataset.slug || location.pathname.replace(/^\/+/, '')).replace(/\/+$/, '');
  }

  connectedCallback() {
    if (this.mounted) return;
    this.mounted = true;

    this.prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Remove legacy skeleton sibling if present
    const prev = this.previousElementSibling;
    if (prev && prev.classList.contains('slsg-graph-skeleton')) {
      prev.remove();
    }

    this.classList.add('slsg-graph-component');
    this.dataset.graphReady = 'true';
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

    // Floating glassmorphic hover inspector card
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'kg-tooltip';
    this.tooltipEl.setAttribute('aria-hidden', 'true');
    this.tooltipEl.hidden = true;
    this.graphContainer.appendChild(this.tooltipEl);

    // Fullscreen HUD (hidden unless in fullscreen)
    this.fsHudEl = document.createElement('div');
    this.fsHudEl.className = 'kg-fs-hud';
    this.fsHudEl.hidden = true;
    this.fsHudEl.innerHTML = `
      <div class="kg-fs-search-wrap">
        <svg class="kg-fs-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" class="kg-fs-search" placeholder="جست‌وجوی یادداشت در گراف…" aria-label="جست‌وجوی یادداشت در گراف" />
      </div>
      <div class="kg-fs-depths" role="group" aria-label="عمق نمایش">
        <button type="button" class="kg-fs-chip" data-fs-depth="1">۱ گام</button>
        <button type="button" class="kg-fs-chip" data-fs-depth="2">۲ گام</button>
        <button type="button" class="kg-fs-chip" data-fs-depth="5">سراسری</button>
      </div>
      <span class="kg-fs-stats" data-fs-stats></span>
    `;
    this.graphContainer.appendChild(this.fsHudEl);
    this.bindFullscreenHud();

    // Fullscreen interactive legend bar
    this.fsLegendEl = document.createElement('div');
    this.fsLegendEl.className = 'kg-fs-legend';
    this.fsLegendEl.hidden = true;
    this.fsLegendEl.innerHTML = LEGEND_ITEMS.map(
      item =>
        `<button type="button" class="kg-fs-legend-chip" data-fs-kind="${item.kind}" style="--chip-c:${item.color}"><span class="kg-dot"></span>${item.label}</button>`
    ).join('');
    this.graphContainer.appendChild(this.fsLegendEl);
    this.fsLegendEl.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-kind]');
      if (!btn) return;
      const kind = btn.dataset.fsKind || '';
      this.setKindFilter(this.activeKindFilter === kind ? null : kind);
    });

    // Expose simulator API
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
        self.applyForces(true);
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
    this.buildSubgraph(this.config.depth);
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
    this.syncDepthChips();
  }

  public setKindFilter(kind: string | null) {
    this.activeKindFilter = kind;
    const host = this.closest('[data-note-graph]');
    host?.querySelectorAll<HTMLElement>('[data-legend-kind]').forEach(el => {
      const active = !!kind && el.dataset.legendKind === kind;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    this.fsLegendEl?.querySelectorAll<HTMLElement>('[data-fs-kind]').forEach(el => {
      el.classList.toggle('is-active', !!kind && el.dataset.fsKind === kind);
    });
    this.scheduleFrame();
  }

  private syncDepthChips() {
    const depth = Number(this.config.depth);
    const host = this.closest('[data-note-graph]');
    host?.querySelectorAll<HTMLButtonElement>('[data-depth]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.depth) === depth);
    });
    this.fsHudEl?.querySelectorAll<HTMLButtonElement>('[data-fs-depth]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.fsDepth) === depth);
    });
    const stats = this.fsHudEl?.querySelector('[data-fs-stats]');
    if (stats) {
      stats.textContent = `${toPersianDigits(this.nodes.length)} یادداشت · ${toPersianDigits(this.links.length)} پیوند`;
    }
  }

  private bindFullscreenHud() {
    this.fsHudEl.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fs-depth]');
      if (!btn) return;
      const d = Number(btn.dataset.fsDepth);
      this.config.depth = d;
      this.full_refresh();
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
          if (target) {
            this.focusNode(target);
          }
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
    this.applyTransform(new ZoomTransform(targetK, tx, ty), true);
    this.updateTooltip();
    this.scheduleFrame();
  }

  private renderActionButtons() {
    this.actionContainer.replaceChildren();
    for (const action of this.config.actions) {
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
    this.fsLegendEl.hidden = false;
    this.renderActionButtons();
    this.syncDepthChips();

    // Wait one layout frame for fixed dimensions to settle, then fit smoothly
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
    this.fsLegendEl.hidden = true;
    this.blurEl?.remove();
    this.blurEl = null;
    this.placeholderEl?.remove();
    this.placeholderEl = null;

    // Clear search on exit
    const input = this.fsHudEl.querySelector<HTMLInputElement>('.kg-fs-search');
    if (input) input.value = '';
    this.searchQuery = '';
    this.searchMatches.clear();

    this.renderActionButtons();
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
            <select aria-label="عمق ارتباطات">
              <option value="0">فقط این یادداشت</option>
              <option value="1">همسایه‌ها (۱ گام)</option>
              <option value="2">دو مرحله (۲ گام)</option>
              <option value="3">سه مرحله</option>
              <option value="4">چهار مرحله</option>
              <option value="5">همه یادداشت‌ها (سراسری)</option>
            </select>
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

    const selectEl = popup.querySelector('select')!;
    selectEl.value = String(this.config.depth);
    selectEl.addEventListener('change', () => {
      this.config.depth = Number(selectEl.value);
      this.full_refresh();
    });

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
        this.applyForces(true);
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
      this.applyForces(true);
      popup.remove();
      this.toggleSettingsPopup();
    });

    this.appendChild(popup);
  }

  private buildSubgraph(depth: number) {
    const visited = new Set<string>();
    const hasCurrent = !!this.sitemap[this.currentPage];

    if (depth >= 5 || depth < 0) {
      for (const id of Object.keys(this.sitemap)) {
        const entry = this.sitemap[id];
        if (!entry || entry.exists === false) continue;
        if (!this.config.renderExternal && entry.external) continue;
        visited.add(id);
      }
    } else if (hasCurrent) {
      visited.add(this.currentPage);
      let frontier = [this.currentPage];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          const item = this.sitemap[id];
          if (!item) continue;
          const neighbors = [...(item.links || []), ...(item.backlinks || [])];
          for (const target of neighbors) {
            const entry = this.sitemap[target];
            if (!entry || entry.exists === false) continue;
            if (!this.config.renderExternal && entry.external) continue;
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

    // Build deduplicated link list & adjacency
    const directedSet = new Set<string>();
    for (const id of visited) {
      const item = this.sitemap[id];
      if (!item) continue;
      for (const tgt of item.links || []) {
        if (visited.has(tgt) && tgt !== id) {
          directedSet.add(`${id}\0${tgt}`);
        }
      }
    }

    const adj = new Map<string, Set<string>>();
    const outCounts = new Map<string, number>();
    const inCounts = new Map<string, number>();
    for (const id of visited) {
      adj.set(id, new Set());
      outCounts.set(id, 0);
      inCounts.set(id, 0);
    }

    const rawEdges: Array<{ s: string; t: string; bidirectional: boolean }> = [];
    const seenPair = new Set<string>();
    for (const key of directedSet) {
      const [s, t] = key.split('\0');
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
      outCounts.set(s, (outCounts.get(s) || 0) + 1);
      inCounts.set(t, (inCounts.get(t) || 0) + 1);

      const pairKey = s < t ? `${s}\0${t}` : `${t}\0${s}`;
      if (seenPair.has(pairKey)) continue;
      seenPair.add(pairKey);
      const isBidi = directedSet.has(`${t}\0${s}`);
      rawEdges.push({ s, t, bidirectional: isBidi });
    }

    // Create nodes positioned cleanly in golden-angle spiral
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const orderedIds = [...visited].sort((a, b) => {
      if (a === this.currentPage) return -1;
      if (b === this.currentPage) return 1;
      return (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0);
    });

    const nodeMap = new Map<string, GraphNode>();
    const newNodes: GraphNode[] = [];
    const spreadStep = orderedIds.length <= 20 ? 34 : orderedIds.length <= 80 ? 22 : 13;

    orderedIds.forEach((id, idx) => {
      const item = this.sitemap[id];
      if (!item) return;
      const isCurrent = id === this.currentPage;
      const kind = inferSemanticKind(item);
      const visual = (kind && KIND_VISUALS[kind]) || DEFAULT_VISUAL;
      const degree = adj.get(id)?.size || 0;
      const baseRadius = 5.4 + visual.sizeBoost + Math.min(4.2, Math.log2(degree + 1) * 1.15);
      const radius = isCurrent ? Math.max(baseRadius + 1.5, 8.6) : Math.max(4.8, Math.min(11, baseRadius));

      const r = isCurrent ? 0 : Math.sqrt(idx) * spreadStep;
      const theta = idx * GOLDEN_ANGLE;
      const title = item.title || id.replace(/^notes\//, '');

      const node: GraphNode = {
        id,
        title,
        shortTitle: truncateLabel(title, 22),
        fullShortTitle: truncateLabel(title, 32),
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
      newNodes.push(node);
      nodeMap.set(id, node);
    });

    const newLinks: GraphLink[] = [];
    for (const e of rawEdges) {
      const source = nodeMap.get(e.s);
      const target = nodeMap.get(e.t);
      if (source && target) {
        newLinks.push({ source, target, bidirectional: e.bidirectional });
      }
    }

    this.nodes = newNodes;
    this.links = newLinks;
    this.adjacency = adj;
    this.hoveredNode = null;
    this.draggedNode = null;
    this.hoverMix = 0;
    this.labelWidthCache.clear();
    this.updateTooltip();

    // Stop previous simulation and build fresh D3 force simulation
    this.simulation?.stop();
    this.simulation = forceSimulation<GraphNode>(this.nodes);
    this.applyForces(false);

    // Pre-warm layout synchronously so frame 1 is immediately spacious, centered, and jitter-free
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

    this.simulation.on('tick', () => {
      this.scheduleFrame();
    });

    // Gentle living tail settle
    this.simulation.alpha(this.prefersReducedMotion ? 0.01 : 0.16).restart();

    this.syncCanvasSize();
    this.syncDepthChips();
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
    const effectiveDist = isSmall ? Math.max(72, baseDist * 0.88) : isMedium ? Math.max(58, baseDist * 0.68) : Math.max(38, baseDist * 0.45);
    const effectiveCollider = isSmall ? Math.max(20, baseCollider) : isMedium ? Math.max(11, baseCollider * 0.55) : Math.max(5, baseCollider * 0.28);
    const effectiveCenter = isSmall ? Math.max(0.06, baseCenter * 0.65) : isMedium ? Math.max(0.07, baseCenter * 0.75) : Math.max(0.09, baseCenter * 0.9);

    this.simulation
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(this.links)
          .id(d => d.id)
          .distance(effectiveDist)
          .strength(isSmall ? 0.42 : isMedium ? 0.35 : 0.28)
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
      .subject(event => {
        const node = this.findNodeAtCanvas(event.x, event.y);
        return node || undefined;
      })
      .on('start', event => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        this.draggedNode = node;
        this.hoveredNode = node;
        dragStartX = event.x;
        dragStartY = event.y;
        didDrag = false;
        node.fx = node.x;
        node.fy = node.y;
        this.tooltipEl.hidden = true;
        this.canvas.style.cursor = 'grabbing';
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0.28).restart();
        }
        this.scheduleFrame();
      })
      .on('drag', event => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        if (Math.hypot(event.x - dragStartX, event.y - dragStartY) > 4) {
          didDrag = true;
        }
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
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
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

    // Hover tracking
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.draggedNode || e.buttons !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const hit = this.findNodeAtCanvas(e.clientX - rect.left, e.clientY - rect.top);
      if (hit !== this.hoveredNode) {
        this.hoveredNode = hit;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.updateTooltip();
        this.scheduleFrame();
      } else if (hit) {
        this.updateTooltip();
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      if (this.draggedNode) return;
      if (this.hoveredNode) {
        this.hoveredNode = null;
        this.canvas.style.cursor = 'grab';
        this.updateTooltip();
        this.scheduleFrame();
      }
    });

    // Double-click empty canvas to smoothly fit graph
    this.canvas.addEventListener('dblclick', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const hit = this.findNodeAtCanvas(e.clientX - rect.left, e.clientY - rect.top);
      if (!hit) {
        this.fitToBounds(true);
      }
    });
  }

  private setupObservers() {
    if (typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => {
        this.scheduleFrame();
      });
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
        if (sizeChanged && !this.simulator.userZoomed) {
          this.fitToBounds(false);
        } else {
          this.scheduleFrame();
        }
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

    const w = this.graphContainer.clientWidth || this.canvas.clientWidth || 300;
    const h = this.graphContainer.clientHeight || this.canvas.clientHeight || 256;
    if (!w || !h) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of valid) {
      const r = n.radius + 8;
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r > maxY) maxY = n.y + r;
    }

    const padX = this.isFullscreen ? 88 : 42;
    const padTop = this.isFullscreen ? 76 : 44;
    const padBottom = this.isFullscreen ? 72 : 34;

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const availW = Math.max(60, w - padX * 2);
    const availH = Math.max(60, h - padTop - padBottom);

    const maxFitScale = valid.length <= 2 ? 1.1 : this.isFullscreen ? 1.35 : 1.08;
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
      (sel as any)
        .transition()
        .duration(280)
        .call(this.zoomBehavior.transform, target);
    } else {
      sel.call(this.zoomBehavior.transform, target);
    }
    this.transform = target;
    this.scheduleFrame();
  }

  private updateTooltip() {
    if (!this.tooltipEl) return;
    const n = this.hoveredNode;
    if (!n || this.draggedNode) {
      this.tooltipEl.hidden = true;
      return;
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const dotColor = isDark ? n.darkColor : n.lightColor;
    const connText = n.degree === 0 ? 'بدون پیوند' : `${toPersianDigits(n.degree)} ارتباط`;
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
      ${sloganHtml}
    `;
    this.tooltipEl.hidden = false;

    const w = this.graphContainer.clientWidth || 300;
    const h = this.graphContainer.clientHeight || 256;
    const sx = n.x * this.transform.k + this.transform.x;
    const sy = n.y * this.transform.k + this.transform.y;
    const tipW = this.tooltipEl.offsetWidth || 210;
    const tipH = this.tooltipEl.offsetHeight || 58;
    const margin = 10;
    const nodeOffset = n.radius * this.transform.k + 12;

    let left = sx - tipW / 2;
    if (left < margin) left = margin;
    if (left + tipW > w - margin) left = Math.max(margin, w - tipW - margin);

    let top = sy - nodeOffset - tipH;
    const topSafe = this.isFullscreen ? 56 : 44;
    if (top < topSafe) {
      top = sy + nodeOffset;
    }
    if (top + tipH > h - margin) {
      top = Math.max(margin, h - tipH - margin);
    }

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
    if (needsMore) {
      this.scheduleFrame();
    }
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

    // Determine focus mode (hover, active legend filter, or active search)
    const hasFilter = !!(this.hoveredNode || this.activeKindFilter || this.searchQuery);
    const targetHoverMix = hasFilter ? 1 : 0;
    const lerpSpeed = this.prefersReducedMotion ? 1 : 0.24;
    let needsMoreFrames = false;

    if (Math.abs(this.hoverMix - targetHoverMix) > 0.005) {
      this.hoverMix += (targetHoverMix - this.hoverMix) * lerpSpeed;
      needsMoreFrames = true;
    } else {
      this.hoverMix = targetHoverMix;
    }

    // Build highlighted node set
    const highlighted = new Set<string>();
    if (this.hoveredNode) {
      highlighted.add(this.hoveredNode.id);
      const neighbors = this.adjacency.get(this.hoveredNode.id);
      if (neighbors) {
        for (const nb of neighbors) highlighted.add(nb);
      }
    } else if (this.searchQuery) {
      for (const id of this.searchMatches) highlighted.add(id);
    } else if (this.activeKindFilter) {
      for (const n of this.nodes) {
        if (n.kind === this.activeKindFilter) highlighted.add(n.id);
      }
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Subtle spatial dot-grid backdrop (screen-locked with gentle parallax feel)
    const gridSpacing = Math.max(18, Math.min(36, 26 * Math.sqrt(Math.max(0.35, Math.min(2, k)))));
    const ox = ((tx % gridSpacing) + gridSpacing) % gridSpacing;
    const oy = ((ty % gridSpacing) + gridSpacing) % gridSpacing;
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.055)';
    for (let gx = ox; gx < w; gx += gridSpacing) {
      for (let gy = oy; gy < h; gy += gridSpacing) {
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }

    // World-space transform for links & nodes
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const accentHex = isDark ? '#60a5fa' : '#2563eb';
    const baseEdgeColor = isDark ? '161, 161, 170' : '100, 116, 139';
    const surfaceBg = isDark ? '#1c1c1e' : '#ffffff';
    const showArrows = !!this.config.renderArrows && (k >= 0.45 || this.nodes.length <= 35);
    const invK = 1 / Math.max(0.25, k);

    // 1. Draw non-highlighted links first, then highlighted links on top
    const drawLinkPass = (highlightPass: boolean) => {
      for (const link of this.links) {
        const s = link.source;
        const t = link.target;
        const isAdjLink =
          this.hoveredNode !== null
            ? s === this.hoveredNode || t === this.hoveredNode
            : hasFilter && highlighted.has(s.id) && highlighted.has(t.id);

        if (highlightPass !== isAdjLink) continue;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;

        const ux = dx / dist;
        const uy = dy / dist;
        const sx = s.x + ux * (s.radius + 1.5);
        const sy = s.y + uy * (s.radius + 1.5);
        const ex = t.x - ux * (t.radius + 1.8);
        const ey = t.y - uy * (t.radius + 1.8);

        if (dist <= s.radius + t.radius + 3) continue;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);

        if (highlightPass) {
          const alpha = 0.35 + 0.55 * this.hoverMix;
          ctx.strokeStyle = rgba(accentHex, alpha);
          ctx.lineWidth = Math.min(2.4, Math.max(1.2, 1.65 * invK));
        } else {
          const normalAlpha = this.nodes.length > 120 ? 0.16 : 0.28;
          const fadedAlpha = Math.max(0.05, normalAlpha * (1 - 0.78 * this.hoverMix));
          ctx.strokeStyle = `rgba(${baseEdgeColor}, ${fadedAlpha.toFixed(3)})`;
          ctx.lineWidth = Math.min(1.5, Math.max(0.7, 1.05 * invK));
        }
        ctx.stroke();

        // Crisp miniature arrowheads
        if (showArrows && (highlightPass || this.nodes.length <= 120 || k > 0.9)) {
          const headLen = Math.min(7.5, Math.max(4.2, (highlightPass ? 6.8 : 5.2) * Math.sqrt(invK)));
          const angle = Math.atan2(dy, dx);
          const drawHead = (tipX: number, tipY: number, ang: number) => {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - headLen * Math.cos(ang - 0.44), tipY - headLen * Math.sin(ang - 0.44));
            ctx.lineTo(tipX - headLen * Math.cos(ang + 0.44), tipY - headLen * Math.sin(ang + 0.44));
            ctx.closePath();
            ctx.fillStyle = ctx.strokeStyle as string;
            ctx.fill();
          };
          drawHead(ex, ey, angle);
          if (link.bidirectional && highlightPass) {
            drawHead(sx, sy, angle + Math.PI);
          }
        }
      }
    };

    drawLinkPass(false);
    if (this.hoverMix > 0.01) drawLinkPass(true);

    // 2. Draw nodes (dimmed first, then active/current/hovered on top)
    const drawNode = (n: GraphNode) => {
      const isHovered = n === this.hoveredNode;
      const isActive = !hasFilter || highlighted.has(n.id);
      const targetScale = isHovered ? 1.24 : 1;
      if (Math.abs(n.hoverScale - targetScale) > 0.005) {
        n.hoverScale += (targetScale - n.hoverScale) * lerpSpeed;
        needsMoreFrames = true;
      } else {
        n.hoverScale = targetScale;
      }

      const r = n.radius * n.hoverScale;
      const fillHex = isDark ? n.darkColor : n.lightColor;
      const nodeAlpha = isActive ? 1 : 1 - 0.82 * this.hoverMix;

      // Soft outer halo for current node or hovered node
      if ((n.isCurrent || isHovered) && nodeAlpha > 0.3) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + (isHovered ? 6 : 5), 0, Math.PI * 2);
        ctx.fillStyle = rgba(fillHex, isHovered ? 0.22 : isDark ? 0.18 : 0.14);
        ctx.fill();

        if (n.isCurrent) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.2, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(fillHex, 0.72);
          ctx.lineWidth = Math.min(2, Math.max(1.1, 1.5 * invK));
          ctx.stroke();
        }
      }

      // Surface separator ring so incoming edges never look muddy against node edge
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = surfaceBg;
      ctx.fill();

      // Core node disc
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(fillHex, nodeAlpha);
      ctx.fill();

      // Crisp subtle border on hover or current
      if (isHovered) {
        ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.lineWidth = Math.min(2.2, Math.max(1.2, 1.8 * invK));
        ctx.stroke();
      }
    };

    for (const n of this.nodes) {
      if (!n.isCurrent && n !== this.hoveredNode && (!hasFilter || !highlighted.has(n.id))) {
        drawNode(n);
      }
    }
    for (const n of this.nodes) {
      if (hasFilter && highlighted.has(n.id) && !n.isCurrent && n !== this.hoveredNode) {
        drawNode(n);
      }
    }
    const currentNode = this.nodes.find(n => n.isCurrent);
    if (currentNode && currentNode !== this.hoveredNode) drawNode(currentNode);
    if (this.hoveredNode) drawNode(this.hoveredNode);

    ctx.restore(); // Exit world transform -> draw crisp screen-space labels!

    // 3. Zero-Overlap Screen-Space Intelligent Label Engine
    if (this.config.renderLabels) {
      const placed: Rect[] = [
        // Reserve top-left action toolbar area so labels never sit behind buttons
        { x1: 0, y1: 0, x2: 156, y2: 46 },
      ];
      if (this.isFullscreen) {
        // Reserve fullscreen top-right HUD and bottom legend bar
        placed.push({ x1: Math.max(0, w - 420), y1: 0, x2: w, y2: 56 });
        placed.push({ x1: 0, y1: Math.max(0, h - 52), x2: w, y2: h });
      }

      const fontSize = this.isFullscreen ? 12 : 11;
      const regularFont = `500 ${fontSize}px Vazirmatn, system-ui, sans-serif`;
      const boldFont = `600 ${fontSize}px Vazirmatn, system-ui, sans-serif`;
      const labelHeight = fontSize + 5;

      // Determine zoom threshold based on density
      const nCount = this.nodes.length;
      const minZoomForAll =
        nCount <= 14 ? 0.42 : nCount <= 35 ? 0.68 : nCount <= 100 ? 0.92 : this.isFullscreen ? 0.95 : 1.15;

      // Build priority-ordered candidates
      const candidates: Array<{ node: GraphNode; priority: number }> = [];
      for (const n of this.nodes) {
        // Hovered node already has the rich HTML inspector card — skip duplicate canvas label for hoveredNode
        if (n === this.hoveredNode && !this.draggedNode) {
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
        } else if (this.hoveredNode && highlighted.has(n.id)) {
          priority = 800 + n.degree;
        } else if ((this.searchQuery || this.activeKindFilter) && highlighted.has(n.id)) {
          priority = 700 + n.degree;
        } else if (!hasFilter) {
          if (k >= minZoomForAll) {
            priority = 100 + n.degree + (n.kind === 'collection' ? 40 : 0);
          } else if (this.isFullscreen && n.degree >= 10) {
            // Show major hub landmarks in fullscreen overview
            priority = 50 + n.degree;
          }
        }

        if (priority >= 0) {
          candidates.push({ node: n, priority });
        } else {
          if (n.labelAlpha > 0.02) {
            n.labelAlpha *= 1 - lerpSpeed;
            needsMoreFrames = true;
          } else {
            n.labelAlpha = 0;
          }
        }
      }

      candidates.sort((a, b) => b.priority - a.priority);

      const textColor = isDark ? '#f4f4f5' : '#0f172a';
      const mutedTextColor = isDark ? '#cbd5e1' : '#334155';
      const haloColor = isDark ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.92)';

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      const maxLabels = this.isFullscreen ? 42 : 12;
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

        // Try placing below node first, then above node if colliding
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
            // Keep label cleanly inside canvas bounds
            if (rect.x1 < 6 || rect.x2 > w - 6 || rect.y1 < 6 || rect.y2 > h - 6) {
              continue;
            }
            let collides = false;
            for (const p of placed) {
              if (rectsOverlap(rect, p)) {
                collides = true;
                break;
              }
            }
            // Also avoid covering any other node's circle in small/medium graphs
            if (!collides && nCount <= 60) {
              for (const other of this.nodes) {
                if (other === n) continue;
                const ox = other.x * k + tx;
                const oy = other.y * k + ty;
                const or = other.radius * k + 2;
                if (ox + or > rect.x1 && ox - or < rect.x2 && oy + or > rect.y1 && oy - or < rect.y2) {
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
            // Subtle crisp pill behind current node's label
            const pillX = sx - textW / 2 - 6;
            const pillY = chosenY - labelHeight / 2;
            const pillW = textW + 12;
            ctx.fillStyle = isDark ? 'rgba(32, 32, 36, 0.92)' : 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = rgba(isDark ? n.darkColor : n.lightColor, 0.45);
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(pillX, pillY, pillW, labelHeight, 5);
            } else {
              ctx.rect(pillX, pillY, pillW, labelHeight);
            }
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
    }

    ctx.restore();
    return needsMoreFrames;
  }
}
