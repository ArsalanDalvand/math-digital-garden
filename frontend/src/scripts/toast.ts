export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
  actionLabel?: string;
  href?: string;
  onAction?: () => void;
}

const REGION_ATTR = 'data-garden-toast-region';
const MAX_TOASTS = 3;

function getRegion(): HTMLElement {
  let region = document.querySelector<HTMLElement>(`[${REGION_ATTR}]`);
  if (region) return region;
  region = document.createElement('div');
  region.setAttribute(REGION_ATTR, '');
  region.className = 'garden-toast-region';
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'اعلان‌ها');
  document.body.append(region);
  return region;
}

/**
 * Display a lightweight non-blocking toast notification with optional CTA button/link.
 */
export function showToast(text: string, options: ToastOptions = {}): void {
  if (typeof document === 'undefined' || !text) return;
  const variant = options.variant ?? 'info';
  const region = getRegion();

  while (region.children.length >= MAX_TOASTS) {
    region.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = `garden-toast garden-toast-${variant}`;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');

  const body = document.createElement('span');
  body.className = 'garden-toast-text';
  body.textContent = text;
  toast.append(body);

  if (options.actionLabel) {
    if (options.href) {
      const link = document.createElement('a');
      link.className = 'garden-toast-action';
      link.href = options.href;
      link.textContent = options.actionLabel;
      toast.append(link);
    } else if (options.onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'garden-toast-action';
      btn.textContent = options.actionLabel;
      btn.addEventListener('click', () => {
        options.onAction?.();
        dismiss();
      });
      toast.append(btn);
    }
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'garden-toast-close';
  close.setAttribute('aria-label', 'بستن اعلان');
  close.textContent = '×';
  toast.append(close);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 160);
  };

  const duration = options.durationMs ?? (options.actionLabel ? 5500 : 3200);
  const startTimer = () => {
    if (duration <= 0) return;
    clearTimeout(timer);
    timer = setTimeout(dismiss, duration);
  };

  close.addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', startTimer);
  toast.addEventListener('focusin', () => clearTimeout(timer));
  toast.addEventListener('focusout', startTimer);

  region.append(toast);
  startTimer();
}
