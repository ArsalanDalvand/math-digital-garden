import { Dialog } from '@base-ui/react/dialog';
import { BookOpen, CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const BOOK_LABELS: Record<string, string> = {
  axler: 'جبر خطی آکسلر',
  'abstract-algebra': 'مبانی جبر و ماتریس‌ها',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
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
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

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

  const fullSearchHref = `/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          dir="rtl"
          data-command-palette
          initialFocus={inputRef}
          className="fixed inset-x-0 top-[9vh] z-[80] mx-auto flex max-h-[80vh] w-[min(640px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl outline-none"
        >
          <Dialog.Title className="sr-only">جست‌وجوی سریع یادداشت‌ها</Dialog.Title>

          <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
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
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <Dialog.Close
              type="button"
              aria-label="بستن"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="min-h-[140px] max-h-[54vh] overflow-y-auto p-2">
            {errorMsg ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {errorMsg}
              </p>
            ) : items.length === 0 ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {loading
                  ? 'در حال جست‌وجو…'
                  : 'یادداشتی با این عبارت پیدا نشد. عبارت کوتاه‌تر یا واژهٔ کلیدی دیگری بنویسید.'}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" data-command-results>
                {items.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const subtitle = item.slogan || item.snippet || '';
                  const bookLabel = (item.book_slug && BOOK_LABELS[item.book_slug]) || item.book_slug;
                  return (
                    <li key={item.slug}>
                      <a
                        href={`/notes/${encodeURIComponent(item.slug)}`}
                        data-command-item={item.slug}
                        data-active={isActive ? 'true' : undefined}
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
                              <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
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
                <kbd dir="ltr" className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
                  ↑↓
                </kbd>{' '}
                حرکت
              </span>
              <span>
                <kbd dir="ltr" className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
                  Enter
                </kbd>{' '}
                باز کردن
              </span>
              <span>
                <kbd dir="ltr" className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
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
