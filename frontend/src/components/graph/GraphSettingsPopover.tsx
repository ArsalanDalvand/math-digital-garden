import { RotateCcw, X } from 'lucide-react';
import { PLANE_FILTER_ITEMS, toPersianDigits } from '../../lib/graph/schema.ts';
import type { LayoutMode, RelationPlaneKey } from '../../lib/graph/types.ts';
import type { GraphUiState } from '../../stores/garden.ts';

interface GraphSettingsPopoverProps {
  open: boolean;
  state: GraphUiState;
  onPatch: (patch: Partial<GraphUiState>) => void;
  onReset: () => void;
  onClose: () => void;
}

export function GraphSettingsPopover({
  open,
  state,
  onPatch,
  onReset,
  onClose,
}: GraphSettingsPopoverProps) {
  if (!open) return null;

  return (
    <div
      className="kg-settings-popup slsg-popup-menu"
      role="dialog"
      aria-label="تنظیمات گراف دانش"
      data-graph-settings-popup
    >
      <div className="kg-popup-header">
        <strong>تنظیمات گراف</strong>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="kg-popup-reset inline-flex items-center gap-1"
            onClick={onReset}
            title="بازگردانی به مقادیر پیش‌فرض"
          >
            <RotateCcw size={11} aria-hidden="true" />
            <span>بازگردانی</span>
          </button>
          <button
            type="button"
            className="kg-popup-reset inline-flex items-center justify-center w-6 px-0"
            onClick={onClose}
            aria-label="بستن تنظیمات گراف"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="kg-field-label">
        <span>عمق همسایگی</span>
        <select
          value={String(state.depth)}
          onChange={(e) => onPatch({ depth: Number.parseInt(e.target.value, 10) })}
          aria-label="عمق همسایگی"
        >
          <option value="0">۰ — فقط همین یادداشت</option>
          <option value="1">۱ — همسایگان مستقیم</option>
          <option value="2">۲ — همسایگی دوگام</option>
          <option value="3">۳ — همسایگی سه‌گام</option>
          <option value="4">۴ — همسایگی چهارگام</option>
          <option value="5">۵ — کل باغ ریاضی</option>
        </select>
      </label>

      <label className="kg-field-label">
        <span>حالت چیدمان</span>
        <select
          value={state.layoutMode}
          onChange={(e) => onPatch({ layoutMode: e.target.value as LayoutMode })}
          aria-label="حالت چیدمان گراف"
        >
          <option value="force">شبکه فیزیکی (Force)</option>
          <option value="dag">سلسله‌مراتب پیش‌نیازی (DAG)</option>
        </select>
      </label>

      <label className="kg-field-label">
        <span>صفحه معنایی روابط</span>
        <select
          value={state.activePlaneFilter ?? 'all'}
          onChange={(e) =>
            onPatch({
              activePlaneFilter:
                e.target.value === 'all' ? null : (e.target.value as RelationPlaneKey),
            })
          }
          aria-label="فیلتر صفحه معنایی روابط"
        >
          <option value="all">همه سطوح روابط</option>
          {PLANE_FILTER_ITEMS.map((plane) => (
            <option key={plane.key} value={plane.key}>
              {plane.label}
            </option>
          ))}
        </select>
      </label>

      <label className="kg-toggle-row">
        <input
          type="checkbox"
          checked={state.typedOnly}
          onChange={(e) => onPatch({ typedOnly: e.target.checked })}
        />
        <span>فقط روابط تایپ‌شده UMKO</span>
      </label>

      <label className="kg-toggle-row">
        <input
          type="checkbox"
          checked={state.renderArrows}
          onChange={(e) => onPatch({ renderArrows: e.target.checked })}
        />
        <span>نمایش پیکان جهت پیوندها</span>
      </label>

      <label className="kg-toggle-row">
        <input
          type="checkbox"
          checked={state.renderLabels}
          onChange={(e) => onPatch({ renderLabels: e.target.checked })}
        />
        <span>نمایش برچسب گره‌ها و یال‌ها</span>
      </label>

      <div className="slsg-value-slider">
        <div className="kg-slider-top">
          <span className="slsg-value-slider-label">نیروی دافعه</span>
          <span>{toPersianDigits(state.repelForce)}</span>
        </div>
        <input
          type="range"
          min={40}
          max={450}
          step={10}
          value={state.repelForce}
          onChange={(e) => onPatch({ repelForce: Number.parseFloat(e.target.value) })}
          aria-label="نیروی دافعه"
        />
      </div>

      <div className="slsg-value-slider">
        <div className="kg-slider-top">
          <span className="slsg-value-slider-label">فاصله برخورد گره‌ها</span>
          <span>{toPersianDigits(state.colliderPadding)}</span>
        </div>
        <input
          type="range"
          min={8}
          max={60}
          step={2}
          value={state.colliderPadding}
          onChange={(e) => onPatch({ colliderPadding: Number.parseFloat(e.target.value) })}
          aria-label="فاصله برخورد گره‌ها"
        />
      </div>

      <div className="slsg-value-slider">
        <div className="kg-slider-top">
          <span className="slsg-value-slider-label">طول پیوندها</span>
          <span>{toPersianDigits(state.linkDistance)}</span>
        </div>
        <input
          type="range"
          min={60}
          max={240}
          step={10}
          value={state.linkDistance}
          onChange={(e) => onPatch({ linkDistance: Number.parseFloat(e.target.value) })}
          aria-label="طول پیوندها"
        />
      </div>

      <div className="slsg-value-slider">
        <div className="kg-slider-top">
          <span className="slsg-value-slider-label">جاذبه مرکزی</span>
          <span>{toPersianDigits(state.centerForce.toFixed(2))}</span>
        </div>
        <input
          type="range"
          min={0.02}
          max={0.45}
          step={0.01}
          value={state.centerForce}
          onChange={(e) => onPatch({ centerForce: Number.parseFloat(e.target.value) })}
          aria-label="جاذبه مرکزی"
        />
      </div>
    </div>
  );
}
