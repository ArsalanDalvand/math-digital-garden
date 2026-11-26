import {
  ArrowUpRight,
  Crosshair,
  GitBranch,
  Layers,
  Minimize2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { type CSSProperties, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getColorLensLegend } from '../../lib/graph/color-lens.ts';
import { PLANE_FILTER_ITEMS, toPersianDigits } from '../../lib/graph/schema.ts';
import type {
  ColorByMode,
  GraphNode,
  HoverTarget,
  PathTraceMode,
  PathTraceResult,
} from '../../lib/graph/types.ts';
import type { GraphUiState } from '../../stores/garden.ts';
import { GraphQuickPeekDrawer, type NoteConnectionItem } from './GraphQuickPeekDrawer.tsx';
import { GraphSettingsPopover } from './GraphSettingsPopover.tsx';
import { GraphTooltip } from './GraphTooltip.tsx';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

interface GraphFullscreenModalProps {
  state: GraphUiState;
  isDark: boolean;
  hover: HoverTarget;
  nodes: GraphNode[];
  pathTrace: PathTraceResult;
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
  onCloseFullscreen: () => void;
}

export function GraphFullscreenModal({
  state,
  isDark,
  hover,
  nodes,
  pathTrace,
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
  onCloseFullscreen,
}: GraphFullscreenModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (!state.isFullscreen || typeof document === 'undefined') {
    return null;
  }

  const containerRect = containerRef.current?.getBoundingClientRect() ?? null;
  const statsText = `${toPersianDigits(state.nodeCount)} گره · ${toPersianDigits(state.linkCount)} پیوند`;
  const legendEntries = getColorLensLegend(nodes, state.colorBy, isDark);

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
        data-color-by={state.colorBy}
        data-path-trace-mode={state.pathTraceMode}
        data-pivot-slug={pivotSlug}
      >
        <div className="kg-fs-top-stack">
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
                onClick={() => onPatch({ layoutMode: 'force' })}
              >
                شبکه
              </button>
              <button
                type="button"
                className={`kg-fs-chip${state.layoutMode === 'dag' ? ' active' : ''}`}
                data-layout-toggle="dag"
                aria-pressed={state.layoutMode === 'dag'}
                onClick={() => onPatch({ layoutMode: 'dag' })}
              >
                DAG
              </button>
            </fieldset>

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
                  onClick={() => onPatch({ pathTraceMode: mode })}
                >
                  {label}
                </button>
              ))}
            </fieldset>

            <select
              className="kg-fs-select"
              data-color-by
              aria-label="رنگ‌بندی گره‌ها"
              value={state.colorBy}
              onChange={(e) => onPatch({ colorBy: e.target.value as ColorByMode })}
            >
              <option value="kind">رنگ: نوع مفهوم</option>
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
            onClick={() => onPatch({ settingsOpen: !state.settingsOpen })}
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

        {state.pathTraceMode !== 'off' && (
          <aside
            className="kg-study-path"
            data-study-path-list
            dir="rtl"
            aria-label="فهرست گام‌های مسیر یادگیری"
          >
            <div className="kg-study-path-head">
              <div className="flex items-center gap-1.5">
                <GitBranch size={13} aria-hidden="true" />
                <strong>
                  {state.pathTraceMode === 'prerequisites' ? 'مسیر پیش‌نیازها' : 'مسیر کاربردها'}
                </strong>
                <span className="kg-study-path-count">
                  {toPersianDigits(pathTrace.orderedSteps.length)}
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
            {pathTrace.orderedSteps.length === 0 ? (
              <p className="kg-study-path-empty">
                مسیر جهت‌داری در این عمق یافت نشد؛ برای دیدن زنجیره‌های طولانی‌تر، عمق را افزایش دهید.
              </p>
            ) : (
              <ol className="kg-study-path-items">
                {pathTrace.orderedSteps.map((step) => {
                  const accent = isDark ? step.darkColor : step.lightColor;
                  const active = selectedNode?.id === step.nodeId;
                  return (
                    <li key={step.nodeId}>
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

        {selectedNode && (
          <GraphQuickPeekDrawer
            node={selectedNode}
            isDark={isDark}
            pathTraceMode={state.pathTraceMode}
            connections={selectedConnections}
            onClose={() => onPatch({ selectedNodeId: null })}
            onPivot={onPivot}
            onSelectNeighbor={onSelectNode}
            onSetPathTrace={(mode) => onPatch({ pathTraceMode: mode })}
          />
        )}

        <GraphTooltip
          hover={hover}
          isDark={isDark}
          isFullscreen={true}
          containerRect={containerRect}
        />

        <GraphSettingsPopover
          open={state.settingsOpen}
          state={state}
          onPatch={onPatch}
          onReset={onResetSettings}
          onClose={() => onPatch({ settingsOpen: false })}
        />

        <section className="kg-fs-legend" aria-label="فیلتر انواع گره‌ها و روابط">
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
