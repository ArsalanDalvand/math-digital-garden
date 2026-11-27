import {
  atomicEditorTheme,
  atomicMarkdownSyntax,
  highlightMarkdown,
  imageBlocks,
  inlinePreview,
  readOnlyExtension,
  tables,
  wikiLinks,
} from '@atomic-editor/editor';
import { parse } from 'yaml';
import { api, message } from './api';
import { bindEditorToolbar } from './editor-toolbar';
import { getSession } from './session';
import '@atomic-editor/editor/styles.css';
import { Compartment, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { atomicMath } from '../lib/atomic-math';
import { blockPreview } from '../lib/block-preview';
import { preferredVersion } from '../lib/default-version.mjs';
import {
  applyRawChanges,
  createAutosaver,
  replaceEditorFrontmatter,
  splitEditorMarkdown,
} from '../lib/editor.mjs';
import { inlineMathLive } from '../lib/inline-mathlive';
import { createPreviewRenderer } from '../lib/preview-cache.mjs';
import { activateEditor } from '../lib/reading-mode.mjs';

for (const root of document.querySelectorAll<HTMLElement>('[data-workspace-note]')) {
  const slug = root.dataset.workspaceNote!;
  const libraryId = root.dataset.libraryId;
  const toolbar = root.querySelector<HTMLElement>('[data-editor-toolbar]')!;
  let disposeToolbar: (() => void) | undefined;
  let identity: string | undefined,
    identityEpoch = 0;
  let fixedToolbar = true;
  try {
    fixedToolbar = localStorage.getItem('garden-fixed-toolbar') !== 'false';
  } catch {}
  const updateToolbar = () => {
    toolbar.hidden = !root.classList.contains('is-editing');
    toolbar.dataset.sticky = String(fixedToolbar);
  };
  document.addEventListener('garden:preferences', (event) => {
    fixedToolbar = (event as CustomEvent).detail.fixed_toolbar;
    updateToolbar();
  });
  let userInteracted = false;
  let readingOriginal = new URLSearchParams(location.search).get('version') === 'canonical';
  root.addEventListener('click', () => {
    userInteracted = true;
  });
  const status = root.querySelector<HTMLElement>('[data-save-status]')!;
  const panel = root.querySelector<HTMLElement>('[data-editor-panel]')!;
  const article = document.querySelector<HTMLElement>('article.note:not([data-live-preview])')!;
  const canonicalHtml = article.innerHTML;
  const displayedCanonicalRaw = article.dataset.aiRaw,
    displayedCanonicalHash = article.dataset.aiHash!;
  type LinkEntry = { slug: string; title: string; aliases: string[] };
  let links: LinkEntry[] = JSON.parse(
    document.querySelector('[data-note-link-index]')?.textContent || '[]',
  );
  let linksPromise: Promise<LinkEntry[]> | undefined;
  const ensureLinks = (): Promise<LinkEntry[]> => {
    if (links.length > 0) return Promise.resolve(links);
    if (linksPromise) return linksPromise;
    linksPromise = fetch('/api/link-index.json', { credentials: 'same-origin' })
      .then(async (res) => (res.ok ? ((await res.json()) as LinkEntry[]) : []))
      .then((rows) => {
        if (Array.isArray(rows)) links = rows;
        return links;
      })
      .catch(() => links);
    return linksPromise;
  };
  const resolveLink = (target: string, list = links) => {
    const name = target.split('#')[0].replace(/\.md$/, '');
    return list.find((n) => [n.slug, n.title, ...n.aliases].includes(name));
  };
  const mode = new Compartment();
  let view: EditorView | undefined;
  let raw = '',
    frontmatter = '',
    hash = '',
    canonical = '',
    dirty = false,
    stopped = false,
    hasFork = false,
    previewSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let autosave: ReturnType<typeof createAutosaver> | undefined;
  const originalButton = document.querySelector<HTMLButtonElement>('[data-original]')!;
  const viewButton = document.querySelector<HTMLButtonElement>('[data-view]')!;
  const shareButton = document.querySelector<HTMLButtonElement>('[data-share]')!;
  const syncOriginal = () => {
    originalButton.hidden = !!libraryId || raw === canonical;
    document.querySelector<HTMLButtonElement>('[data-save]')!.hidden = !dirty;
    shareButton.hidden = !!libraryId || !hasFork;
    document.querySelector<HTMLButtonElement>('[data-reset]')!.hidden =
      !!libraryId || raw === canonical;
  };
  const showReading = async () => {
    if (!view || !root.classList.contains('is-editing') || viewButton.disabled) return;
    viewButton.disabled = true;
    originalButton.disabled = true;
    document.querySelector<HTMLButtonElement>('[data-edit]')!.disabled = true;
    viewButton.setAttribute('aria-busy', 'true');
    try {
      const snapshot = raw;
      if (dirty) await save();
      if (raw !== snapshot || dirty)
        throw new Error('متن هنگام ذخیره تغییر کرد؛ دوباره خواندن را بزنید.');
      await render(snapshot, article);
      if (raw !== snapshot || dirty)
        throw new Error('متن هنگام آماده‌سازی تغییر کرد؛ دوباره خواندن را بزنید.');
      modeSwitch(true);
      article.hidden = false;
      panel.hidden = true;
      context(article, hasFork ? 'personal' : 'canonical', snapshot, hash);
      syncOriginal();
      const indicator = document.querySelector('.note-status');
      if (indicator) indicator.textContent = hasFork ? 'نسخهٔ شخصی شما' : 'نسخهٔ رسمی';
      viewButton.disabled = false;
      viewButton.focus({ preventScroll: true });
    } finally {
      viewButton.disabled = false;
      originalButton.disabled = false;
      document.querySelector<HTMLButtonElement>('[data-edit]')!.disabled = false;
      viewButton.removeAttribute('aria-busy');
    }
  };
  function modeSwitch(readOnly: boolean) {
    view!.dispatch({ effects: mode.reconfigure(readOnlyExtension(readOnly)) });
    document
      .querySelector<HTMLButtonElement>('[data-edit]')!
      .setAttribute('aria-pressed', String(!readOnly));
    viewButton.setAttribute('aria-pressed', String(readOnly));
    root.classList.toggle('is-editing', !readOnly);
    updateToolbar();
  }
  viewButton.addEventListener('click', () => {
    userInteracted = true;
    void showReading().catch(handle);
  });
  originalButton.addEventListener('click', () => {
    userInteracted = true;
    void (async () => {
      const snapshot = raw;
      if (dirty) await save();
      if (raw !== snapshot || dirty)
        throw new Error('متن هنگام ذخیره تغییر کرد؛ دوباره تلاش کنید.');
      readingOriginal = true;
      article.innerHTML = canonicalHtml;
      article.hidden = false;
      panel.hidden = true;
      if (view) modeSwitch(true);
      context(article, 'canonical', displayedCanonicalRaw, displayedCanonicalHash);
      originalButton.hidden = true;
      say('');
    })().catch(handle);
  });
  const say = (text: string) => (status.textContent = text);
  function context(
    target: HTMLElement,
    scope: string,
    content: string | undefined,
    version: string,
    unsaved = false,
  ) {
    target.dataset.aiScope = scope;
    target.dataset.aiHash = version;
    if (content === undefined) delete target.dataset.aiRaw;
    else target.dataset.aiRaw = content;
    target.dataset.aiDirty = String(unsaved);
    document.dispatchEvent(new Event('garden:context-change'));
  }
  let loaded: any;
  let loadPending: Promise<any> | undefined;
  async function load() {
    if (loaded) return loaded;
    if (loadPending) return loadPending;
    loadPending = loadFresh();
    try {
      return (loaded = await loadPending);
    } finally {
      loadPending = undefined;
    }
  }
  async function loadFresh() {
    const epoch = identityEpoch;
    const response = await api(
      libraryId
        ? '/library/items/' + encodeURIComponent(libraryId)
        : '/workspace/notes/' + encodeURIComponent(slug),
    );
    if (epoch !== identityEpoch) throw new Error('حساب تغییر کرد؛ صفحه را دوباره باز کنید.');
    const data = libraryId
      ? {
          canonical: { content: response.content, current_hash: response.current_hash },
          fork: { custom_content: response.content, current_hash: response.current_hash },
        }
      : response;
    canonical = data.canonical.content;
    raw = data.fork?.custom_content ?? canonical;
    hash = data.fork?.current_hash ?? data.canonical.current_hash;
    hasFork = !!data.fork;
    syncOriginal();
    return data;
  }
  const previews = createPreviewRenderer(async (content: string, blocks: boolean) => {
    const epoch = identityEpoch;
    const response = await fetch('/api/preview', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Requested-With': 'MathGarden', ...(blocks ? { 'X-Preview-Blocks': '1' } : {}) },
      body: content,
    });
    if (!response.ok) throw new Error('پیش‌نمایش موقتاً در دسترس نیست.');
    const result = await response.json();
    if (epoch !== identityEpoch) throw new Error('حساب تغییر کرد.');
    return result;
  });
  const previewHtml = (content: string) => previews.render(content);
  async function render(content: string, target: HTMLElement) {
    const seq = ++previewSeq;
    const html = await previewHtml(content);
    if (seq === previewSeq) target.innerHTML = html;
  }
  async function save() {
    if (!autosave || stopped)
      throw new Error('برای ادامهٔ ذخیره، متن را دریافت و صفحه را دوباره بارگذاری کنید.');
    clearTimeout(timer);
    if (!dirty) return;
    await autosave(raw);
  }
  function handle(error: unknown) {
    say(message(error));
  }
  const editorModules = Promise.all([
    import('codemirror'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/state'),
    import('mathlive'),
    import('@lezer/markdown'),
  ]);
  document.querySelector('[data-edit]')!.addEventListener('click', async () => {
    const epoch = identityEpoch;
    userInteracted = true;
    const editButton = document.querySelector<HTMLButtonElement>('[data-edit]')!;
    editButton.disabled = true;
    editButton.setAttribute('aria-busy', 'true');
    try {
      if (view) {
        activateEditor({ article, panel, indicator: document.querySelector('.note-status') });
        modeSwitch(false);
        syncOriginal();
        context(article, 'personal', raw, hash, dirty);
        view.focus();
        return;
      }
      const visibleScope = article.dataset.aiScope;
      const visibleRaw = article.dataset.aiRaw;
      const data = await Promise.all([load(), ensureLinks()]).then(([d]) => d);
      if (data?.fork) {
        raw = data.fork.custom_content;
        hash = data.fork.current_hash;
      } else if (visibleScope === 'personal' && visibleRaw !== undefined) {
        raw = visibleRaw;
      } else if (readingOriginal) {
        raw = canonical;
      }

      const [
        { EditorView, basicSetup },
        { markdown, markdownLanguage },
        { EditorState },
        { MathfieldElement },
        { Table, TaskList },
      ] = await editorModules;
      if (epoch !== identityEpoch) return;
      MathfieldElement.fontsDirectory = '/mathlive/fonts';
      MathfieldElement.soundsDirectory = null;
      const math = new MathfieldElement();
      math.setAttribute('aria-label', 'ورود فرمول ریاضی');
      autosave = createAutosaver(hash, async (content, expected_hash) => {
        say('در حال ذخیره…');
        try {
          const epoch = identityEpoch;
          const fork = await api(
            libraryId
              ? '/library/items/' + encodeURIComponent(libraryId)
              : '/notes/' + encodeURIComponent(slug) + '/fork',
            { content, expected_hash },
            libraryId ? 'PATCH' : 'POST',
          );
          if (epoch !== identityEpoch) throw new Error('حساب تغییر کرد.');
          hash = fork.current_hash;
          hasFork = true;
          dirty = raw !== content;
          syncOriginal();
          context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, dirty);
          say(dirty ? 'تغییر جدید در انتظار ذخیره' : 'ذخیره شد — نسخهٔ شخصی شما');
          return fork;
        } catch (error) {
          stopped =
            error instanceof Error &&
            'status' in error &&
            [401, 403, 409].includes(Number(error.status));
          handle(error);
          throw error;
        }
      });
      const propertiesDetails = root.querySelector<HTMLDetailsElement>('.note-properties')!;
      const properties = root.querySelector<HTMLTextAreaElement>('[data-properties]')!;
      const syncProperties = () => {
        properties.value =
          raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ??
          'title: ""\ntags: []\naliases: []';
      };
      frontmatter = splitEditorMarkdown(raw).frontmatter;
      previews.prepare(raw);
      view = new EditorView({
        parent: root.querySelector('[data-editor]')!,
        doc: raw.slice(frontmatter.length),
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage, extensions: [Table, TaskList, highlightMarkdown] }),
          atomicEditorTheme,
          atomicMarkdownSyntax,
          inlinePreview(),
          imageBlocks(),
          tables(),
          wikiLinks({
            resolve: async (target) => {
              const list = await ensureLinks();
              const n = resolveLink(target, list);
              return n ? { target, label: n.title, status: 'resolved' } : null;
            },
            suggest: async (q) =>
              (await ensureLinks())
                .filter((n) => n.title.includes(q))
                .slice(0, 10)
                .map((n) => ({ target: n.title, label: n.title })),
            onOpen: (target) => {
              const n = resolveLink(target);
              if (n) location.href = '/notes/' + encodeURIComponent(n.slug);
            },
          }),
          atomicMath,
          blockPreview(previewHtml),
          mode.of(readOnlyExtension(false)),
          EditorView.lineWrapping,
          EditorView.perLineTextDirection.of(true),
          EditorState.tabSize.of(2),
          EditorView.contentAttributes.of({ 'aria-label': 'متن خام Markdown', dir: 'rtl' }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const changes: { from: number; to: number; insert: string }[] = [];
            update.changes.iterChanges((from, to, _from, _to, insert) =>
              changes.push({ from, to, insert: insert.toString() }),
            );
            raw = frontmatter + applyRawChanges(raw.slice(frontmatter.length), changes);
            dirty = true;
            syncOriginal();
            if (!propertiesDetails.open) syncProperties();
            context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, true);
            say('تغییرات ذخیره‌نشده');
            clearTimeout(timer);
            timer = setTimeout(() => {
              void save().catch(handle);
            }, 1500);
          }),
        ],
      });

      view.dispatch({ effects: StateEffect.appendConfig.of(inlineMathLive) });
      disposeToolbar = bindEditorToolbar(toolbar, view, math);
      syncProperties();
      root.querySelector('[data-apply-properties]')!.addEventListener('click', async () => {
        try {
          const value = parse(properties.value);
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('ویژگی‌ها باید یک نگاشت YAML معتبر باشند.');
          raw = replaceEditorFrontmatter(raw, properties.value);
          frontmatter = splitEditorMarkdown(raw).frontmatter;
          dirty = true;
          syncOriginal();
          context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, true);
          say('ویژگی‌ها تغییر کردند؛ در انتظار ذخیره');
          clearTimeout(timer);
          timer = setTimeout(() => {
            void save().catch(handle);
          }, 1500);
        } catch (error) {
          handle(error);
        }
      });

      activateEditor({ article, panel, indicator: document.querySelector('.note-status') });
      modeSwitch(false);
      context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, dirty);
      article.hidden = true;
      panel.hidden = false;
      say('');
      view.focus();
    } catch (error) {
      handle(error);
    } finally {
      editButton.disabled = false;
      editButton.removeAttribute('aria-busy');
    }
  });
  const shareDialog = root.querySelector<HTMLDialogElement>('[data-share-dialog]')!;
  async function finishEditing() {
    const button = document.querySelector<HTMLButtonElement>('[data-save]')!;
    button.disabled = true;
    try {
      const snapshot = raw;
      await save();
      if (raw !== snapshot) throw new Error('متن هنگام ذخیره تغییر کرد؛ دوباره ذخیره کنید.');
      syncOriginal();
      say('ذخیره شد.');
    } catch (error) {
      handle(error);
    } finally {
      button.disabled = false;
    }
  }
  document.querySelector('[data-save]')!.addEventListener('click', () => void finishEditing());
  shareButton.addEventListener('click', () => {
    void (async () => {
      const snapshot = raw;
      if (dirty) await save();
      if (raw !== snapshot || dirty)
        throw new Error('متن هنگام ذخیره تغییر کرد؛ دوباره تلاش کنید.');
      shareDialog.showModal();
    })().catch(handle);
  });
  root.querySelector('[data-share-skip]')!.addEventListener('click', () => shareDialog.close());
  for (const button of root.querySelectorAll<HTMLElement>('[data-mode]'))
    button.addEventListener('click', async () => {
      try {
        if (dirty) await save();
        if (button.dataset.mode === 'canonical') {
          readingOriginal = true;
          article.innerHTML = canonicalHtml;
          context(article, 'canonical', displayedCanonicalRaw, displayedCanonicalHash);
          article.hidden = false;
          panel.hidden = true;
          say('مطالعهٔ نسخهٔ رسمی');
        } else {
          const data = view ? { fork: { custom_content: raw } } : await load();
          await render(data.fork?.custom_content ?? canonical, article);
          context(
            article,
            data.fork ? 'personal' : 'canonical',
            data.fork?.custom_content ?? canonical,
            hash,
            dirty,
          );
          article.hidden = false;
          panel.hidden = true;
          say(data.fork ? 'نسخهٔ شخصی شما' : 'هنوز نسخهٔ شخصی ایجاد نشده است.');
        }
        if (view) modeSwitch(true);
        const indicator = document.querySelector('.note-status');
        if (indicator) indicator.textContent = button.textContent;
      } catch (error) {
        handle(error);
      }
    });
  const bookmark = document.querySelector<HTMLButtonElement>('[data-bookmark]')!;
  let bookmarkTouched = false;
  const mark = (selected: boolean) => {
    bookmark.setAttribute('aria-pressed', String(selected));
    bookmark.setAttribute('aria-label', selected ? 'برداشتن نشانهٔ یادداشت' : 'نشانه‌گذاری یادداشت');
    bookmark.title = selected ? 'برداشتن نشانه' : 'نشانه‌گذاری';
    bookmark.querySelector('span')!.textContent = bookmark.title;
  };
  if (libraryId) bookmark.hidden = true;
  if (!libraryId)
    void getSession().then((user) => {
      if (!user) return;
      void api('/workspace')
        .then((data) => {
          if (!bookmarkTouched && Array.isArray(data?.bookmarks))
            mark(data.bookmarks.some((item: { slug?: string }) => item?.slug === slug));
        })
        .catch(() => {});
    });
  bookmark.addEventListener('click', async () => {
    bookmarkTouched = true;
    const selected = bookmark.getAttribute('aria-pressed') === 'true';
    bookmark.disabled = true;
    bookmark.setAttribute('aria-busy', 'true');
    try {
      await api(
        '/workspace/bookmarks/' + encodeURIComponent(slug),
        undefined,
        selected ? 'DELETE' : 'PUT',
      );
      mark(!selected);
      say(selected ? 'نشانه برداشته شد' : 'نشانه‌گذاری شد');
    } catch (error) {
      handle(error);
    } finally {
      bookmark.disabled = false;
      bookmark.removeAttribute('aria-busy');
    }
  });
  root
    .querySelector<HTMLFormElement>('[data-proposal-form]')!
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
      button.disabled = true;
      try {
        await api('/proposals', {
          slug,
          comment: new FormData(form).get('comment') || 'پیشنهاد اصلاح یادداشت',
        });
        say('پیشنهاد برای مدیر ارسال شد؛ نسخهٔ رسمی هنوز تغییر نکرده است.');
        shareDialog.close();
      } catch (error) {
        root.querySelector('[data-share-status]')!.textContent = message(error);
      } finally {
        button.disabled = false;
      }
    });
  document.querySelector('[data-reset]')!.addEventListener('click', async () => {
    if (!confirm('نسخهٔ شخصی به اصل برگردد؟ تاریخچه محفوظ می‌ماند.')) return;
    try {
      if (dirty) await save();
      await api('/notes/' + encodeURIComponent(slug) + '/fork/reset', { expected_hash: hash });
      dirty = false;
      location.reload();
    } catch (error) {
      handle(error);
    }
  });
  document.addEventListener('garden:apply-answer', (event) => {
    const detail = (event as CustomEvent).detail;
    if (detail.slug === slug && view) {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: '\n\n' + detail.content + '\n' },
      });
      activateEditor({ article, panel, indicator: document.querySelector('.note-status') });
      modeSwitch(false);
      view.contentDOM.focus({ preventScroll: true });
    }
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (document.querySelector('dialog[open]') || event.altKey) return;
      if (event.key === 'Escape' && (event.target as HTMLElement)?.closest('math-field')) return;
      const editing = root.classList.contains('is-editing');
      const inEditor = !!view?.contentDOM.contains(event.target as Node);
      const typing = !!(event.target as HTMLElement)?.closest?.(
        'input,textarea,select,[contenteditable="true"]',
      );
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        editing &&
        (!typing || inEditor)
      ) {
        event.preventDefault();
        void finishEditing();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'e' &&
        (!typing || inEditor)
      ) {
        event.preventDefault();
        if (editing) void showReading().catch(handle);
        else document.querySelector<HTMLButtonElement>('[data-edit]')!.click();
      } else if (event.key === 'Escape' && editing && inEditor) {
        if (view?.dom.querySelector('.cm-tooltip-autocomplete,.cm-search')) return;
        event.preventDefault();
        void showReading().catch(handle);
      } else if (event.key === 'i' && !editing && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-edit]')!.click();
      }
    },
    true,
  );
  void (async () => {
    try {
      const user = await getSession();
      if (!user) return;
      const data = await load();
      if (preferredVersion(data.fork, location.search, userInteracted) === 'personal') {
        const staging = document.createElement('div');
        await render(data.fork?.custom_content ?? canonical, staging);
        if (userInteracted) return;
        article.replaceChildren(...staging.childNodes);
        article.hidden = false;
        context(
          article,
          data.fork ? 'personal' : 'canonical',
          data.fork?.custom_content ?? canonical,
          hash,
        );
        const indicator = document.querySelector('.note-status');
        if (indicator) indicator.textContent = data.fork ? 'نسخهٔ شخصی شما' : 'نسخهٔ رسمی';
        say('');
      }
    } catch {
      /* Anonymous readers retain the public version; explicit edit reports auth errors. */
    }
  })();
  const header = document.querySelector('[data-note-header-actions]');
  if (header) {
    header.append(root.querySelector('.note-mode')!, document.querySelector('[data-save]')!);
    document
      .querySelector('[data-note-more]')
      ?.append(bookmark, originalButton, shareButton, document.querySelector('[data-reset]')!);
    header.addEventListener('click', () => {
      userInteracted = true;
    });
  }
  const toolbarSlot = document.querySelector('[data-editor-toolbar-slot]');
  if (toolbarSlot) toolbarSlot.append(toolbar);
  document.addEventListener('garden:flush-note', (event) => {
    const detail = (event as CustomEvent).detail;
    void (async () => {
      await load();
      const snapshot = raw;
      if (dirty) await save();
      if (dirty || snapshot !== raw) throw new Error('متن تغییر کرد؛ دوباره تلاش کنید.');
      return { content: raw, hash };
    })().then(detail.resolve, detail.reject);
  });
  document.addEventListener('garden:identity', (event) => {
    const next = (event as CustomEvent).detail?.id || '';
    if (identity === undefined) {
      identity = next;
      return;
    }
    if (identity === next) return;
    previews.clear();
    identity = next;
    identityEpoch++;
    previewSeq++;
    userInteracted = true;
    stopped = true;
    dirty = false;
    clearTimeout(timer);
    disposeToolbar?.();
    view?.destroy();
    view = undefined;
    raw = '';
    hash = '';
    canonical = '';
    loaded = undefined;
    article.replaceChildren();
    delete article.dataset.aiRaw;
    delete article.dataset.aiHash;
    panel.replaceChildren();
    panel.hidden = true;
    toolbar.hidden = true;
    location.reload();
  });
  let defaultApplied = false;
  const applyDefaultMode = (mode: string | undefined) => {
    if (!mode) return;
    if (defaultApplied) return;
    defaultApplied = true;
    if (mode === 'edit' && !userInteracted)
      document.querySelector<HTMLButtonElement>('[data-edit]')?.click();
  };
  document.addEventListener('garden:preferences', (event) =>
    applyDefaultMode((event as CustomEvent).detail.default_mode),
  );
  if (libraryId && new URLSearchParams(location.search).get('edit') === '1')
    applyDefaultMode('edit');
  applyDefaultMode(document.documentElement.dataset.defaultMode);
  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault();
    }
  });
}
