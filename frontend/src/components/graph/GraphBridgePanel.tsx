import { ArrowDown, Route, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toPersianDigits } from '../../lib/graph/schema.ts';
import type { ShortestPathResult, SitemapEntry } from '../../lib/graph/types.ts';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

interface GraphBridgePanelProps {
  currentPage: string;
  sitemap: Record<string, SitemapEntry>;
  bridgeTargetId: string | null;
  shortestPath: ShortestPathResult | null;
  isDark: boolean;
  onSelectTarget: (targetId: string | null) => void;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

/**
 * Concept Bridge panel: finds the shortest weighted mathematical reasoning chain
 * from the active note to any chosen concept or theorem across the entire digital garden.
 */
export function GraphBridgePanel({
  currentPage,
  sitemap,
  bridgeTargetId,
  shortestPath,
  isDark,
  onSelectTarget,
  onSelectNode,
  onClose,
}: GraphBridgePanelProps) {
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{ id: string; title: string; kind: string }> = [];
    for (const [id, entry] of Object.entries(sitemap)) {
      if (!entry || entry.exists === false || entry.external || id === currentPage) continue;
      const title = entry.title || id.replace(/^notes\//, '');
      if (q && !title.toLowerCase().includes(q) && !(entry.kind || '').toLowerCase().includes(q)) {
        continue;
      }
      list.push({ id, title, kind: entry.kind || '' });
      if (list.length >= 24 && !q) break;
    }
    return list.slice(0, 20);
  }, [sitemap, currentPage, query]);

  return (
    <aside
      className="kg-side-panel"
      data-bridge-panel
      dir="rtl"
      aria-label="کاشف پل مفهومی بین دو یادداشت"
    >
      <div className="kg-study-path-head">
        <div className="flex items-center gap-1.5">
          <Route size={14} aria-hidden="true" />
          <strong>کاشف پل مفهومی</strong>
        </div>
        <button
          type="button"
          className="kg-study-path-close"
          data-bridge-close
          aria-label="بستن پل مفهومی"
          onClick={onClose}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="kg-bridge-search-box">
        <Search size={13} className="kg-bridge-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="kg-bridge-input"
          data-bridge-input
          placeholder="انتخاب یادداشت مقصد (قضیه، تعریف…)"
          aria-label="جستجوی یادداشت مقصد برای پل مفهومی"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {bridgeTargetId && (
          <button
            type="button"
            className="kg-bridge-clear"
            onClick={() => {
              onSelectTarget(null);
              setQuery('');
            }}
          >
            پاک‌کردن
          </button>
        )}
      </div>

      {shortestPath ? (
        <div className="kg-bridge-result" data-bridge-result>
          {shortestPath.found ? (
            <>
              <div className="kg-bridge-meta">
                کوتاه‌ترین مسیر استنتاجی ({toPersianDigits(shortestPath.steps.length)} گام)
              </div>
              <ol className="kg-bridge-steps">
                {shortestPath.steps.map((step, idx) => (
                  <li key={step.id}>
                    {idx > 0 && (
                      <div className="kg-bridge-edge">
                        <ArrowDown size={11} aria-hidden="true" />
                        <span>{step.relationLabelFromPrev || 'ارجاع'}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="kg-study-step"
                      data-bridge-step={step.id}
                      onClick={() => onSelectNode(step.id)}
                    >
                      <span className="kg-study-hop">{toPersianDigits(idx + 1)}</span>
                      <NodeShapeGlyph
                        shape={step.shape}
                        color={isDark ? step.darkColor : step.lightColor}
                        size={11}
                      />
                      <span className="kg-study-title">{step.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="kg-study-path-empty">
              مسیری بین این دو یادداشت در گراف فعلی یافت نشد (در صورت نیاز نمایش نقشه‌راه‌ها را روشن
              کنید).
            </p>
          )}
        </div>
      ) : (
        <ul className="kg-study-path-items" aria-label="یادداشت‌های پیشنهادی مقصد">
          {candidates.map((cand) => (
            <li key={cand.id}>
              <button
                type="button"
                className="kg-study-step"
                data-bridge-candidate={cand.id}
                onClick={() => onSelectTarget(cand.id)}
              >
                <span className="kg-study-title">{cand.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
