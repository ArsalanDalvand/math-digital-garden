import { ArrowDownLeft, BookOpen, GitBranch, Layers } from 'lucide-react';
import { toPersianDigits } from '../../lib/graph/schema.ts';
import type { NeighborSummary } from '../../lib/graph/types.ts';

interface GraphSummaryStripProps {
  summary: NeighborSummary;
  showHubsAndRaw: boolean;
  onTracePrerequisites: () => void;
  onTraceImpact: () => void;
  onFilterExercises: () => void;
  onRevealHubs: () => void;
}

/**
 * Compact scannable summary pill bar anchored directly inside the sidebar graph widget.
 * Clicking a category opens fullscreen focused directly on that pedagogical filter/trace.
 */
export function GraphSummaryStrip({
  summary,
  showHubsAndRaw,
  onTracePrerequisites,
  onTraceImpact,
  onFilterExercises,
  onRevealHubs,
}: GraphSummaryStripProps) {
  return (
    <fieldset
      className="kg-summary-strip"
      data-graph-summary-strip
      aria-label="خلاصه پیوندهای همسایگی"
    >
      <button
        type="button"
        className="kg-summary-pill"
        data-summary-pill="prerequisites"
        disabled={summary.prereqCount === 0}
        onClick={onTracePrerequisites}
        title="باز کردن تمام‌صفحه با مسیر پیش‌نیازها"
      >
        <GitBranch size={11} aria-hidden="true" />
        <span>{toPersianDigits(summary.prereqCount)} پیش‌نیاز</span>
      </button>

      <button
        type="button"
        className="kg-summary-pill"
        data-summary-pill="impact"
        disabled={summary.dependentCount === 0}
        onClick={onTraceImpact}
        title="باز کردن تمام‌صفحه با قضایا و مفاهیم وابسته"
      >
        <ArrowDownLeft size={11} aria-hidden="true" />
        <span>{toPersianDigits(summary.dependentCount)} وابسته</span>
      </button>

      <button
        type="button"
        className="kg-summary-pill"
        data-summary-pill="exercises"
        disabled={summary.exerciseCount === 0}
        onClick={onFilterExercises}
        title="نمایش تمرین‌ها و مسائل مرتبط در تمام‌صفحه"
      >
        <BookOpen size={11} aria-hidden="true" />
        <span>{toPersianDigits(summary.exerciseCount)} تمرین</span>
      </button>

      {summary.hiddenHubCount > 0 && !showHubsAndRaw && (
        <button
          type="button"
          className="kg-summary-pill kg-summary-pill-muted"
          data-summary-pill="hubs"
          onClick={onRevealHubs}
          title="نمایش نقشه‌راه‌ها و صفحات OCR پنهان‌شده"
        >
          <Layers size={11} aria-hidden="true" />
          <span>+{toPersianDigits(summary.hiddenHubCount)} نقشه/خام</span>
        </button>
      )}
    </fieldset>
  );
}
