import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Compass,
  Crosshair,
  GitBranch,
  Layers,
  Minimize2,
  PinOff,
  Play,
  RotateCcw,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { type CSSProperties, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getColorLensLegend, isLensMonochrome } from '../../lib/graph/color-lens.ts';
import { findMissingPrerequisites } from '../../lib/graph/mastery.ts';
import { PLANE_FILTER_ITEMS, toPersianDigits } from '../../lib/graph/schema.ts';
import type {
  ColorByMode,
  GraphNode,
  HoverTarget,
  MasteryStatus,
  PathTraceMode,
  PathTraceResult,
  SafeAreaInsets,
  ShortestPathResult,
  SitemapEntry,
  TheoremAnatomyResult,
} from '../../lib/graph/types.ts';
import type { GraphUiState } from '../../stores/garden.ts';
import { GraphBridgePanel } from './GraphBridgePanel.tsx';
import { GraphPracticePanel } from './GraphPracticePanel.tsx';
import { GraphQuickPeekDrawer, type NoteConnectionItem } from './GraphQuickPeekDrawer.tsx';
import { GraphSettingsPopover } from './GraphSettingsPopover.tsx';
import { GraphTooltip } from './GraphTooltip.tsx';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

interface GraphFullscreenModalProps {
  state: GraphUiState;
  isDark: boolean;
  hover: HoverTarget;
  nodes: GraphNode[];
  sitemap: Record<string, SitemapEntry>;
  pathTrace: PathTraceResult;
  shortestPath: ShortestPathResult | null;
  theoremAnatomy: TheoremAnatomyResult | null;
  selectedNode: GraphNode | null;
  selectedConnections: {
    incoming: NoteConnectionItem[];
    outgoing: NoteConnectionItem[];
  };
  isPivoted: boolean;
  pivotSlug: string;
  pivotTitle: string;
  onCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onPatch: (patch: Partial<GraphUiState>) => void;
  onResetSettings: () => void;
  onFitToBounds: () => void;
  onFocusFirstMatch: () => void;
  onSelectNode: (nodeId: string) => void;
  onPivot: (nodeId: string) => void;
  onResetPivot: () => void;
  onSafeAreaChange: (insets: SafeAreaInsets) => void;
  onUnpinAll: () => void;
  onSetMastery: (nodeId: string, status: MasteryStatus) => void;
  onCloseFullscreen: () => void;
}

