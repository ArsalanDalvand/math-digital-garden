import { type Account, applyPreferences } from './account-preferences';
import { ApiError, message, api as request } from './api';
import { publicationHref, threadComments } from './library-utils.mjs';
import { getSession } from './session';

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
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
const button = (text: string, action: () => void) => {
  const b = el('button', text);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
};
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
  let id = root.dataset.libraryActions!,
    base = '/library/items/' + encodeURIComponent(id);
  const canonicalSlug = root.dataset.canonicalSlug,
    publicView = root.dataset.public === 'true',
    token = root.dataset.token || '';
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
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!,
    body = root.querySelector<HTMLElement>('[data-library-body]')!,
    status = root.querySelector<HTMLElement>('[data-library-status]')!;
  let item: Item,
    user: any,
    watching = false;
  let epoch = 0,
    runEpoch = 0,
    busy = false,
    invalid = false,
    identity: string | null | undefined;
  const stale = new Error('Stale library action');
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
  const dialogStatus = root.querySelector<HTMLElement>('[data-library-dialog-status]')!;
  const run = async (action: () => Promise<void>) => {
    if (busy || invalid) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    document
      .querySelectorAll<HTMLButtonElement>('[data-library-command]')
      .forEach((button) => (button.disabled = true));
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
          .forEach((button) => (button.disabled = false));
    }
  };
  dialog.addEventListener('close', () => {
    epoch++;
    body.replaceChildren();
    dialogStatus.textContent = '';
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
    if (canonicalSlug) {
      displayTitle(originalTitle);
      id = '';
      root.dataset.libraryActions = '';
    }
    item = undefined as unknown as Item;
    user = undefined;
    continued.clear();
    body.replaceChildren();
    dialog.close();
    root.querySelectorAll('button').forEach((button) => (button.disabled = true));
    document
      .querySelectorAll<HTMLButtonElement>('[data-library-command]')
      .forEach((button) => (button.disabled = true));
    const info = find('[data-library-info]');
    if (info) info.textContent = '';
    status.textContent = 'حساب تغییر کرد؛ صفحه را دوباره بارگذاری کنید.';
  });
  const open = (title: string) => {
    body.replaceChildren();
    root.querySelector('[data-library-title]')!.textContent = title;
    if (!dialog.open) dialog.showModal();
  };
  const list = () => {
    const n = el('ul');
    n.className = 'library-list';
    body.append(n);
    return n;
  };
  const form = (
    label: string,
    value: string,
    submit: (value: string) => Promise<void>,
    multiline = false,
  ) => {
    const f = el('form');
    f.className = 'library-form';
    const l = el('label', label),
      input = multiline ? el('textarea') : el('input');
    input.value = value;
    input.required = true;
    input.maxLength = multiline ? 10000 : 255;
    l.append(input);
    f.append(l);
    const b = el('button', 'ذخیره');
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
  const continued = new Map<string, any[]>(),
    exhausted = new Set<string>();
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
        const more = button(
          'بارگذاری ۱۰۰ مورد دیگر',
          () =>
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
      find('[data-library-info]')!.textContent =
        `${item.title} · آخرین تغییر: ${new Date(item.updated_at || '').toLocaleString('fa')} · ${item.content.trim().split(/\s+/u).filter(Boolean).length} واژه`;
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
  const menu = document.querySelector('[data-note-more]'),
    top = document.querySelector('[data-note-extra-actions]');
  if (menu) menu.append(root.querySelector('[data-library-menu]')!);
  else {
    const details = el('details'),
      summary = el('summary', 'کنش‌های یادداشت');
    details.append(summary, root.querySelector('[data-library-menu]')!);
    root.prepend(details);
  }
  if (top) top.append(root.querySelector('[data-library-top]')!);
  if (publicView) {
    for (const command of ['share', 'markdown', 'history', 'rename', 'move', 'trash'])
      document.querySelectorAll(`[data-library-command="${command}"]`).forEach((b) => b.remove());
  }
  const comments = async () => {
    open(canonicalSlug ? 'دیدگاه‌های جزوهٔ اصلی' : 'دیدگاه‌ها');
    if (canonicalSlug)
      body.append(
        el('p', 'این گفتگو دربارهٔ جزوهٔ اصلی سایت است و برای همهٔ اعضای واردشده نمایش داده می‌شود.'),
      );
    if (!user) {
      const a = el('a', 'برای دیدگاه‌گذاری وارد شوید');
      a.href = '/account';
      body.append(a);
      return;
    }
    const commentBase = canonicalSlug
      ? '/library/canonical/' + encodeURIComponent(canonicalSlug)
      : base;
    body.append(
      el(
        'p',
        'پاسخ‌ها همراه دیدگاه اصلی نمایش داده می‌شوند؛ برای دیدن رشته‌های قدیمی‌تر موارد بیشتری بارگذاری کنید.',
      ),
    );
    const rows = await all(commentBase + '/comments' + suffix, comments);
    const ul = list();
    for (const c of threadComments(rows)) {
      const li = el('li');
      const show = (entry: any, reply = false) => {
        const wrap = el('div');
        if (reply) wrap.className = 'library-reply';
        wrap.append(
          el('strong', entry.user_id === user?.id ? 'شما' : 'عضو باغ'),
          el('p', entry.content),
          el('small', new Date(entry.created_at).toLocaleString('fa')),
        );
        const actions = el('div');
        actions.className = 'library-actions-inline';
        if (entry.user_id === user?.id) {
          actions.append(
            button('ویرایش', () => {
              open('ویرایش دیدگاه');
              form(
                'دیدگاه',
                entry.content,
                async (content) => {
                  await api(commentBase + '/comments/' + entry.id + suffix, { content }, 'PATCH');
                  await comments();
                },
                true,
              );
            }),
            button(
              'حذف',
              () =>
                void run(async () => {
                  if (confirm('دیدگاه حذف شود؟ پاسخ‌ها باقی می‌مانند.')) {
                    await api(commentBase + '/comments/' + entry.id + suffix, undefined, 'DELETE');
                    await comments();
                  }
                }),
            ),
          );
        }
        if (!reply) {
          actions.append(
            button('پاسخ', () => {
              open('پاسخ به دیدگاه');
              form(
                'پاسخ',
                '',
                async (content) => {
                  await api(commentBase + '/comments' + suffix, { content, parent_id: entry.id });
                  await comments();
                },
                true,
              );
            }),
          );
          if (
            canonicalSlug
              ? ['author', 'admin'].includes(user?.role)
              : !publicView || user?.role === 'admin'
          )
            actions.append(
              button(
                entry.resolved ? 'بازکردن دوباره' : 'حل‌شده',
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
          wrap.append(el('strong', entry.resolved ? 'حل‌شده' : 'باز'));
        }
        wrap.append(actions);
        li.append(wrap);
      };
      show(c);
      c.replies.forEach((r: any) => show(r, true));
      ul.append(li);
    }
    if (user) {
      if (canonicalSlug || publicView || item?.published_hash)
        form(
          'دیدگاه تازه',
          '',
          async (content) => {
            await api(commentBase + '/comments' + suffix, { content });
            await comments();
          },
          true,
        );
      else
        body.append(
          el('p', 'برای دیدگاه‌گذاری ابتدا این یادداشت را منتشر یا با پیوند به اشتراک بگذارید.'),
        );
    } else {
      const a = el('a', 'برای دیدگاه‌گذاری وارد شوید');
      a.href = '/account';
      body.append(a);
    }
  };
  const attachments = async () => {
    open('پیوست‌ها');
    const rows = publicView
      ? await all('/library/public/' + id + '/attachments' + suffix, attachments)
      : await all(base + '/attachments', attachments);
    const ul = list();
    for (const a of rows) {
      const li = el('li'),
        link = el('a', a.filename + ' (' + a.size.toLocaleString('fa') + ' بایت)');
      link.href =
        '/api/library/' +
        (publicView ? 'public/' + id + '/attachments/' + a.id + suffix : 'attachments/' + a.id);
      li.append(link);
      if (!publicView)
        li.append(
          button(
            'حذف',
            () =>
              void run(async () => {
                if (confirm('پیوست برای همیشه حذف شود؟')) {
                  await api('/library/attachments/' + a.id, undefined, 'DELETE');
                  await attachments();
                }
              }),
          ),
        );
      ul.append(li);
    }
    if (!publicView) {
      const label = el('label', 'بارگذاری پیوست (حداکثر ۵ مگابایت)'),
        input = el('input');
      input.type = 'file';
      label.append(input);
      body.append(label);
      input.addEventListener(
        'change',
        () =>
          void run(async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 5_000_000 || file.size === 0)
              throw new Error('اندازهٔ فایل باید بین ۱ بایت و ۵ مگابایت باشد.');
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1]);
              reader.onerror = () => reject(new Error('خواندن فایل ممکن نشد'));
              reader.readAsDataURL(file);
            });
            await api(base + '/attachments', { filename: file.name, content_base64: data });
            await attachments();
          }),
      );
    }
  };
  const actions: Record<string, () => Promise<void>> = {
    link: async () => {
      await navigator.clipboard.writeText(location.href);
      status.textContent = 'پیوند کپی شد.';
    },
    markdown: async () => {
      const saved = await flush();
      await navigator.clipboard.writeText(saved.content);
      status.textContent = 'Markdown کپی شد.';
    },
    favorite: async () => {
      await api(base + '/favorite' + suffix, { favorite: !item?.favorite }, 'PUT');
      await refresh();
      document.dispatchEvent(new Event('garden:library'));
    },
    watch: async () => {
      await api(base + '/watch' + suffix, { watching: !watching }, 'PUT');
      await refresh();
    },
    width: async () => {
      const account = await api<Account>('/account');
      const preferences = {
        ...account.preferences,
        width: (account.preferences.width === 960 ? 760 : 960) as 760 | 960,
      };
      const updated = await api<Account>('/account/preferences', preferences, 'PATCH');
      applyPreferences(updated.preferences);
    },
    rename: async () => {
      await flush();
      open('تغییر نام');
      form('نام یادداشت', item.title, async (title) => {
        await api(base, { title }, 'PATCH');
        location.reload();
      });
    },
    move: async () => {
      await flush();
      open('انتقال به پوشه');
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
      if (confirm('یادداشت به زباله‌دان منتقل شود؟')) {
        await api(base + '/trash', {});
        location.href = '/library';
      }
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
      open('اشتراک‌گذاری و انتشار');
      if (canonicalSlug)
        body.append(el('p', 'نسخهٔ شخصی شما منتشر می‌شود؛ اصل جزوه برای دیگران تغییر نمی‌کند.'));
      body.append(
        el(
          'p',
          'فقط نسخهٔ ذخیره‌شدهٔ همین یادداشت و پیوست‌های فعلی منتشر می‌شوند. پوشه‌ها و یادداشت‌های دیگر منتشر نمی‌شوند. انتشار دوباره، پیوند خصوصی قبلی را باطل می‌کند.',
        ),
      );
      for (const [visibility, title] of [
        ['private', 'لغو انتشار و پیوند'],
        ['unlisted', 'ساخت پیوند بدون فهرست عمومی'],
        ['public', 'انتشار عمومی'],
      ])
        body.append(
          button(
            title,
            () =>
              void run(async () => {
                if (
                  visibility !== 'private' &&
                  !confirm('همین نسخه و پیوست‌ها برای دارندگان پیوند قابل مشاهده شوند؟')
                )
                  return;
                item = await api<Item>(base + '/publication', { visibility }, 'PUT');
                await actions.share();
              }),
          ),
        );
      if (item.visibility !== 'private') {
        const a = el('a', 'بازکردن نسخهٔ منتشرشده');
        a.href = publicationHref(item);
        body.append(
          a,
          button(
            'کپی پیوند انتشار',
            () =>
              void run(async () => {
                await navigator.clipboard.writeText(
                  new URL(publicationHref(item), location.origin).href,
                );
                status.textContent = 'پیوند کپی شد.';
              }),
          ),
        );
      }
    },
    history: async () => {
      const current = await flush();
      open('تاریخچه و مقایسه');
      const rows = await all(base + '/history', () => actions.history()),
        ul = list();
      for (const revision of rows) {
        const li = el('li');
        li.append(
          el('strong', new Date(revision.created_at).toLocaleString('fa')),
          button('مقایسه با متن فعلی', () => {
            const compare = el('div');
            compare.className = 'library-compare';
            const old = el('section'),
              now = el('section');
            old.append(el('h3', 'نسخهٔ انتخاب‌شده'), el('pre', revision.content));
            now.append(el('h3', 'نسخهٔ فعلی'), el('pre', current.content));
            compare.append(old, now);
            li.append(compare);
          }),
          button(
            'بازیابی این نسخه',
            () =>
              void run(async () => {
                if (confirm('این نسخه بازیابی شود؟ متن فعلی در تاریخچه باقی می‌ماند.')) {
                  await api(base + '/history/' + revision.id + '/restore', {
                    expected_hash: current.hash,
                  });
                  location.reload();
                }
              }),
          ),
        );
        ul.append(li);
      }
    },
    attachments,
    comments,
    verify: async () => {
      if (confirm('دقت نسخهٔ منتشرشده را تأیید می‌کنید؟')) {
        await api(base + '/verification' + suffix, { verified: !item?.verified }, 'PUT');
        status.textContent = 'وضعیت تأیید ذخیره شد.';
        await refresh();
      }
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
    if (command && actions[command])
      void run(async () => {
        if (
          !['link', 'markdown', 'width'].includes(command) &&
          !(canonicalSlug && command === 'comments')
        )
          await ensure();
        await actions[command]();
      });
  };
  root.addEventListener('click', commandHandler);
  if (menu) menu.addEventListener('click', commandHandler);
  if (top) top.addEventListener('click', commandHandler);
  void run(async () => {
    user = await getSession();
    if (identity === undefined) identity = user?.id ?? null;
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
