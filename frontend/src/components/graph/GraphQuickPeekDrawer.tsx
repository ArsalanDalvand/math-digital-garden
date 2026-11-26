import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  ExternalLink,
  GitBranch,
  Sparkles,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { getPlaneLabel, toPersianDigits } from '../../lib/graph/schema.ts';
import type { GraphNode, PathTraceMode } from '../../lib/graph/types.ts';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

export interface NoteConnectionItem {
  node: GraphNode;
  relation: string;
  label: string;
}

interface NotePreviewPayload {
  slug: string;
  title: string;
  href: string;
  kind?: string;
  slogan?: string;
  html: string;
}

interface GraphQuickPeekDrawerProps {
  node: GraphNode;
  isDark: boolean;
  pathTraceMode: PathTraceMode;
  connections: {
    incoming: NoteConnectionItem[];
    outgoing: NoteConnectionItem[];
  };
  onClose: () => void;
  onPivot: (nodeId: string) => void;
  onSelectNeighbor: (nodeId: string) => void;
  onSetPathTrace: (mode: PathTraceMode) => void;
}

const previewCache = new Map<string, NotePreviewPayload>();

/**
 * RTL slide-over drawer rendered inside fullscreen Graph mode. Fetches rendered
 * note preview HTML on-demand without leaving the graph, exposes pivot/re-center
 * and direct study-path tracing actions, and lists clickable typed neighbors.
 */
