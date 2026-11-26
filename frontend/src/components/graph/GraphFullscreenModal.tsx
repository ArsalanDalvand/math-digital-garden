import {
  ArrowUpRight,
  Minimize2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { type CSSProperties, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LEGEND_ITEMS, PLANE_FILTER_ITEMS, toPersianDigits } from '../../lib/graph/schema.ts';
import type { HoverTarget } from '../../lib/graph/types.ts';
import type { GraphUiState } from '../../stores/garden.ts';
import { GraphSettingsPopover } from './GraphSettingsPopover.tsx';
import { GraphTooltip } from './GraphTooltip.tsx';

interface GraphFullscreenModalProps {
  state: GraphUiState;
  isDark: boolean;
  hover: HoverTarget;
  onCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onPatch: (patch: Partial<GraphUiState>) => void;
  onResetSettings: () => void;
  onFitToBounds: () => void;
  onFocusFirstMatch: () => void;
  onCloseFullscreen: () => void;
}

export function GraphFullscreenModal({
  state,
  isDark,
  hover,
  onCanvasRef,
  onPatch,
  onResetSettings,
  onFitToBounds,
  onFocusFirstMatch,
  onCloseFullscreen,
}: GraphFullscreenModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (!state.isFullscreen || typeof document === 'undefined') {
    return null;
  }

  const containerRect = containerRef.current?.getBoundingClientRect() ?? null;
  const statsText = `${toPersianDigits(state.nodeCount)} گره · ${toPersianDigits(state.linkCount)} پیوند`;

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
      >
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

          <div className="kg-fs-group" role="group" aria-label="تنظیم عمق گراف">
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
          </div>

          <div className="kg-fs-group" role="group" aria-label="حالت چیدمان">
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
          </div>

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
            aria-label="خروج از تمام‌صفحه"
            title="خروج از تمام‌صفحه (Esc)"
            onClick={onCloseFullscreen}
          >
            <Minimize2 size={16} aria-hidden="true" />
          </button>
        </div>

        <canvas ref={onCanvasRef} className="kg-canvas" />

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

        <div className="kg-fs-legend" aria-label="فیلتر انواع گره‌ها و روابط">
          <div className="kg-dock-section">
            {LEGEND_ITEMS.map((item) => {
              const active = state.activeKindFilter === item.kind;
              return (
                <button
                  key={item.kind}
                  type="button"
                  className={`kg-fs-legend-chip${active ? ' is-active' : ''}`}
                  data-legend-kind={item.kind}
                  aria-pressed={active}
                  style={{ '--chip-c': item.color } as CSSProperties}
                  onClick={() =>
                    onPatch({ activeKindFilter: active ? null : item.kind })
                  }
                >
                  <span className="kg-dot" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
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
                  onClick={() =>
                    onPatch({ activePlaneFilter: active ? null : plane.key })
                  }
                >
                  <span
                    className={`kg-line-sample kg-line-${plane.dash}`}
                    aria-hidden="true"
                  />
                  <span>{plane.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
