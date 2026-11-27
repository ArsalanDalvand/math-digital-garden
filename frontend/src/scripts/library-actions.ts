import type { MergeView as CodeMirrorMergeView } from '@codemirror/merge';
import { filterCommentThreads, renderCommentHtml } from '../lib/comment-render.mjs';
import { summarizeDiffStats } from '../lib/editor-sync.mjs';
import {
  attachmentKind,
  attachmentMarkdownLink,
  formatFileSize,
} from '../lib/format-size.mjs';
import { type Account, applyPreferences } from './account-preferences';
import { ApiError, message, api as request } from './api';
import { publicationHref, threadComments } from './library-utils.mjs';
import { getSession } from './session';
import { showToast } from './toast';

type Item = {
  id: string;
  title: string;
  content: string;
  current_hash: string;
  visibility: string;
  share_token: string;
  verified: boolean;
  published_hash?: string;
  updated_at?: string;
  favorite?: boolean;
  has_git?: boolean;
  root_folder_id?: string;
};

type CommentRow = {
  id: string;
  content: string;
  user_id: string;
  author_name?: string;
  author_role?: string;
  created_at: string;
  parent_id?: string | null;
  resolved?: boolean;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};

const button = (text: string, action: () => void, className?: string) => {
  const b = el('button', text, className);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
};

