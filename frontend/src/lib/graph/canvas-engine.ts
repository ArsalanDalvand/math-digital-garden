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
  type ZoomBehavior,
} from 'd3';
import { computeDagLayout } from './dag-layout.ts';
import { buildTypedGraphData, classifyRelation } from './schema.ts';
import {
  DEFAULT_GRAPH_CONFIG,
  type GraphConfig,
  type GraphLink,
  type GraphNode,
  type GraphStats,
  type HoverTarget,
  type LayoutMode,
  type RelationPlaneKey,
  type SitemapEntry,
} from './types.ts';

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

export interface EngineCallbacks {
  onHoverChange?: (hover: HoverTarget) => void;
  onNodeSelect?: (node: GraphNode, event?: MouseEvent) => void;
  onStatsChange?: (stats: GraphStats) => void;
}

export interface EngineStatePatch extends Partial<GraphConfig> {
  isFullscreen?: boolean;
  activeKindFilter?: string | null;
  activePlaneFilter?: RelationPlaneKey | null;
  searchQuery?: string;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [100, 116, 139];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function getEdgeGeometry(link: GraphLink): EdgeGeom | null {
  const s = link.source;
  const t = link.target;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const dist = Math.hypot(dx, dy);
  if (dist < s.radius + t.radius + 4) return null;

  const ux = dx / dist;
  const uy = dy / dist;
  const curve = link.curveOffset;

  if (Math.abs(curve) > 0.5) {
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
    return {
      sx,
      sy,
      cx,
      cy,
      ex,
      ey,
      midX,
      midY,
      endAngle: eAng,
      startAngle: sAng + Math.PI,
      curved: true,
    };
  }

  const sx = s.x + ux * (s.radius + 1.5);
  const sy = s.y + uy * (s.radius + 1.5);
  const ex = t.x - ux * (t.radius + 2);
  const ey = t.y - uy * (t.radius + 2);
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;
  const ang = Math.atan2(dy, dx);
  return {
    sx,
    sy,
    cx: midX,
    cy: midY,
    ex,
    ey,
    midX,
    midY,
    endAngle: ang,
    startAngle: ang + Math.PI,
    curved: false,
  };
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

/**
 * Pure TypeScript D3 force simulation + High-DPI 2D Canvas renderer for the Knowledge Graph.
 * Zero direct HUD/React/DOM construction: emits state/hover updates via callbacks.
 */
export class KnowledgeGraphEngine {
  private config: GraphConfig = { ...DEFAULT_GRAPH_CONFIG };
  private sitemap: Record<string, SitemapEntry> = {};
  private currentPage: string;
  private callbacks: EngineCallbacks;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasController: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private typedLinkCount = 0;
  private simulation: Simulation<GraphNode, GraphLink> | null = null;
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  private dragBehavior: DragBehavior<HTMLCanvasElement, unknown, GraphNode | unknown> | null = null;

  private transform: ZoomTransform = zoomIdentity;
  private userZoomed = false;
  private hoveredNode: GraphNode | null = null;
  private hoveredLink: GraphLink | null = null;
  private pointerScreenX = 0;
  private pointerScreenY = 0;
  private draggedNode: GraphNode | null = null;

  private isDark = false;
  private isFullscreen = false;
  private activeKindFilter: string | null = null;
  private activePlaneFilter: RelationPlaneKey | null = null;
  private searchQuery = '';
  private searchMatches = new Set<string>();

  private layoutAnim: {
    startTime: number;
    duration: number;
    from: Map<string, { x: number; y: number }>;
    to: Map<string, { x: number; y: number }>;
  } | null = null;

  private hoverMix = 0;
  private rafId = 0;
  private running = false;
  private prefersReducedMotion = false;
  private lastViewportW = 0;
  private lastViewportH = 0;
  private labelWidthCache = new Map<string, number>();

  constructor(currentPage: string, callbacks: EngineCallbacks = {}, initialConfig: Partial<GraphConfig> = {}) {
    this.currentPage = currentPage.replace(/^\/+/, '').replace(/\/+$/, '');
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_GRAPH_CONFIG, ...initialConfig };
    this.prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  public setDarkMode(dark: boolean) {
    if (this.isDark === dark) return;
    this.isDark = dark;
    this.scheduleFrame();
  }

  public attachCanvas(canvas: HTMLCanvasElement | null) {
    if (this.canvas === canvas) return;
    this.detachCanvas();
    this.canvas = canvas;
    if (!canvas) return;

    this.ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.canvasController = new AbortController();
    this.setupInteractions(canvas, this.canvasController.signal);
    this.setupResizeObserver(canvas);
    this.syncCanvasSize();
    if (this.nodes.length > 0) {
      this.fitToBounds(false);
      this.scheduleFrame();
    }
  }

  private detachCanvas() {
    this.canvasController?.abort();
    this.canvasController = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.canvas) {
      select(this.canvas).on('.zoom', null).on('.drag', null);
    }
    this.canvas = null;
    this.ctx = null;
    this.zoomBehavior = null;
    this.dragBehavior = null;
  }

  public setSitemap(sitemap: Record<string, SitemapEntry>, currentPage?: string) {
    if (currentPage !== undefined) {
      this.currentPage = currentPage.replace(/^\/+/, '').replace(/\/+$/, '');
    }
    this.sitemap = sitemap;
    this.rebuildSubgraph();
  }

  public updateState(patch: EngineStatePatch) {
    const prevDepth = this.config.depth;
    const prevExternal = this.config.renderExternal;
    const prevLayout = this.config.layoutMode;
    const prevTyped = this.config.typedOnly;
    const prevRepel = this.config.repelForce;
    const prevLinkDist = this.config.linkDistance;
    const prevCollider = this.config.colliderPadding;
    const prevCenter = this.config.centerForce;

    if (patch.depth !== undefined) this.config.depth = patch.depth;
    if (patch.renderExternal !== undefined) this.config.renderExternal = patch.renderExternal;
    if (patch.renderLabels !== undefined) this.config.renderLabels = patch.renderLabels;
    if (patch.renderArrows !== undefined) this.config.renderArrows = patch.renderArrows;
    if (patch.typedOnly !== undefined) this.config.typedOnly = patch.typedOnly;
    if (patch.layoutMode !== undefined) this.config.layoutMode = patch.layoutMode;
    if (patch.repelForce !== undefined) this.config.repelForce = patch.repelForce;
    if (patch.colliderPadding !== undefined) this.config.colliderPadding = patch.colliderPadding;
    if (patch.linkDistance !== undefined) this.config.linkDistance = patch.linkDistance;
    if (patch.centerForce !== undefined) this.config.centerForce = patch.centerForce;
    if (patch.isFullscreen !== undefined) this.isFullscreen = patch.isFullscreen;
    if (patch.activeKindFilter !== undefined) this.activeKindFilter = patch.activeKindFilter;
    if (patch.activePlaneFilter !== undefined) this.activePlaneFilter = patch.activePlaneFilter;

    if (patch.searchQuery !== undefined) {
      this.searchQuery = patch.searchQuery.trim().toLowerCase();
      this.updateSearchMatches();
    }

    if (this.config.depth !== prevDepth || this.config.renderExternal !== prevExternal) {
      if (Object.keys(this.sitemap).length > 0) {
        this.rebuildSubgraph();
        return;
      }
    }

    if (this.config.layoutMode !== prevLayout) {
      if (this.config.layoutMode === 'dag') {
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
    } else if (
      this.config.repelForce !== prevRepel ||
      this.config.linkDistance !== prevLinkDist ||
      this.config.colliderPadding !== prevCollider ||
      this.config.centerForce !== prevCenter
    ) {
      if (this.config.layoutMode === 'force') {
        this.applyForces(true);
      }
    }

    if (this.config.typedOnly !== prevTyped) {
      this.hoveredLink = null;
      this.emitHover();
      this.emitStats();
      if (this.config.layoutMode === 'dag') {
        this.applyDagLayout(true);
        return;
      }
    }

    this.scheduleFrame();
  }

  public getMatchingNodes(query: string): GraphNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.nodes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.kindLabel.toLowerCase().includes(q) ||
        n.slogan.toLowerCase().includes(q),
    );
  }

