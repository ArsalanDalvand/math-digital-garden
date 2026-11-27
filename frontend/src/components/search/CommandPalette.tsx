import { Dialog } from '@base-ui/react/dialog';
import {
  BookOpen,
  Compass,
  CornerDownLeft,
  FolderOpen,
  Loader2,
  Search,
  SunMoon,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { bookDisplayLabel, stripInlineMarkdown } from '../../lib/search-format.mjs';

interface SearchResultItem {
  slug: string;
  title: string;
  book_slug?: string;
  kind?: string;
  kind_label?: string;
  kind_color?: string;
  slogan?: string;
  snippet?: string;
}

const KIND_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'همه' },
  { key: 'assertion', label: 'قضیه' },
  { key: 'concept', label: 'مفهوم' },
  { key: 'problem', label: 'مسئله' },
  { key: 'visual_lab', label: 'آزمایشگاه' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedKind, setSelectedKind] = useState('');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const abortRef = useRef<AbortController | null>(null);

  const openPalette = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    const win = window as { __gardenOpenCmdkQueued?: boolean };
    document.documentElement.dataset.cmdkReady = 'true';
    if (win.__gardenOpenCmdkQueued) {
      win.__gardenOpenCmdkQueued = false;
      setOpen(true);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onCustomOpen = () => {
      win.__gardenOpenCmdkQueued = false;
      openPalette();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('garden:open-command-palette', onCustomOpen);
    return () => {
      document.documentElement.removeAttribute('data-cmdk-ready');
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('garden:open-command-palette', onCustomOpen);
    };
  }, [openPalette]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const params = new URLSearchParams({ limit: '12' });
        if (query.trim()) params.set('q', query.trim());
        if (selectedKind) params.set('kind', selectedKind);
        const res = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search unavailable');
        const data = (await res.json()) as {
          total?: number;
          items?: SearchResultItem[];
        };
        if (!controller.signal.aborted) {
          const nextItems = Array.isArray(data.items) ? data.items : [];
          setItems(nextItems);
          setTotal(typeof data.total === 'number' ? data.total : nextItems.length);
          setActiveIndex(0);
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !controller.signal.aborted) {
          setErrorMsg('امکان جست‌وجوی لحظه‌ای موقتاً فراهم نیست.');
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, selectedKind]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const navigateToItem = useCallback((item: SearchResultItem | undefined) => {
    if (!item?.slug) return;
    setOpen(false);
    window.location.assign(`/notes/${encodeURIComponent(item.slug)}`);
  }, []);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length > 0) {
        setActiveIndex((prev) => (prev + 1) % items.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) {
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    } else if (event.key === 'Enter' && items.length > 0) {
      event.preventDefault();
      navigateToItem(items[activeIndex] ?? items[0]);
    }
  };

  const fullSearchParams = new URLSearchParams();
  if (query.trim()) fullSearchParams.set('q', query.trim());
  if (selectedKind) fullSearchParams.set('kind', selectedKind);
  const fullSearchQuery = fullSearchParams.toString();
  const fullSearchHref = `/search${fullSearchQuery ? `?${fullSearchQuery}` : ''}`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          dir="rtl"
          data-command-palette
          initialFocus={inputRef}
          className="fixed inset-x-0 top-[8vh] z-[80] mx-auto flex max-h-[82vh] w-[min(660px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
        >
          <Dialog.Title className="sr-only">جست‌وجوی سریع یادداشت‌ها</Dialog.Title>

          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              data-command-input
              maxLength={200}
              placeholder="جست‌وجوی قضیه، تعریف، عنوان یا متن یادداشت…"
              aria-label="جست‌وجوی سریع"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query.length > 0 && (
              <button
                type="button"
                aria-label="پاک کردن عبارت"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
            <Dialog.Close
              type="button"
              aria-label="بستن"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <fieldset
            className="m-0 flex items-center gap-1.5 overflow-x-auto border-0 border-b border-border bg-muted/30 px-3.5 py-2"
            data-command-kind-filters
          >
            <legend className="sr-only">فیلتر نوع یادداشت</legend>
            {KIND_FILTERS.map((kf) => {
              const pressed = selectedKind === kf.key;
              return (
                <button
                  key={kf.key || 'all'}
                  type="button"
                  data-command-kind={kf.key}
                  aria-pressed={pressed}
                  onClick={() => setSelectedKind(kf.key)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    pressed
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {kf.label}
                </button>
              );
            })}
          </fieldset>

          <div className="min-h-[160px] max-h-[52vh] overflow-y-auto p-2">
            {!query.trim() && !selectedKind && (
              <div className="mb-2 border-b border-border pb-2" data-command-quick-actions>
                <div className="px-2.5 pb-1 text-[11px] font-semibold text-muted-foreground">
                  دسترسی سریع
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <button
                    type="button"
                    data-command-action="theme"
                    onClick={() => {
                      document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.click();
                      setOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
                  >
                    <SunMoon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>تغییر پوسته</span>
                  </button>
                  <a
                    href="/search"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground no-underline hover:bg-accent"
                  >
                    <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>جست‌وجوی کامل</span>
                  </a>
                  <a
                    href="/sample"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground no-underline hover:bg-accent"
                  >
                    <Compass className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>یادداشت نمونه</span>
                  </a>
                  <a
                    href="/library"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground no-underline hover:bg-accent"
                  >
                    <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>کتابخانه</span>
                  </a>
                </div>
              </div>
            )}

            {errorMsg ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {errorMsg}
              </p>
            ) : items.length === 0 ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {loading
                  ? 'در حال جست‌وجو…'
                  : 'یادداشتی با این عبارت پیدا نشد. عبارت کوتاه‌تر یا نوع دیگری انتخاب کنید.'}
              </p>
            ) : (
              <ul
                aria-label="نتایج جست‌وجو"
                className="m-0 flex list-none flex-col gap-1 p-0"
                data-command-results
              >
                {items.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const subtitle = stripInlineMarkdown(item.slogan || item.snippet || '');
                  const bookLabel = bookDisplayLabel(item.book_slug);
                  return (
                    <li key={item.slug}>
                      <a
                        ref={(el) => {
                          itemRefs.current[idx] = el;
                        }}
                        href={`/notes/${encodeURIComponent(item.slug)}`}
                        data-command-item={item.slug}
                        data-active={isActive ? 'true' : undefined}
                        aria-current={isActive ? 'true' : undefined}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-right no-underline transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-muted/70'
                        }`}
                      >
                        <span
                          className="mt-1.5 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.kind_color || 'var(--primary)' }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{item.title}</span>
                            {item.kind_label && (
                              <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {item.kind_label}
                              </span>
                            )}
                            {bookLabel && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <BookOpen className="size-3" aria-hidden="true" />
                                {bookLabel}
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {subtitle}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <CornerDownLeft
                            className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                <kbd
                  dir="ltr"
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                >
                  ↑↓
                </kbd>{' '}
                حرکت
              </span>
              <span>
                <kbd
                  dir="ltr"
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                >
                  Enter
                </kbd>{' '}
                باز کردن
              </span>
              <span>
                <kbd
                  dir="ltr"
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                >
                  Esc
                </kbd>{' '}
                بستن
              </span>
            </div>
            <a
              href={fullSearchHref}
              className="font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              نمایش همه ({total.toLocaleString('fa-IR')})
            </a>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CommandPalette;
