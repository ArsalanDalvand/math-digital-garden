import { useStore } from '@nanostores/react';
import { Maximize2, RefreshCw, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { KnowledgeGraphEngine } from '../../lib/graph/canvas-engine.ts';
import { fetchGraphSitemap, LEGEND_ITEMS, toPersianDigits } from '../../lib/graph/schema.ts';
import type {
  GraphNode,
  HoverTarget,
  NeighborSummary,
  PathTraceResult,
} from '../../lib/graph/types.ts';
import {
  $graphUi,
  $theme,
  type GraphUiState,
  resetGraphSettings,
  syncThemeFromDom,
} from '../../stores/garden.ts';
import { GraphFullscreenModal } from './GraphFullscreenModal.tsx';
import { GraphSettingsPopover } from './GraphSettingsPopover.tsx';
import { GraphSummaryStrip } from './GraphSummaryStrip.tsx';
import { GraphTooltip } from './GraphTooltip.tsx';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

interface GraphWidgetProps {
  slug: string;
  graphUrl?: string;
}

const EMPTY_SUMMARY: NeighborSummary = {
  prereqCount: 0,
  dependentCount: 0,
  exerciseCount: 0,
  hiddenHubCount: 0,
};

const EMPTY_TRACE: PathTraceResult = {
  mode: 'off',
  startId: '',
  nodeHops: new Map(),
  highlightedLinkKeys: new Set(),
  orderedSteps: [],
};

export default function GraphWidget({ slug, graphUrl = '/api/graph.json' }: GraphWidgetProps) {
  const state = useStore($graphUi);
  const theme = useStore($theme);
  const isDark = theme === 'dark';

  const [hover, setHover] = useState<HoverTarget>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [summary, setSummary] = useState<NeighborSummary>(EMPTY_SUMMARY);
  const [pathTrace, setPathTrace] = useState<PathTraceResult>(EMPTY_TRACE);

  const inlineContainerRef = useRef<HTMLDivElement | null>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenBtnRef = useRef<HTMLButtonElement | null>(null);
  const engineRef = useRef<KnowledgeGraphEngine | null>(null);
  const wasFullscreenRef = useRef(false);

  const patchState = useCallback((patch: Partial<GraphUiState>) => {
    $graphUi.set({ ...$graphUi.get(), ...patch });
  }, []);

  if (!engineRef.current) {
    const initial = $graphUi.get();
    engineRef.current = new KnowledgeGraphEngine(
      slug,
      {
        onHoverChange: (nextHover) => setHover(nextHover),
        onStatsChange: (stats) => {
          const prev = $graphUi.get();
          if (
            prev.nodeCount !== stats.nodeCount ||
            prev.linkCount !== stats.linkCount ||
            prev.typedLinkCount !== stats.typedLinkCount ||
            prev.hiddenHubCount !== stats.hiddenHubCount
          ) {
            $graphUi.set({ ...prev, ...stats });
          }
        },
        onSummaryChange: (nextSummary) => setSummary(nextSummary),
        onPathTraceChange: (nextTrace) => setPathTrace(nextTrace),
        onBackgroundClick: () => {
          const cur = $graphUi.get();
          if (cur.isFullscreen && cur.selectedNodeId) {
            $graphUi.set({ ...cur, selectedNodeId: null });
          }
        },
        onNodeSelect: (node, event) => {
          const cur = $graphUi.get();
          if (cur.isFullscreen && !(event && (event.metaKey || event.ctrlKey))) {
            setHover(null);
            $graphUi.set({ ...cur, selectedNodeId: node.id, settingsOpen: false });
            return;
          }
          const href = `/${node.id}`;
          if (event && (event.metaKey || event.ctrlKey)) {
            window.open(href, '_blank', 'noopener');
          } else {
            window.location.assign(href);
          }
        },
      },
      {
        depth: initial.depth,
        layoutMode: initial.layoutMode,
        typedOnly: initial.typedOnly,
        showHubsAndRaw: initial.showHubsAndRaw,
        colorBy: initial.colorBy,
        pathTraceMode: initial.pathTraceMode,
        renderArrows: initial.renderArrows,
        renderLabels: initial.renderLabels,
        repelForce: initial.repelForce,
        colliderPadding: initial.colliderPadding,
        linkDistance: initial.linkDistance,
        centerForce: initial.centerForce,
      },
    );
  }

  useEffect(() => {
    syncThemeFromDom();
    const engine = engineRef.current;
    return () => {
      if (typeof document !== 'undefined') {
        delete document.body.dataset.graphBlur;
      }
      $graphUi.set({
        ...$graphUi.get(),
        isFullscreen: false,
        settingsOpen: false,
        selectedNodeId: null,
        pivotSlug: '',
      });
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const engine = engineRef.current;
    if (!engine) return;

    patchState({ status: 'loading', errorMessage: '', pivotSlug: '', selectedNodeId: null });

    fetchGraphSitemap(graphUrl)
      .then((sitemap) => {
        if (cancelled || !engineRef.current) return;
        engineRef.current.setSitemap(sitemap, slug);
        const stats = engineRef.current.getStats();
        setSummary(engineRef.current.getNeighborSummary());
        setPathTrace(engineRef.current.getPathTrace());
        patchState({
          ...stats,
          status: 'ready',
          errorMessage: '',
        });
      })
      .catch(() => {
        if (cancelled) return;
        patchState({
          status: 'error',
          errorMessage: 'بارگذاری گراف ارتباط یادداشت‌ها انجام نشد.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [graphUrl, slug, reloadTick, patchState]);

  useEffect(() => {
    engineRef.current?.setDarkMode(isDark);
  }, [isDark]);

  useEffect(() => {
    engineRef.current?.updateState({
      depth: state.depth,
      layoutMode: state.layoutMode,
      typedOnly: state.typedOnly,
      showHubsAndRaw: state.showHubsAndRaw,
      colorBy: state.colorBy,
      pathTraceMode: state.pathTraceMode,
      renderArrows: state.renderArrows,
      renderLabels: state.renderLabels,
      repelForce: state.repelForce,
      colliderPadding: state.colliderPadding,
      linkDistance: state.linkDistance,
      centerForce: state.centerForce,
      isFullscreen: state.isFullscreen,
      activeKindFilter: state.activeKindFilter,
      activePlaneFilter: state.activePlaneFilter,
      searchQuery: state.searchQuery,
      selectedNodeId: state.selectedNodeId,
      pivotSlug: state.pivotSlug || slug,
    });
  }, [
    slug,
    state.depth,
    state.layoutMode,
    state.typedOnly,
    state.showHubsAndRaw,
    state.colorBy,
    state.pathTraceMode,
    state.renderArrows,
    state.renderLabels,
    state.repelForce,
    state.colliderPadding,
    state.linkDistance,
    state.centerForce,
    state.isFullscreen,
    state.activeKindFilter,
    state.activePlaneFilter,
    state.searchQuery,
    state.selectedNodeId,
    state.pivotSlug,
  ]);

  const attachInlineCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    inlineCanvasRef.current = canvas;
    if (!$graphUi.get().isFullscreen && canvas) {
      engineRef.current?.attachCanvas(canvas);
    }
  }, []);

  const attachModalCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    modalCanvasRef.current = canvas;
    if ($graphUi.get().isFullscreen && canvas) {
      engineRef.current?.attachCanvas(canvas);
    }
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const targetCanvas = state.isFullscreen ? modalCanvasRef.current : inlineCanvasRef.current;
    if (targetCanvas) {
      engine.attachCanvas(targetCanvas);
    }

    if (typeof document !== 'undefined') {
      if (state.isFullscreen) {
        document.body.dataset.graphBlur = 'true';
      } else {
        delete document.body.dataset.graphBlur;
      }
    }

    const frame = requestAnimationFrame(() => {
      engine.syncCanvasSize();
      engine.fitToBounds(false);
    });

    if (wasFullscreenRef.current && !state.isFullscreen) {
      fullscreenBtnRef.current?.focus();
    }
    wasFullscreenRef.current = state.isFullscreen;

    return () => cancelAnimationFrame(frame);
  }, [state.isFullscreen]);

  const closeFullscreen = useCallback(() => {
    setHover(null);
    patchState({ isFullscreen: false, settingsOpen: false, selectedNodeId: null });
  }, [patchState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const cur = $graphUi.get();
      if (cur.settingsOpen) {
        event.preventDefault();
        patchState({ settingsOpen: false });
        return;
      }
      if (cur.isFullscreen && cur.selectedNodeId) {
        event.preventDefault();
        patchState({ selectedNodeId: null });
        return;
      }
      if (cur.isFullscreen && cur.searchQuery) {
        event.preventDefault();
        patchState({ searchQuery: '' });
        return;
      }
      if (cur.isFullscreen) {
        event.preventDefault();
        closeFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [patchState, closeFullscreen]);

  const handleFitToBounds = useCallback(() => {
    engineRef.current?.fitToBounds(true);
  }, []);

  const handleFocusFirstMatch = useCallback(() => {
    const matches = engineRef.current?.getMatchingNodes($graphUi.get().searchQuery) || [];
    if (matches.length > 0) {
      engineRef.current?.focusNodeById(matches[0].id);
    }
  }, []);

  const handleSelectAndFocusNode = useCallback(
    (nodeId: string) => {
      setHover(null);
      patchState({ selectedNodeId: nodeId, settingsOpen: false });
      engineRef.current?.focusNodeById(nodeId);
    },
    [patchState],
  );

  const handlePivotNode = useCallback(
    (nodeId: string) => {
      setHover(null);
      patchState({
        pivotSlug: nodeId,
        selectedNodeId: null,
        depth: Math.max($graphUi.get().depth, 1),
      });
    },
    [patchState],
  );

  const handleResetPivot = useCallback(() => {
    setHover(null);
    patchState({ pivotSlug: '', selectedNodeId: null });
  }, [patchState]);

  const engineNodes: GraphNode[] = engineRef.current?.getNodes() || [];
  const selectedNode = state.selectedNodeId
    ? (engineNodes.find((n) => n.id === state.selectedNodeId) ?? null)
    : null;
  const nodeConnections = selectedNode
    ? (engineRef.current?.getNodeConnections(selectedNode.id) ?? { incoming: [], outgoing: [] })
    : { incoming: [], outgoing: [] };
  const effectivePivot = state.pivotSlug || slug;
  const isPivoted = Boolean(state.pivotSlug && state.pivotSlug !== slug);
  const pivotNode = engineNodes.find((n) => n.id === effectivePivot || n.isCurrent);
  const pivotTitle = pivotNode?.title || effectivePivot.replace(/^notes\//, '');

  const inlineContainerRect = inlineContainerRef.current?.getBoundingClientRect() ?? null;
  const readyAttr = state.status === 'ready' ? 'true' : state.status;

  return (
    <section
      data-note-graph=""
      className="note-graph"
      aria-label="گراف ارتباط یادداشت‌ها"
      data-graph-ready={readyAttr}
      data-node-count={String(state.nodeCount)}
      data-link-count={String(state.linkCount)}
      data-typed-link-count={String(state.typedLinkCount)}
      data-hidden-hub-count={String(state.hiddenHubCount)}
      data-depth-active={String(state.depth)}
      data-layout-mode={state.layoutMode}
      data-color-by={state.colorBy}
      data-path-trace-mode={state.pathTraceMode}
      data-pivot-slug={effectivePivot}
      data-typed-only={String(state.typedOnly)}
    >
      <div className="note-graph-header">
        <h2>گراف ارتباط</h2>
        <fieldset className="graph-depth-quickbar" aria-label="عمق نمایش همسایگی گراف">
          <span className="depth-label">عمق:</span>
          {[1, 2, 5].map((depth) => (
            <button
              key={depth}
              type="button"
              className={`depth-chip${state.depth === depth ? ' active' : ''}`}
              data-depth={String(depth)}
              aria-pressed={state.depth === depth}
              onClick={() => patchState({ depth })}
            >
              {depth === 5 ? 'همه' : toPersianDigits(depth)}
            </button>
          ))}
        </fieldset>
      </div>

      {state.status === 'ready' && (
        <GraphSummaryStrip
          summary={summary}
          showHubsAndRaw={state.showHubsAndRaw}
          onTracePrerequisites={() => {
            setHover(null);
            patchState({
              isFullscreen: true,
              settingsOpen: false,
              pathTraceMode: 'prerequisites',
              depth: Math.max(state.depth, 2),
            });
          }}
          onTraceImpact={() => {
            setHover(null);
            patchState({
              isFullscreen: true,
              settingsOpen: false,
              pathTraceMode: 'impact',
              depth: Math.max(state.depth, 2),
            });
          }}
          onFilterExercises={() => {
            setHover(null);
            patchState({
              isFullscreen: true,
              settingsOpen: false,
              activeKindFilter: 'problem',
            });
          }}
          onRevealHubs={() => patchState({ showHubsAndRaw: true })}
        />
      )}

      <p
        role="status"
        data-graph-status=""
        hidden={state.status === 'idle' || state.status === 'ready'}
        className="text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2"
      >
        {state.status === 'loading' && <span>در حال آماده‌سازی گراف دانش…</span>}
        {state.status === 'error' && (
          <>
            <span className="text-destructive">{state.errorMessage}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border text-xs text-foreground hover:bg-accent"
              onClick={() => setReloadTick((tick) => tick + 1)}
            >
              <RefreshCw size={11} aria-hidden="true" />
              <span>تلاش مجدد</span>
            </button>
          </>
        )}
      </p>

      <div className="graph-stage-slot" data-graph-slot="">
        <div
          ref={inlineContainerRef}
          className="kg-container slsg-graph-container"
          data-layout-mode={state.layoutMode}
        >
          <div className="kg-actions slsg-graph-action-container">
            <button
              type="button"
              className="kg-action-btn slsg-graph-action-button"
              data-graph-action="reset-zoom"
              aria-label="تنظیم مجدد بزرگ‌نمایی"
              title="تنظیم مجدد بزرگ‌نمایی"
              onClick={handleFitToBounds}
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`kg-action-btn slsg-graph-action-button${state.settingsOpen ? ' is-active' : ''}`}
              data-graph-action="settings"
              aria-label="تنظیمات گراف"
              aria-expanded={state.settingsOpen}
              title="تنظیمات گراف"
              onClick={() => patchState({ settingsOpen: !state.settingsOpen })}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
            </button>
            <button
              ref={fullscreenBtnRef}
              type="button"
              className={`kg-action-btn slsg-graph-action-button${state.isFullscreen ? ' is-active' : ''}`}
              data-graph-action="fullscreen"
              aria-label="باز کردن نمای تمام‌صفحه گراف"
              title="نمای تمام‌صفحه"
              onClick={() => {
                setHover(null);
                patchState({ isFullscreen: true, settingsOpen: false });
              }}
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          </div>

          {!state.isFullscreen && <canvas ref={attachInlineCanvas} className="kg-canvas" />}

          {!state.isFullscreen && (
            <GraphTooltip
              hover={hover}
              isDark={isDark}
              isFullscreen={false}
              containerRect={inlineContainerRect}
            />
          )}

          {!state.isFullscreen && (
            <GraphSettingsPopover
              open={state.settingsOpen}
              state={state}
              onPatch={patchState}
              onReset={resetGraphSettings}
              onClose={() => patchState({ settingsOpen: false })}
            />
          )}
        </div>
      </div>

      <section
        className="graph-umko-legend"
        data-graph-legend=""
        aria-label="فیلتر بر اساس نوع UMKO"
      >
        {LEGEND_ITEMS.map((item) => {
          const active = state.activeKindFilter === item.kind;
          const badgeColor = isDark ? item.dark : item.light;
          return (
            <button
              key={item.kind}
              type="button"
              className={`legend-badge${active ? ' is-active' : ''}`}
              data-legend-kind={item.kind}
              aria-pressed={active}
              style={{ '--badge-c': badgeColor } as CSSProperties}
              onClick={() => patchState({ activeKindFilter: active ? null : item.kind })}
            >
              <NodeShapeGlyph shape={item.shape} color={badgeColor} size={10} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </section>

      <GraphFullscreenModal
        state={state}
        isDark={isDark}
        hover={hover}
        nodes={engineNodes}
        pathTrace={pathTrace}
        selectedNode={selectedNode}
        selectedConnections={nodeConnections}
        isPivoted={isPivoted}
        pivotSlug={effectivePivot}
        pivotTitle={pivotTitle}
        onCanvasRef={attachModalCanvas}
        onPatch={patchState}
        onResetSettings={resetGraphSettings}
        onFitToBounds={handleFitToBounds}
        onFocusFirstMatch={handleFocusFirstMatch}
        onSelectNode={handleSelectAndFocusNode}
        onPivot={handlePivotNode}
        onResetPivot={handleResetPivot}
        onCloseFullscreen={closeFullscreen}
      />
    </section>
  );
}