function createAttachmentIcon(kind: 'image' | 'pdf' | 'archive' | 'file'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = (d: string) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  };

  if (kind === 'image') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '18');
    rect.setAttribute('height', '18');
    rect.setAttribute('x', '3');
    rect.setAttribute('y', '3');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '9');
    circle.setAttribute('cy', '9');
    circle.setAttribute('r', '2');
    svg.append(rect, circle);
    path('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21');
  } else if (kind === 'archive') {
    path('M21 8v13H3V8');
    path('M1 3h22v5H1z');
    path('M10 12h4');
  } else {
    path('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z');
    path('M14 2v4a2 2 0 0 0 2 2h4');
    if (kind === 'pdf') {
      path('M10 9H8');
      path('M16 13H8');
      path('M16 17H8');
    }
  }
  return svg;
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ع';
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`;
}

function attachMathPreview(textarea: HTMLTextAreaElement, previewHost: HTMLElement) {
  const update = () => {
    const val = textarea.value;
    if (!val.includes('$')) {
      previewHost.hidden = true;
      previewHost.replaceChildren();
      return;
    }
    previewHost.hidden = false;
    previewHost.innerHTML = renderCommentHtml(val);
  };
  textarea.addEventListener('input', update);
  update();
}

const flushEditor = () =>
  new Promise<{ content: string; hash: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ذخیره کامل نشد؛ دوباره تلاش کنید.')), 15000);
    document.dispatchEvent(
      new CustomEvent('garden:flush-note', {
        detail: {
          resolve: (value: { content: string; hash: string }) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error: unknown) => {
            clearTimeout(timeout);
            reject(error);
          },
        },
      }),
    );
  });

for (const root of document.querySelectorAll<HTMLElement>('[data-library-actions]')) {
  let id = root.dataset.libraryActions!;
  let base = '/library/items/' + encodeURIComponent(id);
  const canonicalSlug = root.dataset.canonicalSlug;
  const publicView = root.dataset.public === 'true';
  const token = root.dataset.token || '';
  const originalTitle = document.querySelector('.workspace-document > h1')?.textContent || '';

  const displayTitle = (title: string) => {
    for (const heading of document.querySelectorAll<HTMLElement>(
      '.workspace-document > h1,.document-location',
    ))
      heading.textContent = title;
    const locationLabel = document.querySelector<HTMLElement>('.document-location');
    if (locationLabel) locationLabel.title = title;
  };

  const suffix = token ? '?token=' + encodeURIComponent(token) : '';
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const body = root.querySelector<HTMLElement>('[data-library-body]')!;
  const status = root.querySelector<HTMLElement>('[data-library-status]')!;
  const dialogStatus = root.querySelector<HTMLElement>('[data-library-dialog-status]')!;

  let item: Item;
  let user: any;
  let watching = false;
  let epoch = 0;
  let runEpoch = 0;
  let busy = false;
  let invalid = false;
  let identity: string | null | undefined;
  let historyMergeView: CodeMirrorMergeView | undefined;
  const stale = new Error('Stale library action');

  const cleanupHistoryMerge = () => {
    historyMergeView?.destroy();
    historyMergeView = undefined;
  };

  const api = async <T = any>(path: string, data?: unknown, method?: string): Promise<T> => {
    const started = epoch;
    if (invalid || runEpoch !== epoch) throw stale;
    const value = await request<T>(path, data, method);
    if (
      invalid ||
      started !== epoch ||
      (path === '/auth/me' && identity !== undefined && (value as any)?.id !== identity)
    )
      throw stale;
    return value;
  };

  const flush = async () => {
    const started = epoch;
    const value = await flushEditor();
    if (invalid || started !== epoch) throw stale;
    return value;
  };

  const run = async (action: () => Promise<void>) => {
    if (busy || invalid) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    document
      .querySelectorAll<HTMLButtonElement>('[data-library-command]')
      .forEach((btn) => (btn.disabled = true));
    runEpoch = epoch;
    try {
      status.textContent = '';
      dialogStatus.textContent = '';
      await action();
    } catch (error) {
      if (error !== stale && !invalid) {
        status.textContent = message(error);
        dialogStatus.textContent = message(error);
      }
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
      if (!invalid)
        document
          .querySelectorAll<HTMLButtonElement>('[data-library-command]')
          .forEach((btn) => (btn.disabled = false));
    }
  };

  dialog.addEventListener('close', () => {
    epoch++;
    cleanupHistoryMerge();
    body.replaceChildren();
    dialogStatus.textContent = '';
    dialog.dataset.dialogMode = 'modal';
    continued.clear();
    document.querySelector<HTMLButtonElement>('[data-more-toggle]')?.focus();
  });

  document.addEventListener('garden:identity', (event) => {
    const next = (event as CustomEvent).detail?.id ?? null;
    if (identity === undefined) {
      identity = next;
      return;
    }
    if (identity === next) return;
    identity = next;
    epoch++;
    invalid = true;
    cleanupHistoryMerge();
    if (canonicalSlug) {
      displayTitle(originalTitle);
      id = '';
      root.dataset.libraryActions = '';
    }
    item = undefined as unknown as Item;
    user = undefined;
    continued.clear();
    body.replaceChildren();
    if (dialog.open) dialog.close();
    root.querySelectorAll('button').forEach((btn) => (btn.disabled = true));
    document
      .querySelectorAll<HTMLButtonElement>('[data-library-command]')
      .forEach((btn) => (btn.disabled = true));
    const info = find('[data-library-info]');
    if (info) info.textContent = '';
    status.textContent = 'حساب تغییر کرد؛ صفحه را دوباره بارگذاری کنید.';
  });

  const open = (title: string, mode: 'modal' | 'sheet' = 'modal') => {
    cleanupHistoryMerge();
    body.replaceChildren();
    dialog.dataset.dialogMode = mode;
    root.querySelector('[data-library-title]')!.textContent = title;
    if (!dialog.open) dialog.showModal();
  };

  const list = (className = 'library-list') => {
    const n = el('ul', undefined, className);
    body.append(n);
    return n;
  };

  const form = (
    label: string,
    value: string,
    submit: (value: string) => Promise<void>,
    multiline = false,
    submitText = 'ذخیره',
  ) => {
    const f = el('form', undefined, 'library-form');
    const l = el('label', label);
    const input = multiline ? el('textarea') : el('input');
    input.value = value;
    input.required = true;
    input.maxLength = multiline ? 10000 : 255;
    l.append(input);
    f.append(l);
    const b = el('button', submitText);
    b.type = 'submit';
    f.append(b);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      void run(async () => {
        b.disabled = true;
        try {
          await submit(input.value);
        } finally {
          b.disabled = false;
        }
      });
    });
    body.append(f);
    return f;
  };

  const continued = new Map<string, any[]>();
  const exhausted = new Set<string>();
  const all = async (path: string, reload: () => Promise<void>) => {
    const carried = continued.get(path);
    continued.delete(path);
    if (!carried) exhausted.delete(path);
    const rows =
      carried || (await api<any[]>(path + (path.includes('?') ? '&' : '?') + 'offset=0&limit=100'));
    if (rows.length >= 100) {
      const notice = el(
        'p',
        rows.length >= 1000
          ? 'حداکثر ۱۰۰۰ مورد نمایش داده شده است؛ موارد بیشتر در این نما بارگذاری نمی‌شوند.'
          : exhausted.has(path)
            ? `${rows.length.toLocaleString('fa')} مورد بارگذاری شد.`
            : `${rows.length.toLocaleString('fa')} مورد بارگذاری شده است؛ ممکن است موارد بیشتری وجود داشته باشد.`,
      );
      body.append(notice);
      if (!exhausted.has(path) && rows.length < 1000 && rows.length % 100 === 0) {
        const more = button('بارگذاری ۱۰۰ مورد دیگر', () =>
          void run(async () => {
            more.disabled = true;
            try {
              const next = await api<any[]>(
                path + (path.includes('?') ? '&' : '?') + 'offset=' + rows.length + '&limit=100',
              );
              if (next.length < 100) exhausted.add(path);
              continued.set(path, [...rows, ...next]);
              await reload();
            } finally {
              more.disabled = false;
            }
          }),
        );
        body.append(more);
      }
    }
    return rows;
  };

  const find = (selector: string) =>
    root.querySelector<HTMLElement>(selector) ||
    document.querySelector<HTMLElement>('[data-note-more]')?.querySelector<HTMLElement>(selector) ||
    document
      .querySelector<HTMLElement>('[data-note-extra-actions]')
      ?.querySelector<HTMLElement>(selector);

  const refresh = async () => {
    if (!publicView) {
      item = await api<Item>(base);
      const wordCount = item.content.trim().split(/\s+/u).filter(Boolean).length;
      find('[data-library-info]')!.textContent =
        `${item.title} · آخرین تغییر: ${new Date(item.updated_at || '').toLocaleString('fa')} · ${wordCount.toLocaleString('fa')} واژه`;
      const fav = find('[data-library-command="favorite"]');
      if (fav) fav.textContent = item.favorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها';
      const gitSyncBtn = find('[data-library-command="gitsync"]');
      if (gitSyncBtn) gitSyncBtn.hidden = !item.has_git || !item.root_folder_id;
    }
    const f = await api<any>(base + '/favorite' + suffix);
    if (!item) item = {} as Item;
    item.favorite = f.favorite;
    const favoriteButton = find('[data-library-command="favorite"]');
    if (favoriteButton)
      favoriteButton.textContent = f.favorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها';
    const w = await api<any>(base + '/watch' + suffix);
    watching = w.watching;
    if (w.watching && w.updated) await api(base + '/watch' + suffix, { watching: true }, 'PUT');
    find('[data-library-command="watch"]')!.textContent = watching
      ? 'توقف پیگیری'
      : 'پیگیری یادداشت';
  };

  root.querySelector('[data-library-close]')!.addEventListener('click', () => dialog.close());
  const menu = document.querySelector('[data-note-more]');
  const top = document.querySelector('[data-note-extra-actions]');
  if (menu) menu.append(root.querySelector('[data-library-menu]')!);
  else {
    const details = el('details');
    const summary = el('summary', 'کنش‌های یادداشت');
    details.append(summary, root.querySelector('[data-library-menu]')!);
    root.prepend(details);
  }
  if (top) top.append(root.querySelector('[data-library-top]')!);
  if (publicView) {
    for (const command of ['share', 'markdown', 'history', 'rename', 'move', 'trash'])
      document.querySelectorAll(`[data-library-command="${command}"]`).forEach((b) => b.remove());
  }

  let commentFilter: 'all' | 'open' | 'resolved' = 'all';
  let activeReplyParentId: string | null = null;
  let activeEditCommentId: string | null = null;
  let pendingDeleteCommentId: string | null = null;

  const comments = async () => {
    open(canonicalSlug ? 'دیدگاه‌های جزوهٔ اصلی' : 'دیدگاه‌ها', 'sheet');
    if (!user) {
      const guestCard = el('div', undefined, 'library-guest-card');
      guestCard.append(
        el(
          'p',
          canonicalSlug
            ? 'این بخش برای پرسش و گفت‌وگو دربارهٔ جزوهٔ رسمی است. برای خواندن و نوشتن دیدگاه‌ها وارد حساب کاربری خود شوید.'
            : 'برای مشاهده و ثبت دیدگاه روی این یادداشت وارد حساب کاربری شوید.',
        ),
      );
      const loginLink = el('a', 'ورود یا ثبت‌نام در باغ ریاضی', 'garden-button-primary');
      loginLink.href = '/account';
      guestCard.append(loginLink);
      body.append(guestCard);
      return;
    }

    const commentBase = canonicalSlug
      ? '/library/canonical/' + encodeURIComponent(canonicalSlug)
      : base;
    const rows: CommentRow[] = await all(commentBase + '/comments' + suffix, comments);
    const sheetHost = el('div', undefined, 'comments-sheet-host');
    body.append(sheetHost);

    const paintComments = () => {
      const prevScroll = dialog.scrollTop;
      sheetHost.replaceChildren();

      if (canonicalSlug) {
        sheetHost.append(
          el(
            'p',
            'گفت‌وگوی عمومی دربارهٔ نسخهٔ رسمی این یادداشت برای همهٔ اعضای واردشده.',
            'comments-subtitle',
          ),
        );
      }

      const allThreads = threadComments(rows) as (CommentRow & { replies: CommentRow[] })[];
      const { items: filteredThreads, counts } = filterCommentThreads(allThreads, commentFilter);

      const filterBar = el('div', undefined, 'comments-filter-bar');
      filterBar.setAttribute('role', 'group');
      filterBar.setAttribute('aria-label', 'فیلتر وضعیت دیدگاه‌ها');
      for (const [key, label] of [
        ['all', `همه (${counts.all.toLocaleString('fa')})`],
        ['open', `باز (${counts.open.toLocaleString('fa')})`],
        ['resolved', `حل‌شده (${counts.resolved.toLocaleString('fa')})`],
      ] as const) {
        const pill = button(label, () => {
          commentFilter = key;
          activeReplyParentId = null;
          paintComments();
        }, 'comment-filter-pill');
        pill.dataset.filter = key;
        pill.setAttribute('aria-pressed', String(commentFilter === key));
        filterBar.append(pill);
      }
      sheetHost.append(filterBar);

      if (filteredThreads.length === 0) {
        const empty = el('div', undefined, 'library-empty-state');
        empty.append(
          el(
            'p',
            counts.all === 0
              ? 'هنوز دیدگاهی ثبت نشده است. نخستین پرسش یا نکته را بنویسید.'
              : 'دیدگاهی در این دسته وجود ندارد.',
          ),
        );
        sheetHost.append(empty);
      } else {
        const ul = el('ul', undefined, 'library-list comment-thread-list');
        const renderCommentCard = (entry: CommentRow, isReply: boolean) => {
          const card = el(
            'div',
            undefined,
            isReply ? 'comment-card comment-reply-card' : 'comment-card',
          );
          const isMine = entry.user_id === user?.id;
          const displayName =
            entry.author_name?.trim() ||
            (isMine ? 'شما' : entry.author_role === 'author' ? 'مؤلف' : 'عضو باغ');

          const headerRow = el('div', undefined, 'comment-card-header');
          const authorMeta = el('div', undefined, 'comment-author-meta');
          authorMeta.append(el('span', authorInitials(displayName), 'comment-avatar'));
          authorMeta.append(el('strong', displayName, 'comment-author-name'));
          if (entry.author_role === 'author' || entry.author_role === 'admin') {
            authorMeta.append(
              el('span', entry.author_role === 'admin' ? 'مدیر' : 'مؤلف', 'comment-role-pill'),
            );
          }
          if (isMine) {
            authorMeta.append(el('span', 'شما', 'comment-self-pill'));
          }
          authorMeta.append(
            el('time', new Date(entry.created_at).toLocaleString('fa'), 'comment-time'),
          );
          headerRow.append(authorMeta);

          if (!isReply) {
            const resolvedPill = el(
              'span',
              entry.resolved ? 'حل‌شده' : 'باز',
              'comment-status-pill',
            );
            resolvedPill.dataset.resolved = String(Boolean(entry.resolved));
            headerRow.append(resolvedPill);
          }
          card.append(headerRow);

          if (activeEditCommentId === entry.id) {
            const editForm = el('form', undefined, 'comment-inline-form');
            const textarea = el('textarea');
            textarea.value = entry.content;
            textarea.required = true;
            textarea.maxLength = 10000;
            textarea.setAttribute('aria-label', 'ویرایش متن دیدگاه');
            const preview = el('div', undefined, 'comment-math-preview');
            preview.hidden = true;
            attachMathPreview(textarea, preview);

            const btnRow = el('div', undefined, 'comment-inline-form-actions');
            const saveBtn = el('button', 'ذخیره ویرایش', 'garden-button-primary');
            saveBtn.type = 'submit';
            const cancelBtn = button('انصراف', () => {
              activeEditCommentId = null;
              paintComments();
            });
            btnRow.append(saveBtn, cancelBtn);
            editForm.append(textarea, preview, btnRow);
            editForm.addEventListener('submit', (e) => {
              e.preventDefault();
              void run(async () => {
                saveBtn.disabled = true;
                try {
                  await api(
                    commentBase + '/comments/' + entry.id + suffix,
                    { content: textarea.value },
                    'PATCH',
                  );
                  activeEditCommentId = null;
                  showToast('دیدگاه ویرایش شد.', { variant: 'success' });
                  await comments();
                } finally {
                  saveBtn.disabled = false;
                }
              });
            });
            card.append(editForm);
          } else {
            const contentBox = el('div', undefined, 'comment-body');
            contentBox.dir = 'auto';
            contentBox.innerHTML = renderCommentHtml(entry.content);
            card.append(contentBox);
          }

          const actions = el('div', undefined, 'library-actions-inline');
          if (isMine && entry.content !== '[deleted]' && activeEditCommentId !== entry.id) {
            actions.append(
              button('ویرایش', () => {
                activeEditCommentId = entry.id;
                activeReplyParentId = null;
                pendingDeleteCommentId = null;
                paintComments();
              }),
            );
            if (pendingDeleteCommentId === entry.id) {
              actions.append(
                button(
                  'تأیید حذف',
                  () =>
                    void run(async () => {
                      await api(commentBase + '/comments/' + entry.id + suffix, undefined, 'DELETE');
                      pendingDeleteCommentId = null;
                      showToast('دیدگاه حذف شد.', { variant: 'info' });
                      await comments();
                    }),
                  'is-danger-confirm',
                ),
                button('انصراف', () => {
                  pendingDeleteCommentId = null;
                  paintComments();
                }),
              );
            } else {
              actions.append(
                button('حذف', () => {
                  pendingDeleteCommentId = entry.id;
                  paintComments();
                }),
              );
            }
          }

          if (!isReply) {
            actions.append(
              button(activeReplyParentId === entry.id ? 'بستن پاسخ' : 'پاسخ', () => {
                activeReplyParentId = activeReplyParentId === entry.id ? null : entry.id;
                activeEditCommentId = null;
                pendingDeleteCommentId = null;
                paintComments();
              }),
            );
            const canResolve = canonicalSlug
              ? ['author', 'admin'].includes(user?.role)
              : !publicView || user?.role === 'admin';
            if (canResolve) {
              actions.append(
                button(
                  entry.resolved ? 'بازکردن دوباره' : 'علامت حل‌شده',
                  () =>
                    void run(async () => {
                      await api(
                        commentBase + '/comments/' + entry.id + '/resolve' + suffix,
                        { resolved: !entry.resolved },
                        'PUT',
                      );
                      await comments();
                    }),
                ),
              );
            }
          }

          if (actions.childElementCount > 0) card.append(actions);
          return card;
        };

        for (const c of filteredThreads) {
          const li = el('li', undefined, 'comment-thread-card');
          li.append(renderCommentCard(c, false));
          if (c.replies.length > 0) {
            const repliesWrap = el('div', undefined, 'comment-replies-list');
            c.replies.forEach((r) => repliesWrap.append(renderCommentCard(r, true)));
            li.append(repliesWrap);
          }
          if (activeReplyParentId === c.id) {
            const replyForm = el('form', undefined, 'comment-inline-form comment-reply-form');
            const label = el('label', 'پاسخ شما (پشتیبانی از فرمول با $...$)');
            const textarea = el('textarea');
            textarea.required = true;
            textarea.maxLength = 10000;
            textarea.placeholder = 'پاسخ خود را بنویسید…';
            label.append(textarea);
            const preview = el('div', undefined, 'comment-math-preview');
            preview.hidden = true;
            attachMathPreview(textarea, preview);
            const btnRow = el('div', undefined, 'comment-inline-form-actions');
            const submitReply = el('button', 'ارسال پاسخ', 'garden-button-primary');
            submitReply.type = 'submit';
            const cancelReply = button('انصراف', () => {
              activeReplyParentId = null;
              paintComments();
            });
            btnRow.append(submitReply, cancelReply);
            replyForm.append(label, preview, btnRow);
            replyForm.addEventListener('submit', (e) => {
              e.preventDefault();
              void run(async () => {
                submitReply.disabled = true;
                try {
                  await api(commentBase + '/comments' + suffix, {
                    content: textarea.value,
                    parent_id: c.id,
                  });
                  activeReplyParentId = null;
                  showToast('پاسخ ثبت شد.', { variant: 'success' });
                  await comments();
                } finally {
                  submitReply.disabled = false;
                }
              });
            });
            li.append(replyForm);
          }
          ul.append(li);
        }
        sheetHost.append(ul);
      }

      if (canonicalSlug || publicView || item?.published_hash) {
        const composer = el('form', undefined, 'library-form comment-composer-form');
        const label = el('label', 'دیدگاه تازه (پشتیبانی از فرمول ریاضی با $...$ و $$...$$)');
        const textarea = el('textarea');
        textarea.required = true;
        textarea.maxLength = 10000;
        textarea.placeholder = 'پرسش، نکته یا توضیح تکمیلی خود را بنویسید…';
        label.append(textarea);
        const preview = el('div', undefined, 'comment-math-preview');
        preview.dataset.commentMathPreview = '';
        preview.hidden = true;
        attachMathPreview(textarea, preview);
        const submitBtn = el('button', 'ارسال دیدگاه', 'garden-button-primary');
        submitBtn.type = 'submit';
        composer.append(label, preview, submitBtn);
        composer.addEventListener('submit', (e) => {
          e.preventDefault();
          void run(async () => {
            submitBtn.disabled = true;
            try {
              await api(commentBase + '/comments' + suffix, { content: textarea.value });
              showToast('دیدگاه ثبت شد.', { variant: 'success' });
              await comments();
            } finally {
              submitBtn.disabled = false;
            }
          });
        });
        sheetHost.append(composer);
      } else {
        sheetHost.append(
          el(
            'p',
            'برای دیدگاه‌گذاری ابتدا این یادداشت را از بخش «اشتراک‌گذاری» منتشر یا با پیوند به اشتراک بگذارید.',
          ),
        );
      }
      dialog.scrollTop = prevScroll;
    };

    paintComments();
  };

  let pendingDeleteAttachmentId: string | null = null;
  const attachments = async () => {
    open('پیوست‌ها', 'modal');
    const rows = publicView
      ? await all('/library/public/' + id + '/attachments' + suffix, attachments)
      : await all(base + '/attachments', attachments);

    const uploadFile = async (file: File) => {
      if (file.size > 5_000_000 || file.size === 0) {
        throw new Error('اندازهٔ فایل باید بین ۱ بایت و ۵ مگابایت باشد.');
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('خواندن فایل ممکن نشد'));
        reader.readAsDataURL(file);
      });
      await api(base + '/attachments', { filename: file.name, content_base64: data });
      showToast('پیوست بارگذاری شد.', { variant: 'success' });
      await attachments();
    };

    if (!publicView) {
      const dropzone = el('div', undefined, 'attachment-dropzone');
      dropzone.dataset.attachmentDropzone = '';
      dropzone.tabIndex = 0;
      dropzone.setAttribute('role', 'button');
      dropzone.setAttribute('aria-label', 'بارگذاری پیوست تا ۵ مگابایت');

      const dropTitle = el('strong', 'فایل را اینجا رها کنید یا برای انتخاب کلیک کنید');
      const dropHint = el('span', 'تصویر، PDF یا فایل‌های کمکی (حداکثر ۵ مگابایت)', 'attachment-drop-hint');
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.hidden = true;
      dropzone.append(dropTitle, dropHint, fileInput);
      body.append(dropzone);

      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.dataset.dragover = 'true';
      });
      dropzone.addEventListener('dragleave', () => {
        delete dropzone.dataset.dragover;
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        delete dropzone.dataset.dragover;
        const file = e.dataTransfer?.files?.[0];
        if (file) void run(() => uploadFile(file));
      });
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) void run(() => uploadFile(file));
      });
    }

    if (rows.length === 0) {
      const empty = el('div', undefined, 'library-empty-state');
      empty.append(el('p', 'هنوز پیوستی برای این یادداشت بارگذاری نشده است.'));
      body.append(empty);
      return;
    }

    const ul = list('library-list attachment-list');
    for (const a of rows) {
      const li = el('li', undefined, 'attachment-card');
      const kind = attachmentKind(a.filename);
      const downloadUrl =
        '/api/library/' +
        (publicView ? 'public/' + id + '/attachments/' + a.id + suffix : 'attachments/' + a.id);

      const meta = el('div', undefined, 'attachment-card-meta');
      const iconWrap = el('span', undefined, 'attachment-type-icon');
      iconWrap.append(createAttachmentIcon(kind));
      const textWrap = el('div', undefined, 'attachment-text-wrap');
      const link = el('a', a.filename, 'attachment-filename');
      link.href = downloadUrl;
      const sizeSpan = el('small', formatFileSize(a.size), 'attachment-size');
      textWrap.append(link, sizeSpan);
      meta.append(iconWrap, textWrap);

      const actionsRow = el('div', undefined, 'attachment-card-actions');
      actionsRow.append(
        button('کپی کد Markdown', () => {
          const md = attachmentMarkdownLink(a.filename, downloadUrl);
          void navigator.clipboard.writeText(md).then(() => {
            showToast('کد Markdown پیوست کپی شد.', { variant: 'success' });
          });
        }),
      );

      if (!publicView) {
        if (pendingDeleteAttachmentId === a.id) {
          actionsRow.append(
            button(
              'تأیید حذف',
              () =>
                void run(async () => {
                  await api('/library/attachments/' + a.id, undefined, 'DELETE');
                  pendingDeleteAttachmentId = null;
                  showToast('پیوست حذف شد.', { variant: 'info' });
                  await attachments();
                }),
              'is-danger-confirm',
            ),
            button('انصراف', () => {
              pendingDeleteAttachmentId = null;
              void attachments();
            }),
          );
        } else {
          actionsRow.append(
            button('حذف', () => {
              pendingDeleteAttachmentId = a.id;
              void attachments();
            }),
          );
        }
      }

      li.append(meta, actionsRow);
      ul.append(li);
    }
  };

  const actions: Record<string, () => Promise<void>> = {
    link: async () => {
      await navigator.clipboard.writeText(location.href);
      status.textContent = 'پیوند کپی شد.';
      showToast('پیوند یادداشت کپی شد.', { variant: 'success' });
    },
    markdown: async () => {
      let markdownText = '';
      if (!user && canonicalSlug) {
        const note = await api<{ current_content?: string }>(
          '/notes/' + encodeURIComponent(canonicalSlug),
        );
        markdownText = note?.current_content ?? '';
      } else {
        const saved = await flush();
        markdownText = saved.content;
      }
      if (!markdownText) throw new Error('متن Markdown این یادداشت در دسترس نیست.');
      await navigator.clipboard.writeText(markdownText);
      status.textContent = 'Markdown کپی شد.';
      showToast('متن Markdown کپی شد.', { variant: 'success' });
    },
    favorite: async () => {
      await api(base + '/favorite' + suffix, { favorite: !item?.favorite }, 'PUT');
      await refresh();
      document.dispatchEvent(new Event('garden:library'));
      showToast(item?.favorite ? 'به علاقه‌مندی‌ها افزوده شد.' : 'از علاقه‌مندی‌ها حذف شد.', {
        variant: 'success',
      });
    },
    watch: async () => {
      await api(base + '/watch' + suffix, { watching: !watching }, 'PUT');
      await refresh();
      showToast(watching ? 'پیگیری یادداشت فعال شد.' : 'پیگیری یادداشت متوقف شد.', {
        variant: 'info',
      });
    },
    width: async () => {
      const widthSelect = document.querySelector<HTMLSelectElement>(
        '[data-reading-setting="width"]',
      );
      if (!user) {
        const currentWidth = Number(widthSelect?.value || '760');
        const nextWidth = currentWidth === 960 ? 760 : 960;
        if (widthSelect) {
          widthSelect.value = String(nextWidth);
          widthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          document.documentElement.style.setProperty('--reading-width', `${nextWidth}px`);
        }
        showToast(nextWidth === 960 ? 'عرض کامل صفحه فعال شد.' : 'عرض مطالعه به حالت عادی برگشت.', {
          variant: 'info',
        });
        return;
      }
      const account = await api<Account>('/account');
      const preferences = {
        ...account.preferences,
        width: (account.preferences.width === 960 ? 760 : 960) as 760 | 960,
      };
      const updated = await api<Account>('/account/preferences', preferences, 'PATCH');
      applyPreferences(updated.preferences);
      showToast(
        updated.preferences.width === 960
          ? 'عرض کامل صفحه ذخیره شد.'
          : 'عرض مطالعه به حالت عادی برگشت.',
        { variant: 'success' },
      );
    },
    rename: async () => {
      await flush();
      open('تغییر نام', 'modal');
      form('نام یادداشت', item.title, async (title) => {
        await api(base, { title }, 'PATCH');
        location.reload();
      });
    },
    move: async () => {
      await flush();
      open('انتقال به پوشه', 'modal');
      body.append(el('p', 'پوشهٔ مقصد را باز کنید و «انتقال به این پوشه» را بزنید.'));
      const browse = async (parent: string | null) => {
        body.replaceChildren();
        const section = el('section');
        section.dataset.folders = '';
        section.append(
          button(
            'انتقال به این پوشه',
            () =>
              void run(async () => {
                await api(base, { parent_id: parent }, 'PATCH');
                location.reload();
              }),
          ),
          button('ریشهٔ کتابخانه', () => void run(() => browse(null))),
        );
        for (const f of await all('/library/items' + (parent ? '?parent_id=' + parent : ''), () =>
          browse(parent),
        ))
          if (f.kind === 'folder')
            section.append(button(f.title, () => void run(() => browse(f.id))));
        body.append(section);
      };
      await browse(null);
    },
    trash: async () => {
      await flush();
      open('انتقال به زباله‌دان', 'modal');
      const warn = el('p', 'این یادداشت به زباله‌دان کتابخانهٔ شخصی شما منتقل می‌شود.');
      const row = el('div', undefined, 'library-actions-inline');
      row.append(
        button(
          'تأیید و انتقال به زباله‌دان',
          () =>
            void run(async () => {
              await api(base + '/trash', {});
              location.href = '/library';
            }),
          'is-danger-confirm',
        ),
        button('انصراف', () => dialog.close()),
      );
      body.append(warn, row);
    },
    gitsync: async () => {
      if (!item?.root_folder_id) return;
      status.textContent = 'در حال دریافت تغییرات گیت...';
      try {
        const res = await api(`/library/items/${item.root_folder_id}/git-sync`, {}, 'POST');
        status.textContent = res.message || 'بروزرسانی با موفقیت انجام شد.';
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        status.textContent = message(err);
      }
    },
    share: async () => {
      await flush();
      await refresh();
      open('اشتراک‌گذاری و انتشار', 'modal');

      const statusBanner = el('div', undefined, 'share-status-banner');
      const visLabelMap: Record<string, string> = {
        private: 'خصوصی (فقط شما)',
        unlisted: 'اشتراک‌گذاری با پیوند محرمانه',
        public: 'منتشرشده به‌صورت عمومی',
      };
      const badge = el('span', visLabelMap[item.visibility] || 'خصوصی', 'share-vis-pill');
      badge.dataset.visibility = item.visibility;
      statusBanner.append(badge);
      if (item.verified) {
        statusBanner.append(el('span', 'تأییدشده توسط مدیر', 'share-verified-pill'));
      }
      body.append(statusBanner);

      body.append(
        el(
          'p',
          canonicalSlug
            ? 'انتشار فقط نسخهٔ شخصی ذخیره‌شدهٔ شما و پیوست‌های فعلی آن را در دسترس می‌گذارد؛ نسخهٔ رسمی برای دیگران تغییر نمی‌کند.'
            : 'فقط نسخهٔ ذخیره‌شدهٔ همین یادداشت و پیوست‌های فعلی منتشر می‌شوند؛ پوشه‌ها و یادداشت‌های دیگر خصوصی می‌مانند.',
        ),
      );

      const shareForm = el('form', undefined, 'share-visibility-form');
      const radioGrid = el('div', undefined, 'share-radio-grid');

      const rotateRow = el('label', undefined, 'share-rotate-row');
      const rotateCheck = el('input');
      rotateCheck.type = 'checkbox';
      rotateCheck.name = 'rotate_token';
      rotateCheck.checked = item.visibility !== 'unlisted';
      rotateRow.append(rotateCheck, document.createTextNode(' ساخت پیوند تازه (ابطال پیوند قبلی)'));

      const syncRotateVisibility = (selectedVis: string) => {
        rotateRow.hidden = selectedVis !== 'unlisted';
      };

      const options = [
        {
          value: 'private',
          title: 'خصوصی',
          desc: 'فقط در کتابخانهٔ شخصی خودتان قابل دسترسی است و پیوند قبلی لغو می‌شود.',
        },
        {
          value: 'unlisted',
          title: 'پیوند محرمانه (Unlisted)',
          desc: 'هرکسی که پیوند اختصاصی را داشته باشد می‌تواند نسخهٔ منتشرشده را ببیند.',
        },
        {
          value: 'public',
          title: 'انتشار عمومی',
          desc: 'در فهرست یادداشت‌های منتشرشدهٔ عمومی نمایش داده می‌شود.',
        },
      ];

      for (const opt of options) {
        const card = el('label', undefined, 'share-option-card');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'visibility';
        radio.value = opt.value;
        radio.checked = item.visibility === opt.value;
        radio.addEventListener('change', () => {
          for (const sib of radioGrid.querySelectorAll<HTMLElement>('.share-option-card')) {
            sib.dataset.selected = 'false';
          }
          card.dataset.selected = 'true';
          syncRotateVisibility(opt.value);
        });
        card.dataset.selected = String(radio.checked);
        const content = el('div', undefined, 'share-option-copy');
        content.append(el('strong', opt.title), el('span', opt.desc));
        card.append(radio, content);
        radioGrid.append(card);
      }

      syncRotateVisibility(item.visibility);

      const applyBtn = el('button', 'ذخیرهٔ وضعیت انتشار', 'garden-button-primary');
      applyBtn.type = 'submit';
      shareForm.append(radioGrid, rotateRow, applyBtn);
      shareForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(shareForm);
        const visibility = String(formData.get('visibility') || item.visibility);
        const rotate_token = rotateCheck.checked;
        void run(async () => {
          applyBtn.disabled = true;
          try {
            item = await api<Item>(base + '/publication', { visibility, rotate_token }, 'PUT');
            showToast('تنظیمات انتشار ذخیره شد.', { variant: 'success' });
            await actions.share();
          } finally {
            applyBtn.disabled = false;
          }
        });
      });
      body.append(shareForm);

      if (item.visibility !== 'private') {
        const fullUrl = new URL(publicationHref(item), location.origin).href;
        const linkCard = el('div', undefined, 'share-link-card');
        const urlInput = el('input');
        urlInput.type = 'text';
        urlInput.readOnly = true;
        urlInput.dir = 'ltr';
        urlInput.value = fullUrl;
        urlInput.setAttribute('aria-label', 'نشانی انتشار یادداشت');
        urlInput.addEventListener('click', () => urlInput.select());

        const linkBtns = el('div', undefined, 'share-link-actions');
        const copyBtn = button(
          'کپی پیوند',
          () =>
            void run(async () => {
              await navigator.clipboard.writeText(fullUrl);
              showToast('پیوند انتشار کپی شد.', { variant: 'success' });
            }),
          'garden-button-secondary',
        );
        const openLink = el('a', 'مشاهده نسخهٔ منتشرشده', 'garden-button-secondary');
        openLink.href = publicationHref(item);
        linkBtns.append(copyBtn, openLink);
        linkCard.append(urlInput, linkBtns);
        body.append(linkCard);
      }

      if (canonicalSlug) {
        const propBox = el('div', undefined, 'share-proposal-box');
        propBox.append(
          el(
            'p',
            'اگر تغییر مفیدی روی نسخهٔ رسمی داده‌اید، می‌توانید آن را برای بررسی و ادغام به مؤلف پیشنهاد دهید.',
          ),
        );
        const proposeTrigger = document.querySelector<HTMLButtonElement>('[data-share]');
        const propBtn = button(
          'ارسال پیشنهاد اصلاح به نسخهٔ رسمی',
          () => {
            dialog.close();
            if (proposeTrigger && !proposeTrigger.hidden) {
              proposeTrigger.click();
            } else {
              showToast('ابتدا یک تغییر در نسخهٔ شخصی خود ذخیره کنید تا دکمهٔ پیشنهاد فعال شود.', {
                variant: 'info',
              });
            }
          },
          'garden-button-secondary',
        );
        propBox.append(propBtn);
        body.append(propBox);
      }
    },
    history: async () => {
      const current = await flush();
      open('تاریخچه و مقایسه', 'modal');
      const rows = await all(base + '/history', () => actions.history());

      if (rows.length === 0) {
        const empty = el('div', undefined, 'library-empty-state');
        empty.append(el('p', 'هنوز نسخه‌ای در تاریخچه ثبت نشده است.'));
        body.append(empty);
        return;
      }

      const comparePanel = el('div', undefined, 'history-compare-panel');
      comparePanel.hidden = true;
      const compareHeader = el('div', undefined, 'history-compare-header');
      const compareTitle = el('strong', 'مقایسهٔ نسخه');
      const compareStats = el('span', '', 'merge-stats-badge');
      const closeCompare = button('بستن مقایسه', () => {
        cleanupHistoryMerge();
        comparePanel.hidden = true;
        activeCompareId = null;
      });
      compareHeader.append(compareTitle, compareStats, closeCompare);
      const compareHost = el('div', undefined, 'history-merge-host');
      comparePanel.append(compareHeader, compareHost);
      body.append(comparePanel);

      const ul = list('library-list history-list');
      let activeCompareId: string | null = null;
      let pendingRestoreId: string | null = null;

      const renderList = () => {
        ul.replaceChildren();
        for (const revision of rows) {
          const li = el('li', undefined, 'history-item-card');
          const rowTop = el('div', undefined, 'history-item-top');
          rowTop.append(
            el('strong', new Date(revision.created_at).toLocaleString('fa')),
            el(
              'span',
              `${revision.content.length.toLocaleString('fa')} نویسه`,
              'history-item-size',
            ),
          );
          const btnRow = el('div', undefined, 'library-actions-inline');
          btnRow.append(
            button(
              activeCompareId === revision.id ? 'بستن مقایسه' : 'مقایسه با متن فعلی',
              () => {
                if (activeCompareId === revision.id) {
                  cleanupHistoryMerge();
                  comparePanel.hidden = true;
                  activeCompareId = null;
                  renderList();
                  return;
                }
                activeCompareId = revision.id;
                renderList();
                void (async () => {
                  cleanupHistoryMerge();
                  comparePanel.hidden = false;
                  compareTitle.textContent = `مقایسهٔ نسخهٔ ${new Date(revision.created_at).toLocaleString('fa')} با متن فعلی`;
                  const stats = summarizeDiffStats(revision.content, current.content);
                  compareStats.textContent = stats.changed
                    ? `+${stats.added.toLocaleString('fa')} / -${stats.removed.toLocaleString('fa')} خط`
                    : 'بدون تغییر';
                  const [{ MergeView }, { markdown }, { EditorState }, { EditorView }] =
                    await Promise.all([
                      import('@codemirror/merge'),
                      import('@codemirror/lang-markdown'),
                      import('@codemirror/state'),
                      import('@codemirror/view'),
                    ]);
                  if (!dialog.open || activeCompareId !== revision.id) return;
                  const extensions = [
                    markdown(),
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                    EditorView.lineWrapping,
                    EditorView.perLineTextDirection.of(true),
                  ];
                  compareHost.replaceChildren();
                  historyMergeView = new MergeView({
                    parent: compareHost,
                    a: { doc: revision.content, extensions },
                    b: { doc: current.content, extensions },
                    highlightChanges: true,
                    gutter: true,
                  });
                })();
              },
            ),
          );

          if (pendingRestoreId === revision.id) {
            btnRow.append(
              button(
                'تأیید بازیابی',
                () =>
                  void run(async () => {
                    await api(base + '/history/' + revision.id + '/restore', {
                      expected_hash: current.hash,
                    });
                    location.reload();
                  }),
                'is-danger-confirm',
              ),
              button('انصراف', () => {
                pendingRestoreId = null;
                renderList();
              }),
            );
          } else {
            btnRow.append(
              button('بازیابی این نسخه', () => {
                pendingRestoreId = revision.id;
                renderList();
              }),
            );
          }

          li.append(rowTop, btnRow);
          ul.append(li);
        }
      };
      renderList();
    },
    attachments,
    comments,
    verify: async () => {
      open('وضعیت تأیید نسخهٔ منتشرشده', 'modal');
      const next = !item?.verified;
      body.append(
        el(
          'p',
          next
            ? 'آیا صحت علمی و نگارشی این نسخهٔ منتشرشده را تأیید می‌کنید؟'
            : 'نشان تأیید از این نسخهٔ منتشرشده برداشته شود؟',
        ),
      );
      const row = el('div', undefined, 'library-actions-inline');
      row.append(
        button(
          next ? 'تأیید نسخه' : 'لغو تأیید',
          () =>
            void run(async () => {
              await api(base + '/verification' + suffix, { verified: next }, 'PUT');
              status.textContent = 'وضعیت تأیید ذخیره شد.';
              showToast('وضعیت تأیید به‌روز شد.', { variant: 'success' });
              await refresh();
              dialog.close();
            }),
          'garden-button-primary',
        ),
        button('انصراف', () => dialog.close()),
      );
      body.append(row);
    },
  };

  const attach = (value: Item) => {
    item = value;
    id = value.id;
    base = '/library/items/' + encodeURIComponent(id);
    root.dataset.libraryActions = id;
    if (canonicalSlug) displayTitle(item.title);
  };

  const ensure = async () => {
    if (!canonicalSlug || id) return;
    await flush();
    attach(await api<Item>('/library/canonical/' + encodeURIComponent(canonicalSlug), {}));
    await refresh();
    document.dispatchEvent(new Event('garden:library'));
  };

  const commandHandler = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-library-command]');
    const command = target?.dataset.libraryCommand;
    if (command && actions[command]) {
      const morePanel = document.getElementById('workspace-more-panel');
      if (morePanel && !morePanel.hidden) {
        morePanel.hidden = true;
        document.querySelector('[data-more-toggle]')?.setAttribute('aria-expanded', 'false');
      }
      void run(async () => {
        const guestAllowed = ['link', 'markdown', 'width', 'comments'];
        if (!user && !guestAllowed.includes(command)) {
          showToast('برای انجام این کار ابتدا وارد حساب کاربری خود شوید.', {
            variant: 'info',
            actionLabel: 'ورود به حساب',
            href: '/account',
          });
          return;
        }
        if (
          !['link', 'markdown', 'width'].includes(command) &&
          !(canonicalSlug && command === 'comments')
        )
          await ensure();
        await actions[command]();
      });
    }
  };

  root.addEventListener('click', commandHandler);
  if (menu) menu.addEventListener('click', commandHandler);
  if (top) top.addEventListener('click', commandHandler);

  void run(async () => {
    user = await getSession();
    if (identity === undefined) identity = user?.id ?? null;
    document.querySelectorAll<HTMLElement>('[data-auth-only]').forEach((node) => {
      node.hidden = !user;
    });
    if (user?.role === 'admin') find('[data-library-command="verify"]')!.hidden = false;
    if (publicView)
      item = await api<Item>(
        token ? '/library/shared/' + encodeURIComponent(token) : '/library/public/' + id,
      );
    if (!user) return;
    if (canonicalSlug) {
      try {
        attach(await api<Item>('/library/canonical/' + encodeURIComponent(canonicalSlug)));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return;
        throw error;
      }
    }
    await refresh();
  });
}