export function GraphQuickPeekDrawer({
  node,
  isDark,
  pathTraceMode,
  connections,
  onClose,
  onPivot,
  onSelectNeighbor,
  onSetPathTrace,
}: GraphQuickPeekDrawerProps) {
  const bareSlug = node.id.replace(/^notes\//, '');
  const [preview, setPreview] = useState<NotePreviewPayload | null>(
    () => previewCache.get(bareSlug) ?? null,
  );
  const [loading, setLoading] = useState(!previewCache.has(bareSlug));
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const cached = previewCache.get(bareSlug);
    if (cached) {
      setPreview(cached);
      setLoading(false);
      setErrorMsg('');
      return;
    }

    const controller = new AbortController();
    setPreview(null);
    setLoading(true);
    setErrorMsg('');

    fetch(`/api/note-preview/${encodeURIComponent(bareSlug)}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NotePreviewPayload;
        previewCache.set(bareSlug, data);
        if (!controller.signal.aborted) {
          setPreview(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'خطا در دریافت پیش‌نمایش';
        setErrorMsg(msg);
        setLoading(false);
      });

    return () => controller.abort();
  }, [bareSlug]);

  const accent = isDark ? node.darkColor : node.lightColor;
  const noteHref = `/${node.id}`;
  const hasConnections = connections.outgoing.length > 0 || connections.incoming.length > 0;

  return (
    <aside
      className="kg-quick-peek"
      data-quick-peek-drawer
      data-node-id={node.id}
      dir="rtl"
      aria-label={`پیش‌نمایش ${node.title}`}
      style={{ '--kind-c': accent } as CSSProperties}
    >
      <header className="kg-qp-header">
        <div className="kg-qp-badges">
          <span className="kg-qp-kind-badge">
            <NodeShapeGlyph shape={node.shape} color={accent} size={12} />
            <span>{node.kindLabel}</span>
          </span>
          {node.level && <span className="kg-qp-meta-badge">{node.level}</span>}
          {node.chapterSlug && <span className="kg-qp-meta-badge">{node.chapterSlug}</span>}
        </div>
        <button
          type="button"
          className="kg-qp-close"
          data-quick-peek-close
          onClick={onClose}
          aria-label="بستن پیش‌نمایش"
          title="بستن (Esc)"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="kg-qp-title-block">
        <h3 className="kg-qp-title">{node.title}</h3>
        {(node.slogan || preview?.slogan) && (
          <p className="kg-qp-slogan">{node.slogan || preview?.slogan}</p>
        )}
      </div>

      <div className="kg-qp-actions">
        <button
          type="button"
          className="kg-qp-btn kg-qp-btn-primary"
          data-graph-pivot
          onClick={() => onPivot(node.id)}
        >
          <Crosshair size={14} aria-hidden="true" />
          <span>تمرکز روی این گره</span>
        </button>
        <a className="kg-qp-btn kg-qp-btn-secondary" data-graph-open-note href={noteHref}>
          <ExternalLink size={14} aria-hidden="true" />
          <span>باز کردن یادداشت کامل</span>
        </a>
      </div>

      <fieldset className="kg-qp-trace-row" aria-label="ردیابی مسیر برای این گره">
        <button
          type="button"
          className={`kg-qp-trace-chip ${pathTraceMode === 'prerequisites' ? 'is-active' : ''}`}
          onClick={() =>
            onSetPathTrace(pathTraceMode === 'prerequisites' ? 'off' : 'prerequisites')
          }
        >
          <GitBranch size={12} aria-hidden="true" />
          <span>مسیر پیش‌نیازها</span>
        </button>
        <button
          type="button"
          className={`kg-qp-trace-chip ${pathTraceMode === 'impact' ? 'is-active' : ''}`}
          onClick={() => onSetPathTrace(pathTraceMode === 'impact' ? 'off' : 'impact')}
        >
          <Sparkles size={12} aria-hidden="true" />
          <span>کاربردها و وابسته‌ها</span>
        </button>
      </fieldset>

      <div className="kg-qp-body">
        <section className="kg-qp-section">
          <h4 className="kg-qp-section-title">خلاصه و فرمول‌ها</h4>
          {loading && <div className="kg-qp-loading">در حال بارگذاری محتوای ریاضی…</div>}
          {!loading && errorMsg && (
            <div className="kg-qp-error">امکان بارگذاری پیش‌نمایش نبود ({errorMsg}).</div>
          )}
          {!loading && !errorMsg && preview?.html && (
            <div
              className="kg-qp-preview note"
              // Server-rendered sanitized KaTeX/Remark note preview HTML from /api/note-preview/[slug]
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          )}
        </section>

        {hasConnections && (
          <section className="kg-qp-section">
            <h4 className="kg-qp-section-title">
              پیوندهای همسایه (
              {toPersianDigits(connections.outgoing.length + connections.incoming.length)})
            </h4>
            <div className="kg-qp-neighbors">
              {connections.outgoing.map((item) => (
                <button
                  key={`out-${item.node.id}-${item.relation}`}
                  type="button"
                  className="kg-qp-neighbor-btn"
                  onClick={() => onSelectNeighbor(item.node.id)}
                >
                  <ArrowLeft size={12} className="kg-qp-dir-icon" aria-hidden="true" />
                  <NodeShapeGlyph
                    shape={item.node.shape}
                    color={isDark ? item.node.darkColor : item.node.lightColor}
                    size={11}
                  />
                  <span className="kg-qp-neighbor-title">{item.node.title}</span>
                  <span className="kg-qp-neighbor-rel">
                    {item.label || getPlaneLabel('context')}
                  </span>
                </button>
              ))}
              {connections.incoming.map((item) => (
                <button
                  key={`in-${item.node.id}-${item.relation}`}
                  type="button"
                  className="kg-qp-neighbor-btn"
                  onClick={() => onSelectNeighbor(item.node.id)}
                >
                  <ArrowRight size={12} className="kg-qp-dir-icon" aria-hidden="true" />
                  <NodeShapeGlyph
                    shape={item.node.shape}
                    color={isDark ? item.node.darkColor : item.node.lightColor}
                    size={11}
                  />
                  <span className="kg-qp-neighbor-title">{item.node.title}</span>
                  <span className="kg-qp-neighbor-rel">
                    {item.label || getPlaneLabel('context')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