  public focusNodeById(id: string) {
    const node = this.nodes.find((n) => n.id === id);
    if (node) this.focusNode(node);
  }

  public getStats(): GraphStats {
    return {
      nodeCount: this.nodes.length,
      linkCount: this.getVisibleLinks().length,
      typedLinkCount: this.typedLinkCount,
    };
  }

  private updateSearchMatches() {
    this.searchMatches.clear();
    if (!this.searchQuery) return;
    for (const n of this.nodes) {
      if (
        n.title.toLowerCase().includes(this.searchQuery) ||
        n.kindLabel.toLowerCase().includes(this.searchQuery) ||
        n.slogan.toLowerCase().includes(this.searchQuery)
      ) {
        this.searchMatches.add(n.id);
      }
    }
  }

  private getVisibleLinks(): GraphLink[] {
    if (!this.config.typedOnly) return this.links;
    return this.links.filter((l) => l.isTyped);
  }

  private emitStats() {
    this.callbacks.onStatsChange?.(this.getStats());
  }

  private emitHover() {
    if (!this.callbacks.onHoverChange) return;
    if (this.draggedNode) {
      this.callbacks.onHoverChange(null);
      return;
    }
    if (this.hoveredNode) {
      const sx = this.hoveredNode.x * this.transform.k + this.transform.x;
      const sy = this.hoveredNode.y * this.transform.k + this.transform.y;
      this.callbacks.onHoverChange({
        type: 'node',
        node: this.hoveredNode,
        screenX: sx,
        screenY: sy,
        directRelation: this.findDirectRelationWithCurrent(this.hoveredNode),
      });
      return;
    }
    if (this.hoveredLink) {
      this.callbacks.onHoverChange({
        type: 'link',
        link: this.hoveredLink,
        screenX: this.pointerScreenX,
        screenY: this.pointerScreenY,
      });
      return;
    }
    this.callbacks.onHoverChange(null);
  }

