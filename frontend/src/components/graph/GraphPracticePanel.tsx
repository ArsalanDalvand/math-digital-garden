import { BookOpen, CheckCircle2, X } from 'lucide-react';
import { toPersianDigits } from '../../lib/graph/schema.ts';
import type { GraphNode, MasteryMap } from '../../lib/graph/types.ts';
import { NodeShapeGlyph } from './NodeShapeGlyph.tsx';

interface GraphPracticePanelProps {
  nodes: GraphNode[];
  masteryMap: MasteryMap;
  selectedNodeId: string | null;
  isDark: boolean;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

/**
 * Practice Launcher panel: collects all related exercises (`problem`) and worked
 * solutions (`solution`) in the neighborhood so students can review them one-by-one
 * via Quick Peek without juggling multiple browser tabs.
 */
export function GraphPracticePanel({
  nodes,
  masteryMap,
  selectedNodeId,
  isDark,
  onSelectNode,
  onClose,
}: GraphPracticePanelProps) {
  const practiceNodes = nodes
    .filter((n) => !n.isOverflowCluster && (n.kind === 'problem' || n.kind === 'solution'))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'problem' ? -1 : 1;
      return b.degree - a.degree || a.title.localeCompare(b.title, 'fa');
    });

  return (
    <aside
      className="kg-side-panel"
      data-practice-panel
      dir="rtl"
      aria-label="فهرست تمرین‌ها و مسائل مرتبط"
    >
      <div className="kg-study-path-head">
        <div className="flex items-center gap-1.5">
          <BookOpen size={14} aria-hidden="true" />
          <strong>تمرین‌های مرتبط</strong>
          <span className="kg-study-path-count">{toPersianDigits(practiceNodes.length)}</span>
        </div>
        <button
          type="button"
          className="kg-study-path-close"
          data-practice-close
          aria-label="بستن فهرست تمرین‌ها"
          onClick={onClose}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      {practiceNodes.length === 0 ? (
        <p className="kg-study-path-empty">
          تمرین یا راه‌حلی در عمق فعلی یافت نشد؛ عمق را به ۲ یا همه تغییر دهید.
        </p>
      ) : (
        <ol className="kg-study-path-items">
          {practiceNodes.map((n) => {
            const active = selectedNodeId === n.id;
            const mastered = masteryMap[n.id] === 'mastered';
            const color = isDark ? n.darkColor : n.lightColor;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`kg-study-step${active ? ' is-selected' : ''}`}
                  data-practice-item={n.id}
                  onClick={() => onSelectNode(n.id)}
                >
                  <NodeShapeGlyph shape={n.shape} color={color} size={11} />
                  <span className="kg-study-title">{n.title}</span>
                  {mastered && (
                    <CheckCircle2
                      size={12}
                      className="text-emerald-600 shrink-0"
                      aria-label="حل‌شده"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
