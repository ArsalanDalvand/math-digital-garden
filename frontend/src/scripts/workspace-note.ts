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
import { ApiError, api, message } from './api';
import { bindEditorToolbar } from './editor-toolbar';
import { getSession } from './session';
import { showToast } from './toast';
import '@atomic-editor/editor/styles.css';
import type { MergeView as CodeMirrorMergeView } from '@codemirror/merge';
import { Compartment, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { atomicMath } from '../lib/atomic-math';
import { blockPreview } from '../lib/block-preview';
import { preferredVersion } from '../lib/default-version.mjs';
import { countWordsAndChars, detectRebaseNeeded, summarizeDiffStats } from '../lib/editor-sync.mjs';
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
  const splitButton = toolbar.querySelector<HTMLButtonElement>('[data-toolbar-split]');
  let disposeToolbar: (() => void) | undefined;
  let identity: string | undefined;
  let identityEpoch = 0;
  let fixedToolbar = true;
  let splitEnabled = false;
  try {
    fixedToolbar = localStorage.getItem('garden-fixed-toolbar') !== 'false';
    splitEnabled = localStorage.getItem('garden-editor-split') === 'true';
  } catch {}

  const panel = root.querySelector<HTMLElement>('[data-editor-panel]')!;
  const editorGrid = root.querySelector<HTMLElement>('.editor-workspace-grid')!;
  const livePreviewPane = root.querySelector<HTMLElement>('[data-live-preview]')!;
  const livePreviewBody = root.querySelector<HTMLElement>('[data-live-preview-body]')!;
  const livePreviewState = root.querySelector<HTMLElement>('[data-preview-state]');
  const saveBadge = root.querySelector<HTMLElement>('[data-save-badge]');
  const statsLabel = root.querySelector<HTMLElement>('[data-editor-stats]');
  const syncBanner = root.querySelector<HTMLElement>('[data-sync-banner]')!;
  const syncBannerText = root.querySelector<HTMLElement>('[data-sync-banner-text]')!;
  const syncBannerAction = root.querySelector<HTMLButtonElement>('[data-sync-banner-action]')!;

  const updateToolbar = () => {
    const editing = root.classList.contains('is-editing');
    toolbar.hidden = !editing;
    toolbar.dataset.sticky = String(fixedToolbar);
    if (splitButton) splitButton.setAttribute('aria-pressed', String(splitEnabled));
    editorGrid.dataset.editorLayout = editing && splitEnabled ? 'split' : 'single';
    livePreviewPane.hidden = !(editing && splitEnabled);
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
  const article = document.querySelector<HTMLElement>('article.note:not([data-live-preview-body])')!;
  const canonicalHtml = article.innerHTML;
  const displayedCanonicalRaw = article.dataset.aiRaw;
  const displayedCanonicalHash = article.dataset.aiHash!;

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
  let mergeView: CodeMirrorMergeView | undefined;
  let mergeMode: 'conflict' | 'rebase' | null = null;
  let mergeRemoteHash = '';
  let mergeRemoteContent = '';
  let raw = '';
  let frontmatter = '';
  let hash = '';
  let canonical = '';
  let canonicalHash = '';
  let forkBaseHash = '';
  let dirty = false;
  let stopped = false;
  let hasFork = false;
  let suppressingDocChange = false;
  let previewSeq = 0;
  let splitPreviewSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let splitTimer: ReturnType<typeof setTimeout> | undefined;
  let autosave: ReturnType<typeof createAutosaver> | undefined;

  const originalButton = document.querySelector<HTMLButtonElement>('[data-original]')!;
  const viewButton = document.querySelector<HTMLButtonElement>('[data-view]')!;
  const shareButton = document.querySelector<HTMLButtonElement>('[data-share]')!;

  const updateMeta = (state: 'saved' | 'dirty' | 'saving' | 'conflict' | 'error', text: string) => {
    if (saveBadge) {
      saveBadge.dataset.state = state;
      saveBadge.textContent = text;
    }
    if (statsLabel) {
      const { words, chars } = countWordsAndChars(raw);
      statsLabel.textContent = `${words.toLocaleString('fa')} واژه · ${chars.toLocaleString('fa')} نویسه`;
    }
  };

  const syncOriginal = () => {
    originalButton.hidden = !!libraryId || raw === canonical;
    document.querySelector<HTMLButtonElement>('[data-save]')!.hidden = !dirty;
    shareButton.hidden = !!libraryId || !hasFork;
    document.querySelector<HTMLButtonElement>('[data-reset]')!.hidden =
      !!libraryId || raw === canonical;
  };

  const updateSyncBanner = () => {
    if (stopped && mergeRemoteHash) {
      syncBanner.dataset.bannerMode = 'conflict';
      syncBannerText.textContent =
        'تغییر همزمان رخ داد؛ نسخهٔ ذخیره‌شدهٔ سرور از پیش‌نویس شما جلوتر است.';
      syncBannerAction.textContent = 'رفع تداخل ذخیره';
      syncBanner.hidden = false;
      return;
    }
    const rebaseInfo = detectRebaseNeeded(
      { canonical: { current_hash: canonicalHash }, fork: hasFork ? { base_hash: forkBaseHash } : null },
      !!libraryId,
    );
    if (rebaseInfo.needed) {
      syncBanner.dataset.bannerMode = 'rebase';
      syncBannerText.textContent = 'نسخهٔ رسمی این یادداشت به‌روز شده است.';
      syncBannerAction.textContent = 'مقایسه و همگام‌سازی';
      syncBanner.hidden = false;
      return;
    }
    delete syncBanner.dataset.bannerMode;
    syncBanner.hidden = true;
  };

  const say = (text: string) => {
    status.textContent = text;
  };

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

  async function fetchServerNote() {
    return api(
      libraryId
        ? '/library/items/' + encodeURIComponent(libraryId)
        : '/workspace/notes/' + encodeURIComponent(slug),
    );
  }

  async function loadFresh() {
    const epoch = identityEpoch;
    const response = await fetchServerNote();
    if (epoch !== identityEpoch) throw new Error('حساب تغییر کرد؛ صفحه را دوباره باز کنید.');
    const data = libraryId
      ? {
          canonical: { content: response.content, current_hash: response.current_hash },
          fork: {
            custom_content: response.content,
            current_hash: response.current_hash,
            base_hash: response.current_hash,
          },
        }
      : response;
    canonical = data.canonical.content;
    canonicalHash = data.canonical.current_hash;
    raw = data.fork?.custom_content ?? canonical;
    hash = data.fork?.current_hash ?? canonicalHash;
    forkBaseHash = data.fork?.base_hash ?? canonicalHash;
    hasFork = !!data.fork;
    syncOriginal();
    updateSyncBanner();
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

  function scheduleSplitPreview(delay = 350) {
    if (!splitEnabled || !root.classList.contains('is-editing')) return;
    clearTimeout(splitTimer);
    if (livePreviewState) livePreviewState.textContent = 'در حال همگام‌سازی…';
    const seq = ++splitPreviewSeq;
    const snapshot = raw;
    const epoch = identityEpoch;
    splitTimer = setTimeout(() => {
      void previewHtml(snapshot)
        .then((html) => {
          if (seq !== splitPreviewSeq || epoch !== identityEpoch || !livePreviewBody.isConnected) return;
          livePreviewBody.innerHTML = html;
          if (livePreviewState) livePreviewState.textContent = 'به‌روز';
        })
        .catch(() => {
          if (seq !== splitPreviewSeq || epoch !== identityEpoch) return;
          if (livePreviewState) livePreviewState.textContent = 'پیش‌نمایش موقتاً ناموفق';
        });
    }, delay);
  }

  const persistRemote = async (content: string, expected_hash: string) => {
    const epoch = identityEpoch;
    const fork = await api(
      libraryId
        ? '/library/items/' + encodeURIComponent(libraryId)
        : '/notes/' + encodeURIComponent(slug) + '/fork',
      { content, expected_hash },
      libraryId ? 'PATCH' : 'POST',
    );
    if (epoch !== identityEpoch) throw new Error('حساب تغییر کرد.');
    return fork;
  };

  function makeAutosaver(initialHash: string) {
    return createAutosaver(initialHash, async (content, expected_hash) => {
      say('در حال ذخیره…');
      updateMeta('saving', 'در حال ذخیره…');
      try {
        const fork = await persistRemote(content, expected_hash);
        hash = fork.current_hash;
        hasFork = true;
        if (fork.base_hash) forkBaseHash = fork.base_hash;
        dirty = raw !== content;
        syncOriginal();
        updateSyncBanner();
        updateMeta(dirty ? 'dirty' : 'saved', dirty ? 'تغییرات ذخیره‌نشده' : 'ذخیره‌شده');
        context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, dirty);
        say(dirty ? 'تغییر جدید در انتظار ذخیره' : 'ذخیره شد — نسخهٔ شخصی شما');
        return fork;
      } catch (error) {
        const statusCode = error instanceof ApiError ? error.status : 0;
        stopped = [401, 403, 409].includes(statusCode);
        updateMeta(
          statusCode === 409 ? 'conflict' : 'error',
          statusCode === 409 ? 'تداخل نسخه' : 'خطا در ذخیره',
        );
        handle(error);
        if (statusCode === 409) {
          void handleConflictRecovery();
        }
        throw error;
      }
    });
  }

  async function save() {
    if (!autosave || stopped) {
      throw new Error('برای ادامهٔ ذخیره، تداخل نسخه را در پنجرهٔ مقایسه برطرف کنید.');
    }
    clearTimeout(timer);
    if (!dirty) return;
    await autosave(raw);
  }

  function handle(error: unknown) {
    say(message(error));
  }

  // Merge / Conflict / Rebase Dialog elements & handlers
  const mergeDialog = root.querySelector<HTMLDialogElement>('[data-merge-dialog]')!;
  const mergeTitle = root.querySelector<HTMLElement>('[data-merge-title]')!;
  const mergeDesc = root.querySelector<HTMLElement>('[data-merge-desc]')!;
  const mergeStats = root.querySelector<HTMLElement>('[data-merge-stats]')!;
  const mergeLabelA = root.querySelector<HTMLElement>('[data-merge-label-a]')!;
  const mergeLabelB = root.querySelector<HTMLElement>('[data-merge-label-b]')!;
  const mergeHost = root.querySelector<HTMLElement>('[data-merge-host]')!;
  const mergeStatus = root.querySelector<HTMLElement>('[data-merge-status]')!;
  const mergeApplyButton = root.querySelector<HTMLButtonElement>('[data-merge-apply]')!;
  const mergeUseRemoteButton = root.querySelector<HTMLButtonElement>('[data-merge-use-remote]')!;
  const mergeCopyButton = root.querySelector<HTMLButtonElement>('[data-merge-copy]')!;

  function cleanupMerge() {
    mergeView?.destroy();
    mergeView = undefined;
    mergeHost.replaceChildren();
    mergeStatus.textContent = '';
  }

  mergeDialog.addEventListener('close', () => {
    cleanupMerge();
  });

  for (const btn of root.querySelectorAll('[data-merge-close], [data-merge-cancel]')) {
    btn.addEventListener('click', () => mergeDialog.close());
  }

  async function openMergeDialog(options: {
    mode: 'conflict' | 'rebase';
    remoteContent: string;
    remoteHash: string;
  }) {
    mergeMode = options.mode;
    mergeRemoteContent = options.remoteContent;
    mergeRemoteHash = options.remoteHash;

    const stats = summarizeDiffStats(options.remoteContent, raw);
    mergeStats.textContent = stats.changed
      ? `+${stats.added.toLocaleString('fa')} افزوده · -${stats.removed.toLocaleString('fa')} حذف`
      : 'متن‌ها یکسان‌اند';
    mergeStats.hidden = false;

    if (options.mode === 'conflict') {
      mergeTitle.textContent = 'رفع تداخل ذخیره';
      mergeDesc.textContent =
        'نسخهٔ ذخیره‌شده روی سرور از زمان شروع ویرایش شما تغییر کرده است. تغییرات هر بخش را با کلید فلش منتقل یا در ستون پیش‌نویس خود ویرایش و ذخیره کنید.';
      mergeLabelA.textContent = 'نسخهٔ جدید سرور (فقط خواندنی)';
      mergeLabelB.textContent = 'پیش‌نویس فعلی شما (قابل ویرایش)';
      mergeApplyButton.textContent = 'ذخیرهٔ نسخهٔ ادغام‌شده';
    } else {
      mergeTitle.textContent = 'مقایسه و همگام‌سازی با نسخهٔ رسمی';
      mergeDesc.textContent =
        'نسخهٔ رسمی این یادداشت به‌روزرسانی شده است. نسخهٔ رسمی جدید را با ویرایش شخصی خود مقایسه کرده و مبنا را همگام‌سازی کنید.';
      mergeLabelA.textContent = 'نسخهٔ رسمی تازه (فقط خواندنی)';
      mergeLabelB.textContent = 'نسخهٔ شخصی شما (قابل ویرایش)';
      mergeApplyButton.textContent = 'اعمال ادغام و همگام‌سازی';
    }

    cleanupMerge();
    if (!mergeDialog.open) mergeDialog.showModal();
    mergeStatus.textContent = 'در حال آماده‌سازی مقایسه…';

    try {
      const [{ MergeView }, { basicSetup }, { markdown }, { EditorState }, { EditorView }] =
        await Promise.all([
          import('@codemirror/merge'),
          import('codemirror'),
          import('@codemirror/lang-markdown'),
          import('@codemirror/state'),
          import('@codemirror/view'),
        ]);
      if (!mergeDialog.open) return;

      const sharedExt = [
        markdown(),
        EditorView.lineWrapping,
        EditorView.perLineTextDirection.of(true),
      ];
      mergeView = new MergeView({
        parent: mergeHost,
        a: {
          doc: options.remoteContent,
          extensions: [...sharedExt, EditorState.readOnly.of(true), EditorView.editable.of(false)],
        },
        b: {
          doc: raw,
          extensions: [basicSetup, ...sharedExt],
        },
        revertControls: 'a-to-b',
        highlightChanges: true,
        gutter: true,
      });
      mergeStatus.textContent = '';
    } catch (error) {
      mergeStatus.textContent = message(error);
    }
  }

  async function handleConflictRecovery() {
    try {
      const latest = await fetchServerNote();
      mergeRemoteContent = libraryId
        ? latest.content
        : latest.fork?.custom_content ?? latest.canonical.content;
      mergeRemoteHash = libraryId
        ? latest.current_hash
        : latest.fork?.current_hash ?? latest.canonical.current_hash;
      if (!libraryId && latest.canonical) {
        canonical = latest.canonical.content;
        canonicalHash = latest.canonical.current_hash;
      }
      updateSyncBanner();
      await openMergeDialog({
        mode: 'conflict',
        remoteContent: mergeRemoteContent,
        remoteHash: mergeRemoteHash,
      });
    } catch (error) {
      say(message(error));
    }
  }

  mergeCopyButton.addEventListener('click', () => {
    const content = mergeView ? mergeView.b.state.doc.toString() : raw;
    void navigator.clipboard.writeText(content).then(() => {
      showToast('متن پیش‌نویس در حافظه کپی شد.', { variant: 'info' });
    });
  });

  mergeUseRemoteButton.addEventListener('click', () => {
    if (!mergeView) return;
    const remoteText = mergeView.a.state.doc.toString();
    mergeView.b.dispatch({
      changes: { from: 0, to: mergeView.b.state.doc.length, insert: remoteText },
    });
    mergeStatus.textContent = 'متن مرجع در پیش‌نویس شما جایگزین شد؛ برای ثبت نهایی ذخیره کنید.';
  });

  mergeApplyButton.addEventListener('click', () => {
    void (async () => {
      if (!mergeView || !mergeMode) return;
      const mergedContent = mergeView.b.state.doc.toString();
      mergeApplyButton.disabled = true;
      mergeStatus.textContent = 'در حال ثبت نسخهٔ ادغام‌شده…';
      try {
        if (mergeMode === 'conflict') {
          const saved = await persistRemote(mergedContent, mergeRemoteHash);
          raw = mergedContent;
          frontmatter = splitEditorMarkdown(raw).frontmatter;
          hash = saved.current_hash;
          hasFork = true;
          dirty = false;
          stopped = false;
          autosave = makeAutosaver(hash);
          syncBannerText.textContent = '';
          mergeRemoteHash = '';
          mergeRemoteContent = '';
          showToast('تداخل با موفقیت برطرف و ذخیره شد.', { variant: 'success' });
        } else {
          const rebased = await api('/notes/' + encodeURIComponent(slug) + '/fork/rebase', {
            content: mergedContent,
            expected_hash: hash,
            canonical_hash: mergeRemoteHash,
          });
          raw = mergedContent;
          frontmatter = splitEditorMarkdown(raw).frontmatter;
          canonical = mergeRemoteContent;
          canonicalHash = mergeRemoteHash;
          forkBaseHash = mergeRemoteHash;
          hash = rebased.current_hash;
          hasFork = true;
          dirty = false;
          stopped = false;
          autosave = makeAutosaver(hash);
          showToast('نسخهٔ شخصی با آخرین تغییرات رسمی همگام شد.', { variant: 'success' });
        }

        if (view) {
          suppressingDocChange = true;
          try {
            const nextBody = raw.slice(frontmatter.length);
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: nextBody },
            });
          } finally {
            suppressingDocChange = false;
          }
          const properties = root.querySelector<HTMLTextAreaElement>('[data-properties]');
          if (properties) {
            properties.value =
              raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ??
              'title: ""\ntags: []\naliases: []';
          }
          scheduleSplitPreview(0);
        } else if (!article.hidden) {
          await render(raw, article);
        }

        syncOriginal();
        updateSyncBanner();
        updateMeta('saved', 'ذخیره‌شده');
        context(
          view ? root.querySelector<HTMLElement>('[data-editor]')! : article,
          hasFork ? 'personal' : 'canonical',
          raw,
          hash,
          false,
        );
        say('ذخیره و همگام‌سازی شد.');
        mergeDialog.close();
      } catch (error) {
        mergeStatus.textContent = message(error);
      } finally {
        mergeApplyButton.disabled = false;
      }
    })();
  });

  syncBannerAction.addEventListener('click', () => {
    void (async () => {
      const latest = await fetchServerNote();
      if (syncBanner.dataset.bannerMode === 'conflict') {
        const rContent = libraryId
          ? latest.content
          : latest.fork?.custom_content ?? latest.canonical.content;
        const rHash = libraryId
          ? latest.current_hash
          : latest.fork?.current_hash ?? latest.canonical.current_hash;
        await openMergeDialog({ mode: 'conflict', remoteContent: rContent, remoteHash: rHash });
        return;
      }
      canonical = latest.canonical.content;
      canonicalHash = latest.canonical.current_hash;
      await openMergeDialog({
        mode: 'rebase',
        remoteContent: canonical,
        remoteHash: canonicalHash,
      });
    })().catch(handle);
  });

  function toggleSplitPreview() {
    splitEnabled = !splitEnabled;
    try {
      localStorage.setItem('garden-editor-split', String(splitEnabled));
    } catch {}
    updateToolbar();
    if (splitEnabled) scheduleSplitPreview(0);
  }
  splitButton?.addEventListener('click', toggleSplitPreview);

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
    if (!readOnly && splitEnabled) scheduleSplitPreview(0);
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
      const currentUser = await getSession();
      if (!currentUser) {
        const msg = 'برای ویرایش یادداشت و ساخت نسخهٔ شخصی ابتدا وارد حساب کاربری شوید.';
        say(msg);
        showToast(msg, { variant: 'info', actionLabel: 'ورود به حساب', href: '/account' });
        return;
      }
      if (view) {
        activateEditor({ article, panel, indicator: document.querySelector('.note-status') });
        modeSwitch(false);
        syncOriginal();
        updateMeta(dirty ? 'dirty' : 'saved', dirty ? 'تغییرات ذخیره‌نشده' : 'ذخیره‌شده');
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
      autosave = makeAutosaver(hash);

      const propertiesDetails = root.querySelector<HTMLDetailsElement>(
        '.editor-frontmatter-panel',
      )!;
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
            if (!update.docChanged || suppressingDocChange) return;
            const changes: { from: number; to: number; insert: string }[] = [];
            update.changes.iterChanges((from, to, _from, _to, insert) =>
              changes.push({ from, to, insert: insert.toString() }),
            );
            raw = frontmatter + applyRawChanges(raw.slice(frontmatter.length), changes);
            dirty = true;
            syncOriginal();
            updateMeta('dirty', 'تغییرات ذخیره‌نشده');
            if (!propertiesDetails.open) syncProperties();
            context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, true);
            say('تغییرات ذخیره‌نشده');
            scheduleSplitPreview();
            clearTimeout(timer);
            if (!stopped) {
              timer = setTimeout(() => {
                void save().catch(handle);
              }, 1500);
            }
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
          updateMeta('dirty', 'ویژگی‌ها تغییر کردند');
          context(root.querySelector<HTMLElement>('[data-editor]')!, 'personal', raw, hash, true);
          say('ویژگی‌ها تغییر کردند؛ در انتظار ذخیره');
          scheduleSplitPreview();
          clearTimeout(timer);
          if (!stopped) {
            timer = setTimeout(() => {
              void save().catch(handle);
            }, 1500);
          }
        } catch (error) {
          handle(error);
        }
      });

      activateEditor({ article, panel, indicator: document.querySelector('.note-status') });
      modeSwitch(false);
      updateMeta(dirty ? 'dirty' : 'saved', dirty ? 'تغییرات ذخیره‌نشده' : 'ذخیره‌شده');
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
  const proposalDiffSummary = root.querySelector<HTMLElement>('[data-proposal-diff-summary]')!;
  const resetDialog = root.querySelector<HTMLDialogElement>('[data-reset-dialog]')!;
  const resetStatus = root.querySelector<HTMLElement>('[data-reset-status]')!;
  const resetConfirmButton = root.querySelector<HTMLButtonElement>('[data-reset-confirm]')!;

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
      const stats = summarizeDiffStats(canonical, raw);
      proposalDiffSummary.textContent = stats.changed
        ? `خلاصهٔ تغییرات شما: +${stats.added.toLocaleString('fa')} خط افزوده · -${stats.removed.toLocaleString('fa')} خط حذف نسبت به نسخهٔ رسمی`
        : 'هیچ تفاوتی نسبت به نسخهٔ رسمی وجود ندارد.';
      proposalDiffSummary.hidden = false;
      root.querySelector('[data-share-status]')!.textContent = '';
      shareDialog.showModal();
    })().catch(handle);
  });

  for (const closeEl of root.querySelectorAll('[data-share-skip], [data-share-close]')) {
    closeEl.addEventListener('click', () => shareDialog.close());
  }

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
      const currentUser = await getSession();
      if (!currentUser) {
        const msg = 'برای نشانه‌گذاری یادداشت‌ها ابتدا وارد حساب کاربری شوید.';
        say(msg);
        showToast(msg, { variant: 'info', actionLabel: 'ورود به حساب', href: '/account' });
        return;
      }
      await api(
        '/workspace/bookmarks/' + encodeURIComponent(slug),
        undefined,
        selected ? 'DELETE' : 'PUT',
      );
      mark(!selected);
      const doneText = selected ? 'نشانه برداشته شد' : 'نشانه‌گذاری شد';
      say(doneText);
      showToast(doneText, { variant: 'success' });
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
        const okMsg = 'پیشنهاد برای بازبینی مؤلف ارسال شد؛ نسخهٔ رسمی هنوز تغییر نکرده است.';
        say(okMsg);
        showToast('پیشنهاد اصلاح ارسال شد.', { variant: 'success' });
        form.reset();
        shareDialog.close();
      } catch (error) {
        root.querySelector('[data-share-status]')!.textContent = message(error);
      } finally {
        button.disabled = false;
      }
    });

  document.querySelector('[data-reset]')!.addEventListener('click', () => {
    resetStatus.textContent = '';
    resetDialog.showModal();
  });
  for (const cancel of root.querySelectorAll('[data-reset-cancel]')) {
    cancel.addEventListener('click', () => resetDialog.close());
  }
  resetConfirmButton.addEventListener('click', async () => {
    resetConfirmButton.disabled = true;
    resetStatus.textContent = 'در حال بازنشانی…';
    try {
      if (dirty) await save();
      await api('/notes/' + encodeURIComponent(slug) + '/fork/reset', { expected_hash: hash });
      dirty = false;
      resetDialog.close();
      location.reload();
    } catch (error) {
      resetStatus.textContent = message(error);
      resetConfirmButton.disabled = false;
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
        event.shiftKey &&
        event.key.toLowerCase() === 'p' &&
        editing
      ) {
        event.preventDefault();
        toggleSplitPreview();
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
    splitPreviewSeq++;
    userInteracted = true;
    stopped = true;
    dirty = false;
    clearTimeout(timer);
    clearTimeout(splitTimer);
    cleanupMerge();
    if (mergeDialog.open) mergeDialog.close();
    if (resetDialog.open) resetDialog.close();
    if (shareDialog.open) shareDialog.close();
    disposeToolbar?.();
    view?.destroy();
    view = undefined;
    raw = '';
    hash = '';
    canonical = '';
    canonicalHash = '';
    forkBaseHash = '';
    loaded = undefined;
    article.replaceChildren();
    delete article.dataset.aiRaw;
    delete article.dataset.aiHash;
    panel.replaceChildren();
    panel.hidden = true;
    toolbar.hidden = true;
    syncBanner.hidden = true;
    location.reload();
  });

  let defaultApplied = false;
  const applyDefaultMode = (modeName: string | undefined) => {
    if (!modeName) return;
    if (defaultApplied) return;
    defaultApplied = true;
    if (modeName === 'edit' && !userInteracted)
      document.querySelector<HTMLButtonElement>('[data-edit]')?.click();
  };
  document.addEventListener('garden:preferences', (event) =>
    applyDefaultMode((event as CustomEvent).detail.default_mode),
  );
  if (new URLSearchParams(location.search).get('edit') === '1') applyDefaultMode('edit');
  applyDefaultMode(document.documentElement.dataset.defaultMode);

  window.addEventListener('beforeunload', (event) => {
    if (dirty) {
      event.preventDefault();
    }
  });
}