  private rebuildSubgraph() {
    const built = buildTypedGraphData(
      this.sitemap,
      this.currentPage,
      this.config.depth,
      this.config.renderExternal,
    );
    this.nodes = built.nodes;
    this.links = built.links;
    this.typedLinkCount = built.typedLinkCount;

    if (this.typedLinkCount === 0 && this.config.typedOnly) {
      this.config.typedOnly = false;
    }

    this.userZoomed = false;
    this.hoveredNode = null;
    this.hoveredLink = null;
    this.draggedNode = null;
    this.hoverMix = 0;
    this.layoutAnim = null;
    this.labelWidthCache.clear();
    this.updateSearchMatches();
    this.emitHover();
    this.emitStats();

    this.simulation?.stop();
    this.simulation = forceSimulation<GraphNode>(this.nodes);
    this.applyForces(false);

    if (this.config.layoutMode === 'dag') {
      this.simulation.stop();
      this.syncCanvasSize();
      this.applyDagLayout(false);
      return;
    }

    const currentNode = this.nodes.find((n) => n.isCurrent);
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
    this.fitToBounds(false);
    this.scheduleFrame();
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

    const targetNodes = this.nodes.map((n) => {
      const p = to.get(n.id);
      return p ? { x: p.x, y: p.y, radius: n.radius } : { x: n.x, y: n.y, radius: n.radius };
    });
    this.fitPoints(targetNodes, true);
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
    const effectiveDist = isSmall
      ? Math.max(74, baseDist * 0.9)
      : isMedium
        ? Math.max(58, baseDist * 0.68)
        : Math.max(38, baseDist * 0.45);
    const effectiveCollider = isSmall
      ? Math.max(20, baseCollider)
      : isMedium
        ? Math.max(11, baseCollider * 0.55)
        : Math.max(5, baseCollider * 0.28);
    const effectiveCenter = isSmall
      ? Math.max(0.06, baseCenter * 0.65)
      : isMedium
        ? Math.max(0.07, baseCenter * 0.75)
        : Math.max(0.09, baseCenter * 0.9);

    this.simulation
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(this.links)
          .id((d) => d.id)
          .distance((l) => (l.isTyped ? effectiveDist * 0.92 : effectiveDist * 1.08))
          .strength((l) => (l.isTyped ? (isSmall ? 0.48 : 0.38) : isSmall ? 0.34 : 0.22)),
      )
      .force(
        'charge',
        forceManyBody<GraphNode>()
          .strength(-effectiveRepel)
          .distanceMax(isSmall ? 650 : isMedium ? 480 : 340)
          .theta(n > 120 ? 0.9 : 0.8),
      )
      .force(
        'collide',
        forceCollide<GraphNode>()
          .radius((d) => d.radius + effectiveCollider)
          .strength(0.85)
          .iterations(isSmall ? 3 : 2),
      )
      .force('x', forceX<GraphNode>(0).strength(effectiveCenter))
      .force('y', forceY<GraphNode>(0).strength(effectiveCenter))
      .alphaDecay(this.config.alphaDecay || 0.028);