export function GraphFullscreenModal({
  state,
  isDark,
  hover,
  nodes,
  sitemap,
  pathTrace,
  shortestPath,
  selectedNode,
  selectedConnections,
  isPivoted,
  pivotSlug,
  pivotTitle,
  onCanvasRef,
  onPatch,
  onResetSettings,
  onFitToBounds,
  onFocusFirstMatch,
  onSelectNode,
  onPivot,
  onResetPivot,
  onSafeAreaChange,
  onUnpinAll,
  onSetMastery,
  onCloseFullscreen,
}: GraphFullscreenModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topStackRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  const measureSafeArea = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return;

    const topH = topStackRef.current ? topStackRef.current.offsetHeight + 16 : 64;
    const botH = legendRef.current ? legendRef.current.offsetHeight + 18 : 64;
    const isNarrow = w <= 900;
    const leftW = !isNarrow && leftPanelRef.current ? leftPanelRef.current.offsetWidth + 20 : 18;
    const rightW = !isNarrow && rightPanelRef.current ? rightPanelRef.current.offsetWidth + 20 : 18;

    root.style.setProperty('--kg-safe-top', `${Math.round(topH)}px`);
    root.style.setProperty('--kg-safe-bot', `${Math.round(botH)}px`);

    onSafeAreaChange({
      top: Math.round(topH),
      bottom: Math.round(botH),
      left: Math.round(leftW),
      right: Math.round(rightW),
    });
  }, [onSafeAreaChange]);

  useLayoutEffect(() => {
    if (!state.isFullscreen) return;
    measureSafeArea();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureSafeArea());
    for (const el of [
      containerRef.current,
      topStackRef.current,
      legendRef.current,
      leftPanelRef.current,
      rightPanelRef.current,
    ]) {
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [
    state.isFullscreen,
    state.pathTraceMode,
    state.bridgePanelOpen,
    state.practiceListOpen,
    state.layoutMode,
    state.dagOrientation,
    state.colorBy,
    isPivoted,
    Boolean(selectedNode),
    measureSafeArea,
  ]);

  if (!state.isFullscreen || typeof document === 'undefined') {
    return null;
  }

  const containerRect = containerRef.current?.getBoundingClientRect() ?? null;
  const statsText = `${toPersianDigits(state.nodeCount)} گره · ${toPersianDigits(state.linkCount)} پیوند`;
  const legendEntries = getColorLensLegend(nodes, state.colorBy, isDark, state.masteryMap);
  const monochromeHint =
    (state.colorBy === 'level' || state.colorBy === 'chapter') &&
    nodes.length > 1 &&
    isLensMonochrome(legendEntries);

  const checklist =
    pathTrace.studyChecklist && pathTrace.studyChecklist.length > 0
      ? pathTrace.studyChecklist
      : pathTrace.orderedSteps;
  const masteredCount = checklist.filter((s) => state.masteryMap[s.nodeId] === 'mastered').length;
  const missingSteps =
    state.pathTraceMode === 'prerequisites'
      ? findMissingPrerequisites(pathTrace, state.masteryMap)
      : [];

  const showBridgePanel = state.bridgePanelOpen;
  const showPracticePanel = !showBridgePanel && state.practiceListOpen;
  const showStudyPath = !showBridgePanel && !showPracticePanel && state.pathTraceMode !== 'off';

  const centerNode = nodes.find((n) => n.id === pivotSlug || n.isCurrent);
  const hasTheoremStructure =
    centerNode?.kind === 'assertion' ||
    nodes.some((n) => n.kind === 'proof' || n.kind === 'counterexample');

  return createPortal(
    <div className="kg-fullscreen-portal note-graph">
      <div
        className="kg-backdrop slsg-background-blur"
        aria-hidden="true"
        onClick={onCloseFullscreen}
      />

      <div
        ref={containerRef}
        className="kg-container slsg-graph-container slsg-is-fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label="نمای تمام‌صفحه گراف دانش"
        data-layout-mode={state.layoutMode}
        data-dag-orientation={state.dagOrientation}
        data-color-by={state.colorBy}
        data-path-trace-mode={state.pathTraceMode}
        data-pivot-slug={pivotSlug}
        data-pinned-count={String(state.pinnedCount)}
      >
        <div ref={topStackRef} className="kg-fs-top-stack">
          <div className="kg-fs-hud" data-graph-hud>
            <div className="kg-fs-search-wrap">
              <Search className="kg-fs-search-icon" size={14} aria-hidden="true" />
              <input
                type="search"
                className="kg-fs-search"
                placeholder="جستجو در گراف…"
                aria-label="جستجو در گراف"
                value={state.searchQuery}
                onChange={(e) => onPatch({ searchQuery: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onFocusFirstMatch();
                  } else if (e.key === 'Escape' && state.searchQuery) {
                    e.preventDefault();
                    e.stopPropagation();
                    onPatch({ searchQuery: '' });
                  }
                }}
              />
            </div>

            <fieldset className="kg-fs-group" aria-label="تنظیم عمق گراف">
              {[1, 2, 5].map((depth) => (
                <button
                  key={depth}
                  type="button"
                  className={`kg-fs-chip${state.depth === depth ? ' active' : ''}`}
                  data-depth={String(depth)}
                  aria-pressed={state.depth === depth}
                  onClick={() => onPatch({ depth })}
                >
                  {depth === 5 ? 'همه' : `${toPersianDigits(depth)} گام`}
                </button>
              ))}
            </fieldset>

            <fieldset className="kg-fs-group" aria-label="حالت چیدمان">
              <button
                type="button"
                className={`kg-fs-chip${state.layoutMode === 'force' ? ' active' : ''}`}
                data-layout-toggle="force"
                aria-pressed={state.layoutMode === 'force'}
                onClick={() => onPatch({ layoutMode: 'force', fullscreenLayoutMode: 'force' })}
              >
                شبکه
              </button>
              <button
                type="button"
                className={`kg-fs-chip${state.layoutMode === 'dag' ? ' active' : ''}`}
                data-layout-toggle="dag"
                aria-pressed={state.layoutMode === 'dag'}
                onClick={() => onPatch({ layoutMode: 'dag', fullscreenLayoutMode: 'dag' })}
              >
                DAG
              </button>
            </fieldset>

            {state.layoutMode === 'dag' && (
              <button
                type="button"
                className="kg-fs-toggle"
                data-dag-orientation={state.dagOrientation}
                onClick={() =>
                  onPatch({
                    dagOrientation: state.dagOrientation === 'vertical' ? 'horizontal' : 'vertical',
                  })
                }
                title="تغییر جهت درخت پیش‌نیازها (عمودی / افقی راست‌به‌چپ)"
              >
                <span>{state.dagOrientation === 'horizontal' ? 'افقی RTL' : 'عمودی'}</span>
              </button>
            )}

            <fieldset className="kg-fs-group" data-path-trace aria-label="ردیابی مسیر یادگیری">
              {(
                [
                  ['off', 'عادی'],
                  ['prerequisites', 'پیش‌نیازها'],
                  ['impact', 'کاربردها'],
                ] as Array<[PathTraceMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`kg-fs-chip${state.pathTraceMode === mode ? ' active' : ''}`}
                  data-path-trace-mode={mode}
                  aria-pressed={state.pathTraceMode === mode}
                  onClick={() =>
                    onPatch({
                      pathTraceMode: mode,
                      bridgePanelOpen: false,
                      practiceListOpen: false,
                      ...(mode !== 'off' ? { layoutMode: 'dag', fullscreenLayoutMode: 'dag' } : {}),
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </fieldset>

            {hasTheoremStructure && (
              <button
                type="button"
                className={`kg-fs-toggle${state.theoremFocusMode ? ' active' : ''}`}
                data-theorem-anatomy
                aria-pressed={state.theoremFocusMode}
                onClick={() =>
                  onPatch({
                    theoremFocusMode: !state.theoremFocusMode,
                    ...(!state.theoremFocusMode
                      ? { layoutMode: 'dag', fullscreenLayoutMode: 'dag' }
                      : {}),
                  })
                }
                title="نمایش مفروضات، برهان‌ها و نتایج پیرامون قضیه"
              >
                <Compass size={12} aria-hidden="true" />
                <span>کالبدشکافی</span>
              </button>
            )}

            <button
              type="button"
              className={`kg-fs-toggle${state.bridgePanelOpen ? ' active' : ''}`}
              data-bridge-toggle
              aria-pressed={state.bridgePanelOpen}
              onClick={() =>
                onPatch({
                  bridgePanelOpen: !state.bridgePanelOpen,
                  practiceListOpen: false,
                })
              }
              title="یافتن کوتاه‌ترین زنجیرهٔ استنتاجی بین دو یادداشت"
            >
              <Route size={12} aria-hidden="true" />
              <span>پل مفهومی</span>
            </button>

            <button
              type="button"
              className={`kg-fs-toggle${state.practiceListOpen ? ' active' : ''}`}
              data-practice-toggle
              aria-pressed={state.practiceListOpen}
              onClick={() =>
                onPatch({
                  practiceListOpen: !state.practiceListOpen,
                  bridgePanelOpen: false,
                })
              }
              title="فهرست تمرین‌ها و راه‌حل‌های همسایگی"
            >
              <BookOpen size={12} aria-hidden="true" />
              <span>تمرین‌ها</span>
            </button>

            <select
              className="kg-fs-select"
              data-color-by
              aria-label="رنگ‌بندی گره‌ها"
              value={state.colorBy}
              onChange={(e) => onPatch({ colorBy: e.target.value as ColorByMode })}
            >
              <option value="kind">رنگ: نوع مفهوم</option>
              <option value="mastery">رنگ: وضعیت یادگیری</option>
              <option value="level">رنگ: سطح دشواری</option>
              <option value="chapter">رنگ: فصل و کتاب</option>
            </select>

            <button
              type="button"
              className={`kg-fs-toggle${state.showHubsAndRaw ? ' active' : ''}`}
              data-hubs-toggle
              aria-pressed={state.showHubsAndRaw}
              onClick={() => onPatch({ showHubsAndRaw: !state.showHubsAndRaw })}
              title="نمایش یا پنهان کردن نقشه‌راه‌ها و صفحات خام OCR"
            >
              <Layers size={12} aria-hidden="true" />
              <span>
                {state.showHubsAndRaw || state.hiddenHubCount === 0
                  ? 'نقشه/خام'
                  : `نقشه/خام (+${toPersianDigits(state.hiddenHubCount)})`}
              </span>
            </button>

            <button
              type="button"
              className={`kg-fs-toggle${state.typedOnly ? ' active' : ''}`}
              data-typed-toggle
              aria-pressed={state.typedOnly}
              onClick={() => onPatch({ typedOnly: !state.typedOnly })}
            >
              فقط UMKO
            </button>

            {state.pinnedCount > 0 && (
              <button
                type="button"
                className="kg-fs-toggle active"
                data-unpin-all
                onClick={onUnpinAll}
                title="آزادسازی تمام گره‌های سنجاق‌شده با موس"
              >
                <PinOff size={12} aria-hidden="true" />
                <span>آزادسازی ({toPersianDigits(state.pinnedCount)})</span>
              </button>
            )}

            <span className="kg-fs-stats" aria-live="polite">
              {statsText}
            </span>
          </div>

          {isPivoted && (
            <div className="kg-fs-pivot-bar" data-pivot-banner>
              <Crosshair size={13} aria-hidden="true" />
              <span className="kg-pivot-label">مرکز فعلی: {pivotTitle}</span>
              <button
                type="button"
                className="kg-pivot-reset"
                data-graph-reset-pivot
                onClick={onResetPivot}
              >
                بازگشت به یادداشت اصلی
              </button>
            </div>
          )}
        </div>

        <div className="kg-actions slsg-graph-action-container">
          <button
            type="button"
            className="kg-action-btn slsg-graph-action-button"
            data-graph-action="reset-zoom"
            aria-label="تنظیم مجدد بزرگ‌نمایی"
            title="تنظیم مجدد بزرگ‌نمایی"
            onClick={onFitToBounds}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`kg-action-btn slsg-graph-action-button${state.renderArrows ? ' is-active' : ''}`}
            data-graph-action="arrows"
            aria-label="نمایش یا پنهان کردن پیکان جهت پیوندها"
            aria-pressed={state.renderArrows}
            title="پیکان جهت پیوندها"
            onClick={() => onPatch({ renderArrows: !state.renderArrows })}
          >
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`kg-action-btn slsg-graph-action-button${state.settingsOpen ? ' is-active' : ''}`}
            data-graph-action="settings"
            aria-label="تنظیمات پیشرفته گراف"
            aria-expanded={state.settingsOpen}
            title="تنظیمات گراف"
            onClick={() => patchSettings(state, onPatch)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="kg-action-btn slsg-graph-action-button is-active"
            data-graph-action="fullscreen"
            data-graph-close
            aria-label="خروج از تمام‌صفحه"
            title="خروج از تمام‌صفحه (Esc)"
            onClick={onCloseFullscreen}
          >
            <Minimize2 size={16} aria-hidden="true" />
          </button>
        </div>

        <canvas ref={onCanvasRef} className="kg-canvas" />

        {(showBridgePanel || showPracticePanel || showStudyPath) && (
          <div ref={leftPanelRef} className="kg-left-dock">
            {showBridgePanel && (
              <GraphBridgePanel
                currentPage={pivotSlug}
                sitemap={sitemap}
                bridgeTargetId={state.bridgeTargetId}
                shortestPath={shortestPath}
                isDark={isDark}
                onSelectTarget={(targetId) => onPatch({ bridgeTargetId: targetId })}
                onSelectNode={onSelectNode}
                onClose={() => onPatch({ bridgePanelOpen: false, bridgeTargetId: null })}
              />
            )}

            {showPracticePanel && (
              <GraphPracticePanel
                nodes={nodes}
                masteryMap={state.masteryMap}
                selectedNodeId={state.selectedNodeId}
                isDark={isDark}
                onSelectNode={onSelectNode}
                onClose={() => onPatch({ practiceListOpen: false })}
              />
            )}

            {showStudyPath && (
              <aside
                className="kg-study-path"
                data-study-path-list
                dir="rtl"
                aria-label="چک‌لیست گام‌های مسیر یادگیری"
              >
                <div className="kg-study-path-head">
                  <div className="flex items-center gap-1.5">
                    <GitBranch size={13} aria-hidden="true" />
                    <strong>
                      {state.pathTraceMode === 'prerequisites'
                        ? 'چک‌لیست پیش‌نیازها (پایه به هدف)'
                        : 'مسیر کاربردها'}
                    </strong>
                    <span className="kg-study-path-count">
                      {state.pathTraceMode === 'prerequisites' && checklist.length > 0
                        ? `${toPersianDigits(masteredCount)}/${toPersianDigits(checklist.length)}`
                        : toPersianDigits(checklist.length)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="kg-study-path-close"
                    aria-label="خروج از حالت مسیر یادگیری"
                    onClick={() => onPatch({ pathTraceMode: 'off' })}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>

                {state.pathTraceMode === 'prerequisites' && missingSteps.length > 0 && (
                  <button
                    type="button"
                    className="kg-study-start-cta"
                    data-start-first-unread
                    onClick={() => onSelectNode(missingSteps[0].nodeId)}
                  >
                    <Play size={11} aria-hidden="true" />
                    <span>شروع از اولین پیش‌نیاز نخوانده</span>
                  </button>
                )}

                {checklist.length === 0 ? (
                  <p className="kg-study-path-empty">
                    مسیر جهت‌داری در این عمق یافت نشد؛ برای دیدن زنجیره‌های طولانی‌تر، عمق را افزایش
                    دهید.
                  </p>
                ) : (
                  <ol className="kg-study-path-items">
                    {checklist.map((step) => {
                      const accent = isDark ? step.darkColor : step.lightColor;
                      const active = selectedNode?.id === step.nodeId;
                      const mastered = state.masteryMap[step.nodeId] === 'mastered';
                      return (
                        <li key={step.nodeId} className="kg-study-step-row">
                          <button
                            type="button"
                            className={`kg-study-check${mastered ? ' is-done' : ''}`}
                            aria-label={`علامت‌گذاری تسلط ${step.title}`}
                            aria-pressed={mastered}
                            onClick={() =>
                              onSetMastery(step.nodeId, mastered ? 'unseen' : 'mastered')
                            }
                          >
                            {mastered ? (
                              <CheckCircle2 size={13} aria-hidden="true" />
                            ) : (
                              <Circle size={13} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className={`kg-study-step${active ? ' is-selected' : ''}`}
                            onClick={() => onSelectNode(step.nodeId)}
                          >
                            <span className="kg-study-hop">گام {toPersianDigits(step.hop)}</span>
                            <NodeShapeGlyph shape={step.shape} color={accent} size={11} />
                            <span className="kg-study-title">{step.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </aside>
            )}
          </div>
        )}

        {selectedNode && (
          <div ref={rightPanelRef} className="kg-right-dock">
            <GraphQuickPeekDrawer
              node={selectedNode}
              isDark={isDark}
              pathTraceMode={state.pathTraceMode}
              masteryStatus={state.masteryMap[selectedNode.id] || 'unseen'}
              connections={selectedConnections}
              onClose={() => onPatch({ selectedNodeId: null })}
              onPivot={onPivot}
              onSelectNeighbor={onSelectNode}
              onSetPathTrace={(mode) =>
                onPatch({
                  pathTraceMode: mode,
                  ...(mode !== 'off' ? { layoutMode: 'dag', fullscreenLayoutMode: 'dag' } : {}),
                })
              }
              onSetMastery={onSetMastery}
              onBridgeToNode={(targetId) =>
                onPatch({
                  bridgePanelOpen: true,
                  bridgeTargetId: targetId,
                  practiceListOpen: false,
                })
              }
            />
          </div>
        )}

        <GraphTooltip
          hover={hover}
          isDark={isDark}
          isFullscreen={true}
          containerRect={containerRect}
          hidden={Boolean(selectedNode)}
        />

        <GraphSettingsPopover
          open={state.settingsOpen}
          state={state}
          onPatch={patchStateWithLayout(onPatch)}
          onReset={onResetSettings}
          onClose={() => onPatch({ settingsOpen: false })}
        />

        <section ref={legendRef} className="kg-fs-legend" aria-label="فیلتر انواع گره‌ها و روابط">
          <div className="kg-dock-section">
            {state.colorBy === 'kind'
              ? legendEntries.map((item) => {
                  const active = state.activeKindFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`kg-fs-legend-chip${active ? ' is-active' : ''}`}
                      data-legend-kind={item.id}
                      aria-pressed={active}
                      style={{ '--chip-c': item.color } as CSSProperties}
                      onClick={() => onPatch({ activeKindFilter: active ? null : item.id })}
                    >
                      <NodeShapeGlyph shape={item.shape} color={item.color} size={10} />
                      <span>{item.label}</span>
                      {item.count !== undefined && (
                        <span className="kg-lens-count">({toPersianDigits(item.count)})</span>
                      )}
                    </button>
                  );
                })
              : legendEntries.map((item) => (
                  <span
                    key={item.id}
                    className="kg-fs-legend-static"
                    data-lens-item={item.id}
                    style={{ '--chip-c': item.color } as CSSProperties}
                  >
                    <span className="kg-dot" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.count !== undefined && (
                      <span className="kg-lens-count">({toPersianDigits(item.count)})</span>
                    )}
                  </span>
                ))}
            {monochromeHint && (
              <span className="kg-lens-mono-hint">(همهٔ گره‌های این نما در یک دسته هستند)</span>
            )}
          </div>

          <span className="kg-dock-sep" aria-hidden="true" />

          <div className="kg-dock-section">
            {PLANE_FILTER_ITEMS.map((plane) => {
              const active = state.activePlaneFilter === plane.key;
              return (
                <button
                  key={plane.key}
                  type="button"
                  className={`kg-fs-plane-chip${active ? ' is-active' : ''}`}
                  data-plane-filter={plane.key}
                  aria-pressed={active}
                  style={{ '--plane-c': plane.color } as CSSProperties}
                  onClick={() => onPatch({ activePlaneFilter: active ? null : plane.key })}
                >
                  <span className={`kg-line-sample kg-line-${plane.dash}`} aria-hidden="true" />
                  <span>{plane.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

function patchSettings(state: GraphUiState, onPatch: (patch: Partial<GraphUiState>) => void) {
  onPatch({ settingsOpen: !state.settingsOpen });
}

function patchStateWithLayout(onPatch: (patch: Partial<GraphUiState>) => void) {
  return (patch: Partial<GraphUiState>) => {
    if (patch.layoutMode) {
      onPatch({ ...patch, fullscreenLayoutMode: patch.layoutMode });
      return;
    }
    onPatch(patch);
  };
}