    if (restart) {
      this.simulation.alpha(0.55).restart();
      this.scheduleFrame();
    }
  }

  private focusNode(node: GraphNode) {
    if (!this.canvas) return;
    const w = this.canvas.parentElement?.clientWidth || this.canvas.clientWidth || 300;
    const h = this.canvas.parentElement?.clientHeight || this.canvas.clientHeight || 256;
    const targetK = Math.max(1.35, Math.min(2.2, this.transform.k));
    const tx = w / 2 - node.x * targetK;
    const ty = h / 2 - node.y * targetK;
    this.hoveredNode = node;
    this.hoveredLink = null;
    this.applyTransform(new ZoomTransform(targetK, tx, ty), true);
    this.emitHover();
    this.scheduleFrame();
  }

  private setupInteractions(canvas: HTMLCanvasElement, signal: AbortSignal) {
    const canvasSel = select(canvas);

    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([this.config.minZoom || 0.08, this.config.maxZoom || 4.5])
      .filter((event) => {
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
      .on('start', (event) => {
        if (
          event.sourceEvent &&
          (event.sourceEvent.type === 'mousedown' || event.sourceEvent.type === 'pointerdown')
        ) {
          canvas.style.cursor = 'grabbing';
        }
      })
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.userZoomed = true;
        this.emitHover();
        this.scheduleFrame();
      })
      .on('end', () => {
        canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
      });

    let dragStartX = 0;
    let dragStartY = 0;
    let didDrag = false;

    this.dragBehavior = drag<HTMLCanvasElement, unknown>()
      .subject((event) => this.findNodeAtCanvas(event.x, event.y) || undefined)
      .on('start', (event) => {
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
        this.emitHover();
        canvas.style.cursor = 'grabbing';
        if (this.config.layoutMode === 'force' && !event.active && this.simulation) {
          this.simulation.alphaTarget(0.28).restart();
        }
        this.scheduleFrame();
      })
      .on('drag', (event) => {
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
      .on('end', (event) => {
        const node = event.subject as GraphNode | undefined;
        if (!node) return;
        if (this.config.layoutMode === 'force') {
          if (!event.active && this.simulation) this.simulation.alphaTarget(0);
          node.fx = null;
          node.fy = null;
        }
        this.draggedNode = null;
        canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';

        if (!didDrag) {
          const src = event.sourceEvent as MouseEvent | undefined;
          if (this.callbacks.onNodeSelect) {
            this.callbacks.onNodeSelect(node, src);
          } else if (node.isCurrent) {
            this.focusNode(node);
          } else if (src && (src.metaKey || src.ctrlKey)) {
            window.open(`/${node.id}`, '_blank', 'noopener');
          } else {
            window.location.href = `/${node.id}`;
          }
        } else {
          this.emitHover();
        }
        this.scheduleFrame();
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvasSel.call(this.dragBehavior as any);
    canvasSel.call(this.zoomBehavior);
    canvas.style.cursor = 'grab';

    canvas.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (this.draggedNode || e.buttons !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        this.pointerScreenX = mx;
        this.pointerScreenY = my;

        const hitNode = this.findNodeAtCanvas(mx, my);
        if (hitNode) {
          const changed = hitNode !== this.hoveredNode || this.hoveredLink !== null;
          this.hoveredNode = hitNode;
          this.hoveredLink = null;
          canvas.style.cursor = 'pointer';
          this.emitHover();
          if (changed) this.scheduleFrame();
          return;
        }

        const hitLink = this.findLinkAtCanvas(mx, my);
        const changed = this.hoveredNode !== null || hitLink !== this.hoveredLink;
        this.hoveredNode = null;
        this.hoveredLink = hitLink;
        canvas.style.cursor = hitLink ? 'help' : 'grab';
        this.emitHover();
        if (changed) this.scheduleFrame();
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerleave',
      () => {
        if (this.draggedNode) return;
        if (this.hoveredNode || this.hoveredLink) {
          this.hoveredNode = null;
          this.hoveredLink = null;
          canvas.style.cursor = 'grab';
          this.emitHover();
          this.scheduleFrame();
        }
      },
      { signal },
    );

    canvas.addEventListener(
      'dblclick',
      (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const hit = this.findNodeAtCanvas(e.clientX - rect.left, e.clientY - rect.top);
        if (!hit) this.fitToBounds(true);
      },
      { signal },
    );
  }

  private setupResizeObserver(canvas: HTMLCanvasElement) {
    const target = canvas.parentElement || canvas;
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      const w = target.clientWidth;
      const h = target.clientHeight;
      if (!w || !h) return;
      const sizeChanged =
        Math.abs(w - this.lastViewportW) > 4 || Math.abs(h - this.lastViewportH) > 4;
      this.syncCanvasSize();
      if (sizeChanged && !this.userZoomed) this.fitToBounds(false);
      else this.scheduleFrame();
    });
    this.resizeObserver.observe(target);
  }

  private clientPointToCanvas(event: {
    touches?: ArrayLike<{ clientX: number; clientY: number }>;
    clientX?: number;
    clientY?: number;
  }): [number, number] | null {
    if (!this.canvas) return null;
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
      const g = getEdgeGeometry(l);
      if (!g) continue;

      const sSx = g.sx * k + tx;
      const sSy = g.sy * k + ty;
      const eSx = g.ex * k + tx;
      const eSy = g.ey * k + ty;
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

      const weighted = l.isTyped ? d2 * 0.75 : d2;
      if (weighted < bestDistSq) {
        bestDistSq = weighted;
        best = l;
      }
    }
    return best;
  }

  public syncCanvasSize() {
    if (!this.canvas) return;
    const host = this.canvas.parentElement;
    const w = host?.clientWidth || this.canvas.clientWidth || 300;
    const h = host?.clientHeight || this.canvas.clientHeight || 256;
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
    this.userZoomed = false;
    const valid = this.nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
    if (!valid.length) return;
    this.fitPoints(valid, animated);
  }

  private fitPoints(points: Array<{ x: number; y: number; radius: number }>, animated: boolean) {
    if (!this.canvas || !points.length) return;
    const host = this.canvas.parentElement;
    const w = host?.clientWidth || this.canvas.clientWidth || 300;
    const h = host?.clientHeight || this.canvas.clientHeight || 256;
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
    const k = Math.max(
      this.config.minZoom || 0.08,
      Math.min(maxFitScale, availW / spanX, availH / spanY),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = w / 2 - cx * k;
    const ty = padTop + availH / 2 - cy * k;

    this.applyTransform(new ZoomTransform(k, tx, ty), animated);
  }

  private applyTransform(target: ZoomTransform, animated: boolean) {
    if (!this.zoomBehavior || !this.canvas) {
      this.transform = target;
      this.scheduleFrame();
      return;
    }

    const sel = select(this.canvas);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (animated && !this.prefersReducedMotion && typeof (sel as any).transition === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (this.layoutAnim) {
      const elapsed = performance.now() - this.layoutAnim.startTime;
      const rawT = Math.min(1, elapsed / this.layoutAnim.duration);
      const ease = 1 - (1 - rawT) ** 3;
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

    const host = this.canvas.parentElement;
    const w = host?.clientWidth || this.canvas.clientWidth || 300;
    const h = host?.clientHeight || this.canvas.clientHeight || 256;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const isDark = this.isDark;
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

    // Dot-grid backdrop
    const gridSpacing = Math.max(18, Math.min(36, 26 * Math.sqrt(Math.max(0.35, Math.min(2, k)))));
    const ox = ((tx % gridSpacing) + gridSpacing) % gridSpacing;
    const oy = ((ty % gridSpacing) + gridSpacing) % gridSpacing;
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.055)';
    for (let gx = ox; gx < w; gx += gridSpacing) {
      for (let gy = oy; gy < h; gy += gridSpacing) {
        ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }

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

        const g = getEdgeGeometry(link);
        if (!g) continue;

        const baseHex = isDark ? link.darkColor : link.lightColor;

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

        if (showArrows && (highlightPass || link.isTyped || this.nodes.length <= 100 || k > 0.9)) {
          const headLen = Math.min(
            8,
            Math.max(4.4, (highlightPass ? 7.2 : link.isTyped ? 5.8 : 4.8) * Math.sqrt(invK)),
          );
          const drawHead = (tipX: number, tipY: number, ang: number) => {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX - headLen * Math.cos(ang - 0.44),
              tipY - headLen * Math.sin(ang - 0.44),
            );
            ctx.lineTo(
              tipX - headLen * Math.cos(ang + 0.44),
              tipY - headLen * Math.sin(ang + 0.44),
            );
            ctx.closePath();
            ctx.fillStyle = rgba(baseHex, Math.min(1, alpha + 0.1));
            ctx.fill();
          };
          drawHead(g.ex, g.ey, g.endAngle);
          if (link.bidirectional && highlightPass) {
            drawHead(g.sx, g.sy, g.startAngle);
          }
        }

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

    const drawNode = (n: GraphNode) => {
      const isHovered = n === this.hoveredNode;
      const isEdgeEndpoint =
        !!this.hoveredLink && (this.hoveredLink.source === n || this.hoveredLink.target === n);
      const isActive =
        (!hasFilter || highlightedNodes.has(n.id)) &&
        (!this.config.typedOnly || typedConnectedNodes.has(n.id));
      const targetScale = isHovered ? 1.24 : isEdgeEndpoint ? 1.15 : 1;
      if (Math.abs(n.hoverScale - targetScale) > 0.005) {
        n.hoverScale += (targetScale - n.hoverScale) * lerpSpeed;
        needsMoreFrames = true;
      } else {
        n.hoverScale = targetScale;
      }

      const r = n.radius * n.hoverScale;
      const fillHex = isDark ? n.darkColor : n.lightColor;
      const nodeAlpha = isActive
        ? 1
        : this.config.typedOnly && !typedConnectedNodes.has(n.id)
          ? 0.16
          : 1 - 0.82 * this.hoverMix;

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
      if (!n.isCurrent && n !== this.hoveredNode && (!hasFilter || !highlightedNodes.has(n.id))) {
        drawNode(n);
      }
    }
    for (const n of this.nodes) {
      if (hasFilter && highlightedNodes.has(n.id) && !n.isCurrent && n !== this.hoveredNode) {
        drawNode(n);
      }
    }
    const currentNode = this.nodes.find((n) => n.isCurrent);
    if (currentNode && currentNode !== this.hoveredNode) drawNode(currentNode);
    if (this.hoveredNode) drawNode(this.hoveredNode);

    ctx.restore();

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
        } else if (
          (this.searchQuery || this.activeKindFilter || this.activePlaneFilter) &&
          highlightedNodes.has(n.id)
        ) {
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
                if (
                  ox2 + or2 > rect.x1 &&
                  ox2 - or2 < rect.x2 &&
                  oy2 + or2 > rect.y1 &&
                  oy2 - or2 < rect.y2
                ) {
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

  public destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.running = false;
    this.simulation?.stop();
    this.simulation = null;
    this.detachCanvas();
  }
}
