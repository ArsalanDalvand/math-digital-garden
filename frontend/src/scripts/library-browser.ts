import { formatFileSize } from '../lib/format-size.mjs';
import {
  describeVisibility,
  filterAndSortLibraryRows,
  libraryEmptyCopy,
  validateZipImportFile,
} from '../lib/library-browser-model.mjs';
import { $identity } from '../stores/garden';
import type { Account } from './account-preferences';
import { ApiError, message, api as request } from './api';
import { personalNodes, publicationHref } from './library-utils.mjs';
import { getSession, invalidateSessionCache } from './session';
import { showToast } from './toast';

type PublicNode = { label: string; link?: string; items?: PublicNode[]; count?: number };

type BrowserRow = {
  id: string;
  title: string;
  kind: 'folder' | 'note';
  source: 'public' | 'personal' | 'community';
  link?: string;
  href?: string;
  canonical_slug?: string | null;
  visibility?: string;
  share_token?: string | null;
  has_git?: boolean;
  git_repo_url?: string | null;
  updated?: boolean;
  verified?: boolean;
  publicNode?: PublicNode;
  raw?: any;
};

type IconName =
  | 'folder'
  | 'file'
  | 'globe'
  | 'link'
  | 'lock'
  | 'refresh'
  | 'share'
  | 'pencil'
  | 'move'
  | 'trash'
  | 'restore'
  | 'git'
  | 'archive'
  | 'upload'
  | 'copy'
  | 'external'
  | 'close'
  | 'chevron';

const ICON_PATHS: Record<IconName, string> = {
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  lock:
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  move:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  restore:
    '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  git: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  external:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevron: '<path d="m15 18-6-6 6-6"/>',
};

function svgIcon(name: IconName, size = 15): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.85');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('library-icon');
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

const root = document.querySelector<HTMLElement>('[data-library-browser]');

if (root) {
  const statusEl = root.querySelector<HTMLElement>('[data-browser-status]')!;
  const emptyEl = root.querySelector<HTMLElement>('[data-browser-empty]')!;
  const listEl = root.querySelector<HTMLElement>('[data-browser-list]')!;
  const form = root.querySelector<HTMLFormElement>('[data-create-item]')!;
  const guestBanner = root.querySelector<HTMLElement>('[data-library-guest-banner]');
  const filterInput = root.querySelector<HTMLInputElement>('[data-browser-filter]');
  const filterClear = root.querySelector<HTMLButtonElement>('[data-browser-filter-clear]');
  const moreBtn = root.querySelector<HTMLButtonElement>('[data-browser-more]')!;
  const importBtn = root.querySelector<HTMLButtonElement>('[data-import-docs]');
  const emptyTrashBtn = root.querySelector<HTMLButtonElement>('[data-empty-trash]');
  const pathHost = root.querySelector<HTMLElement>('[data-browser-path]')!;

  let currentUser: Account | null = null;
  let currentIdentity: string | null | undefined;
  let hasLoadedOnce = false;
  let identityEpoch = 0;
  let generation = 0;
  let creating = false;
  let parent: string | null = null;
  let view = 'items';
  let offset = 0;
  let loadedRows: BrowserRow[] = [];
  const path: { id: string; title: string }[] = [];
  let publicPath: PublicNode[] = [];
  const publicTreePromise = request<PublicNode[]>('/library-tree');
  void publicTreePromise.catch(() => {});

  const api = async <T = any>(pathUrl: string, data?: unknown, method?: string): Promise<T> => {
    const epoch = identityEpoch;
    const value = await request<T>(pathUrl, data, method);
    if (epoch !== identityEpoch) {
      throw new Error('حساب تغییر کرد؛ درخواست قبلی کنار گذاشته شد.');
    }
    return value;
  };

  const run = async (fn: () => Promise<void>) => {
    const epoch = identityEpoch;
    try {
      statusEl.textContent = '';
      statusEl.dataset.error = 'false';
      await fn();
    } catch (error) {
      if (epoch === identityEpoch) {
        statusEl.textContent = message(error);
        statusEl.dataset.error = 'true';
      }
    }
  };

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  const actionBtn = (
    text: string,
    icon: IconName | null,
    fn: () => void | Promise<void>,
    className = 'library-row-btn',
  ) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    if (icon) btn.append(svgIcon(icon, 14));
    btn.append(el('span', text));
    btn.addEventListener('click', () => void run(async () => await fn()));
    return btn;
  };

  const createModal = (title: string, attr?: string) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'library-modal';
    if (attr) dialog.setAttribute(attr, '');

    const titleId = `library-modal-${Math.random().toString(36).slice(2, 9)}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const header = el('div', undefined, 'library-dialog-header');
    const heading = el('h2', title);
    heading.id = titleId;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'library-modal-close';
    closeBtn.setAttribute('aria-label', 'بستن');
    closeBtn.append(svgIcon('close', 16));
    closeBtn.addEventListener('click', () => dialog.close());
    header.append(heading, closeBtn);

    const modalBody = el('div', undefined, 'library-modal-body');
    const feedback = el('p', '', 'library-modal-feedback');
    feedback.setAttribute('role', 'status');

    dialog.append(header, modalBody, feedback);
    root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    return { dialog, modalBody, feedback };
  };

  const personalNoteHref = (item: any) =>
    item.canonical_slug
      ? `/notes/${encodeURIComponent(item.canonical_slug)}`
      : `/library/${encodeURIComponent(item.id)}`;

  const openShareDialog = (item: any) => {
    const { dialog, modalBody, feedback } = createModal(
      `اشتراک‌گذاری: ${item.title}`,
      'data-share-dialog',
    );
    const kindLabel = item.kind === 'folder' ? 'این پوشه و تمام یادداشت‌های آن' : 'این یادداشت';

    const renderContent = () => {
      modalBody.replaceChildren();
      const visInfo = describeVisibility(item.visibility);

      const banner = el('div', undefined, 'share-status-banner');
      const pill = el('span', `وضعیت فعلی: ${visInfo.label}`, 'share-vis-pill');
      pill.dataset.visibility = visInfo.visibility;
      banner.append(pill);

      const desc = el(
        'p',
        `فقط ${kindLabel} با سطح دسترسی زیر منتشر می‌شود؛ سایر بخش‌های کتابخانهٔ شخصی شما خصوصی می‌مانند.`,
        'library-modal-desc',
      );

      const shareForm = el('form', undefined, 'share-visibility-form');
      const radioGrid = el('div', undefined, 'share-radio-grid');

      const options: Array<{
        value: 'private' | 'unlisted' | 'public';
        title: string;
        subtitle: string;
        icon: IconName;
      }> = [
        {
          value: 'private',
          title: 'خصوصی',
          subtitle: 'فقط برای شما در کتابخانهٔ شخصی قابل مشاهده است.',
          icon: 'lock',
        },
        {
          value: 'unlisted',
          title: 'پیوند اختصاصی (Unlisted)',
          subtitle: 'هرکسی که پیوند محرمانه را داشته باشد بدون ورود مطالعه می‌کند.',
          icon: 'link',
        },
        {
          value: 'public',
          title: 'انتشار عمومی',
          subtitle: 'با نشانی ثابت عمومی بدون نیاز به ورود در دسترس قرار می‌گیرد.',
          icon: 'globe',
        },
      ];

      let selectedVisibility = visInfo.visibility;
      for (const opt of options) {
        const card = el('label', undefined, 'share-option-card');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'visibility';
        radio.value = opt.value;
        radio.checked = selectedVisibility === opt.value;
        card.dataset.selected = String(radio.checked);

        radio.addEventListener('change', () => {
          selectedVisibility = opt.value;
          for (const sib of radioGrid.querySelectorAll<HTMLElement>('.share-option-card')) {
            sib.dataset.selected = 'false';
          }
          card.dataset.selected = 'true';
        });

        const copyWrap = el('div', undefined, 'share-option-copy');
        const titleRow = el('strong', undefined, 'library-share-opt-title');
        titleRow.append(svgIcon(opt.icon, 14), el('span', opt.title));
        copyWrap.append(titleRow, el('span', opt.subtitle));
        card.append(radio, copyWrap);
        radioGrid.append(card);
      }

      const saveBtn = el('button', 'ذخیرهٔ سطح دسترسی', 'garden-button-primary');
      saveBtn.type = 'submit';
      shareForm.append(radioGrid, saveBtn);

      shareForm.addEventListener('submit', (event) => {
        event.preventDefault();
        void (async () => {
          saveBtn.disabled = true;
          feedback.textContent = 'در حال ذخیره تنظیمات…';
          feedback.dataset.error = 'false';
          try {
            const shouldCreateToken = selectedVisibility === 'unlisted' && !item.share_token;
            const updated = await api(
              `/library/items/${item.id}/publication`,
              { visibility: selectedVisibility, rotate_token: shouldCreateToken },
              'PUT',
            );
            item.visibility = updated.visibility;
            item.share_token = updated.share_token;
            feedback.textContent = '';
            showToast('وضعیت اشتراک‌گذاری به‌روزرسانی شد.', { variant: 'success' });
            renderContent();
            await load();
          } catch (error) {
            feedback.textContent = message(error);
            feedback.dataset.error = 'true';
          } finally {
            saveBtn.disabled = false;
          }
        })();
      });

      modalBody.append(banner, desc, shareForm);

      if (visInfo.visibility !== 'private') {
        const href = publicationHref(item);
        const fullUrl = new URL(href, window.location.origin).href;

        const linkCard = el('div', undefined, 'share-link-card');
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.readOnly = true;
        urlInput.dir = 'ltr';
        urlInput.value = fullUrl;
        urlInput.setAttribute('aria-label', 'نشانی اشتراک‌گذاری');
        urlInput.addEventListener('click', () => urlInput.select());

        const linkBtns = el('div', undefined, 'share-link-actions');
        const copyBtn = actionBtn(
          'کپی پیوند',
          'copy',
          async () => {
            await navigator.clipboard.writeText(fullUrl);
            showToast('پیوند اشتراک‌گذاری کپی شد.', { variant: 'success' });
          },
          'garden-button-secondary',
        );

        const viewLink = el('a', undefined, 'garden-button-secondary');
        viewLink.href = href;
        viewLink.append(svgIcon('external', 14), el('span', 'مشاهده نسخهٔ اشتراکی'));
        linkBtns.append(copyBtn, viewLink);

        if (visInfo.visibility === 'unlisted') {
          const rotateBtn = actionBtn(
            'تولید پیوند تازه',
            'refresh',
            async () => {
              const rotated = await api(
                `/library/items/${item.id}/publication`,
                { visibility: 'unlisted', rotate_token: true },
                'PUT',
              );
              item.visibility = rotated.visibility;
              item.share_token = rotated.share_token;
              showToast('پیوند محرمانهٔ جدید ساخته و پیوند قبلی باطل شد.', { variant: 'info' });
              renderContent();
              await load();
            },
            'garden-button-secondary',
          );
          linkBtns.append(rotateBtn);
        }

        linkCard.append(urlInput, linkBtns);
        modalBody.append(linkCard);
      }
    };

    renderContent();
    dialog.showModal();
  };

  const openRenameDialog = (item: any) => {
    const { dialog, modalBody, feedback } = createModal(
      item.kind === 'folder' ? 'تغییر نام پوشه' : 'تغییر نام یادداشت',
    );
    const renameForm = el('form', undefined, 'library-form');
    const fieldLabel = el('label');
    fieldLabel.append(el('span', 'نام تازه'));
    const input = document.createElement('input');
    input.type = 'text';
    input.required = true;
    input.maxLength = 255;
    input.value = item.title || '';
    fieldLabel.append(input);

    const actionsRow = el('div', undefined, 'library-modal-actions');
    const saveBtn = el('button', 'ذخیره نام', 'garden-button-primary');
    saveBtn.type = 'submit';
    const cancelBtn = actionBtn(
      'انصراف',
      null,
      () => dialog.close(),
      'garden-button-secondary',
    );
    actionsRow.append(saveBtn, cancelBtn);
    renameForm.append(fieldLabel, actionsRow);

    renameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextTitle = input.value.trim();
      if (!nextTitle) {
        feedback.textContent = 'نام نمی‌تواند خالی باشد.';
        feedback.dataset.error = 'true';
        input.focus();
        return;
      }
      if (nextTitle === item.title) {
        dialog.close();
        return;
      }
      void (async () => {
        saveBtn.disabled = true;
        feedback.textContent = 'در حال ذخیره…';
        feedback.dataset.error = 'false';
        try {
          await api(`/library/items/${item.id}`, { title: nextTitle }, 'PATCH');
          dialog.close();
          showToast('نام با موفقیت تغییر کرد.', { variant: 'success' });
          await load();
          document.dispatchEvent(new Event('garden:library'));
        } catch (error) {
          saveBtn.disabled = false;
          feedback.textContent = message(error);
          feedback.dataset.error = 'true';
        }
      })();
    });

    modalBody.append(renameForm);
    dialog.showModal();
    input.select();
  };

  const openMoveDialog = (item: any) => {
    const { dialog, modalBody, feedback } = createModal(`انتقال: ${item.title}`);
    const desc = el('p', 'پوشهٔ مقصد را باز کنید و سپس «انتقال به این پوشه» را بزنید.', 'library-modal-desc');
    const panel = el('div', undefined, 'library-move-panel');
    modalBody.append(desc, panel);

    let requestCount = 0;
    const curEpoch = identityEpoch;

    const browse = async (destination: string | null, start = 0) => {
      const current = ++requestCount;
      const rows = await api<any[]>(
        `/library/items?offset=${start}&limit=50${destination ? `&parent_id=${destination}` : ''}`,
      );
      if (current !== requestCount || curEpoch !== identityEpoch || !dialog.open) return;

      if (start === 0) {
        panel.replaceChildren();
        const headerBtns = el('div', undefined, 'library-move-controls');
        headerBtns.append(
          actionBtn(
            'انتقال به این پوشه',
            'move',
            async () => {
              await api(`/library/items/${item.id}`, { parent_id: destination }, 'PATCH');
              dialog.close();
              showToast('مورد به پوشهٔ مقصد منتقل شد.', { variant: 'success' });
              await load();
              document.dispatchEvent(new Event('garden:library'));
            },
            'garden-button-primary',
          ),
          actionBtn(
            'ریشهٔ کتابخانه',
            'folder',
            async () => {
              try {
                await browse(null);
              } catch (error) {
                feedback.textContent = message(error);
                feedback.dataset.error = 'true';
              }
            },
            'garden-button-secondary',
          ),
        );
        panel.append(headerBtns);
      }

      const folderList = panel.querySelector('.library-move-folders') || el('div', undefined, 'library-move-folders');
      if (start === 0) panel.append(folderList);

      for (const candidate of rows) {
        if (candidate.kind === 'folder' && candidate.id !== item.id) {
          folderList.append(
            actionBtn(candidate.title, 'folder', async () => {
              try {
                await browse(candidate.id);
              } catch (error) {
                feedback.textContent = message(error);
                feedback.dataset.error = 'true';
              }
            }),
          );
        }
      }
      if (rows.length === 50) {
        folderList.append(
          actionBtn('بیشتر', null, async () => await browse(destination, start + 50)),
        );
      }
    };

    dialog.addEventListener('close', () => {
      requestCount++;
    });
    dialog.showModal();
    void browse(null).catch((error) => {
      feedback.textContent = message(error);
      feedback.dataset.error = 'true';
    });
  };

  const openTrashConfirmDialog = (item: any) => {
    const isFolder = item.kind === 'folder';
    const { dialog, modalBody, feedback } = createModal(`انتقال به زباله‌دان: ${item.title}`);
    modalBody.append(
      el(
        'p',
        isFolder
          ? 'این پوشه و تمام یادداشت‌ها و زیرپوشه‌های آن به زباله‌دان منتقل می‌شوند. بعداً می‌توانید آن را از تب زباله‌دان بازیابی کنید.'
          : 'این یادداشت به زباله‌دان منتقل می‌شود و از فهرست اصلی پنهان خواهد شد.',
        'library-modal-desc',
      ),
    );

    const actionsRow = el('div', undefined, 'library-actions-inline');
    const confirmBtn = actionBtn(
      'تأیید و انتقال به زباله‌دان',
      'trash',
      async () => {
        confirmBtn.disabled = true;
        try {
          await api(`/library/items/${item.id}/trash${isFolder ? '?subtree=true' : ''}`, {});
          dialog.close();
          showToast('به زباله‌دان منتقل شد.', { variant: 'info' });
          await load();
          document.dispatchEvent(new Event('garden:library'));
        } catch (error) {
          confirmBtn.disabled = false;
          feedback.textContent = message(error);
          feedback.dataset.error = 'true';
        }
      },
      'garden-button-danger',
    );
    const cancelBtn = actionBtn('انصراف', null, () => dialog.close(), 'garden-button-secondary');
    actionsRow.append(confirmBtn, cancelBtn);
    modalBody.append(actionsRow);
    dialog.showModal();
  };

  const openPermanentDeleteDialog = (item: any) => {
    const isFolder = item.kind === 'folder';
    const { dialog, modalBody, feedback } = createModal(
      `حذف دائمی: ${item.title}`,
      'data-permanent-delete-dialog',
    );
    modalBody.append(
      el(
        'p',
        isFolder
          ? 'این پوشه و تمام زیرپوشه‌ها، یادداشت‌ها، دیدگاه‌ها و پیوست‌های آن برای همیشه حذف می‌شوند و قابل بازیابی نخواهند بود.'
          : 'این یادداشت همراه با تاریخچه، دیدگاه‌ها و پیوست‌های آن برای همیشه حذف می‌شود و قابل بازیابی نخواهد بود.',
        'library-modal-desc',
      ),
    );

    const actionsRow = el('div', undefined, 'library-actions-inline');
    const confirmBtn = actionBtn(
      'حذف دائمی',
      'trash',
      async () => {
        confirmBtn.disabled = true;
        try {
          await api(`/library/items/${item.id}`, undefined, 'DELETE');
          dialog.close();
          showToast(`«${item.title}» برای همیشه حذف شد.`, { variant: 'info' });
          await load();
          document.dispatchEvent(new Event('garden:library'));
        } catch (error) {
          confirmBtn.disabled = false;
          feedback.textContent = message(error);
          feedback.dataset.error = 'true';
        }
      },
      'garden-button-danger',
    );
    const cancelBtn = actionBtn('انصراف', null, () => dialog.close(), 'garden-button-secondary');
    actionsRow.append(confirmBtn, cancelBtn);
    modalBody.append(actionsRow);
    dialog.showModal();
  };

  const openEmptyTrashDialog = () => {
    const { dialog, modalBody, feedback } = createModal(
      'تخلیهٔ کامل زباله‌دان',
      'data-empty-trash-dialog',
    );
    modalBody.append(
      el(
        'p',
        'تمام پوشه‌ها و یادداشت‌های داخل زباله‌دان برای همیشه پاک می‌شوند و امکان بازیابی آن‌ها وجود ندارد.',
        'library-modal-desc',
      ),
    );

    const actionsRow = el('div', undefined, 'library-actions-inline');
    const confirmBtn = actionBtn(
      'تخلیهٔ زباله‌دان',
      'trash',
      async () => {
        confirmBtn.disabled = true;
        try {
          const res = await api<{ deleted?: number }>('/library/trash', undefined, 'DELETE');
          dialog.close();
          showToast(
            res?.deleted ? `${res.deleted} مورد برای همیشه حذف شد.` : 'زباله‌دان تخلیه شد.',
            { variant: 'info' },
          );
          await load();
          document.dispatchEvent(new Event('garden:library'));
        } catch (error) {
          confirmBtn.disabled = false;
          feedback.textContent = message(error);
          feedback.dataset.error = 'true';
        }
      },
      'garden-button-danger',
    );
    const cancelBtn = actionBtn('انصراف', null, () => dialog.close(), 'garden-button-secondary');
    actionsRow.append(confirmBtn, cancelBtn);
    modalBody.append(actionsRow);
    dialog.showModal();
  };

  const openImportDialog = () => {
    const { dialog, modalBody, feedback } = createModal(
      'درون‌ریزی مستندات به کتابخانه',
      'data-import-dialog',
    );
    modalBody.append(
      el(
        'p',
        'مستندات مارک‌داون خود را از مخزن گیت (GitHub, GitLab, Gitea یا سرور شخصی) یا یک فایل فشردهٔ ZIP وارد کنید. این پوشه‌ها کاملاً شخصی هستند.',
        'library-modal-desc',
      ),
    );

    let currentTab: 'git' | 'zip' = 'git';
    const tabsRow = el('div', undefined, 'library-import-tabs');
    const gitTabBtn = el('button', undefined, 'library-import-tab');
    gitTabBtn.type = 'button';
    gitTabBtn.append(svgIcon('git', 14), el('span', 'مخزن گیت (Git)'));

    const zipTabBtn = el('button', undefined, 'library-import-tab');
    zipTabBtn.type = 'button';
    zipTabBtn.append(svgIcon('archive', 14), el('span', 'فایل فشرده (ZIP)'));

    tabsRow.append(gitTabBtn, zipTabBtn);
    const panel = el('div', undefined, 'library-import-panel');
    modalBody.append(tabsRow, panel);

    const renderTab = () => {
      gitTabBtn.setAttribute('aria-pressed', String(currentTab === 'git'));
      gitTabBtn.classList.toggle('is-active', currentTab === 'git');
      zipTabBtn.setAttribute('aria-pressed', String(currentTab === 'zip'));
      zipTabBtn.classList.toggle('is-active', currentTab === 'zip');
      panel.replaceChildren();

      if (currentTab === 'git') {
        const formGit = el('form', undefined, 'library-form library-import-form');

        const urlField = el('label');
        urlField.append(el('span', 'نشانی مخزن گیت (HTTP / HTTPS)'));
        const urlInput = document.createElement('input');
        urlInput.name = 'repo_url';
        urlInput.type = 'url';
        urlInput.dir = 'ltr';
        urlInput.required = true;
        urlInput.placeholder = 'https://github.com/user/my-notes.git';
        urlField.append(urlInput);

        const branchField = el('label');
        branchField.append(el('span', 'شاخهٔ مخزن (پیش‌فرض: main)'));
        const branchInput = document.createElement('input');
        branchInput.name = 'branch';
        branchInput.type = 'text';
        branchInput.dir = 'ltr';
        branchInput.value = 'main';
        branchInput.placeholder = 'main';
        branchField.append(branchInput);

        const titleField = el('label');
        titleField.append(el('span', 'نام پوشه در کتابخانه (اختیاری)'));
        const titleInput = document.createElement('input');
        titleInput.name = 'title';
        titleInput.type = 'text';
        titleInput.maxLength = 255;
        titleInput.placeholder = 'خالی بگذارید تا نام مخزن استفاده شود';
        titleField.append(titleInput);

        const submitBtn = el('button', 'شروع کلون و ساخت یادداشت‌ها', 'garden-button-primary');
        submitBtn.type = 'submit';
        formGit.append(urlField, branchField, titleField, submitBtn);

        formGit.addEventListener('submit', (event) => {
          event.preventDefault();
          void (async () => {
            submitBtn.disabled = true;
            feedback.textContent = 'در حال کلون مخزن و پردازش یادداشت‌ها…';
            feedback.dataset.error = 'false';
            try {
              const res = await api(
                '/library/import/git',
                {
                  repo_url: urlInput.value.trim(),
                  branch: branchInput.value.trim() || 'main',
                  title: titleInput.value.trim() || undefined,
                  parent_id: parent,
                },
                'POST',
              );
              const total = res.stats?.total ?? 0;
              dialog.close();
              showToast(`مخزن با موفقیت وارد شد (${total} یادداشت).`, { variant: 'success' });
              await load();
              document.dispatchEvent(new Event('garden:library'));
            } catch (error) {
              submitBtn.disabled = false;
              feedback.textContent = message(error);
              feedback.dataset.error = 'true';
            }
          })();
        });

        panel.append(formGit);
      } else {
        const formZip = el('form', undefined, 'library-form library-import-form');
        let selectedFile: File | null = null;

        const dropzone = el('div', undefined, 'attachment-dropzone');
        dropzone.tabIndex = 0;
        dropzone.setAttribute('role', 'button');
        dropzone.setAttribute('aria-label', 'انتخاب یا رها کردن فایل ZIP');

        const dropTitle = el('strong', 'فایل زیپ را اینجا رها کنید یا برای انتخاب کلیک کنید');
        const dropHint = el(
          'span',
          'فقط فایل‌های ‎.zip (حداکثر ۵۰ مگابایت)',
          'attachment-drop-hint',
        );
        const fileInput = document.createElement('input');
        fileInput.name = 'zip_file';
        fileInput.type = 'file';
        fileInput.accept = '.zip,application/zip';
        fileInput.hidden = true;
        dropzone.append(svgIcon('upload', 20), dropTitle, dropHint, fileInput);

        const titleField = el('label');
        titleField.append(el('span', 'نام پوشه در کتابخانه (اختیاری)'));
        const titleInput = document.createElement('input');
        titleInput.name = 'title';
        titleInput.type = 'text';
        titleInput.maxLength = 255;
        titleInput.placeholder = 'خالی بگذارید تا نام فایل استفاده شود';
        titleField.append(titleInput);

        const submitBtn = el('button', 'آپلود و استخراج زیپ', 'garden-button-primary');
        submitBtn.type = 'submit';
        submitBtn.disabled = true;

        const selectZipFile = (candidate: File | null | undefined) => {
          const check = validateZipImportFile(candidate);
          if (!check.ok || !candidate) {
            selectedFile = null;
            submitBtn.disabled = true;
            dropTitle.textContent = 'فایل زیپ را اینجا رها کنید یا برای انتخاب کلیک کنید';
            dropHint.textContent = 'فقط فایل‌های ‎.zip (حداکثر ۵۰ مگابایت)';
            feedback.textContent = check.error || 'فایل نامعتبر است.';
            feedback.dataset.error = 'true';
            return;
          }
          selectedFile = candidate;
          submitBtn.disabled = false;
          feedback.textContent = '';
          feedback.dataset.error = 'false';
          dropTitle.textContent = candidate.name;
          dropHint.textContent = `اندازه: ${formatFileSize(candidate.size)} — آماده برای بارگذاری`;
        };

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
          }
        });
        dropzone.addEventListener('dragover', (event) => {
          event.preventDefault();
          dropzone.dataset.dragover = 'true';
        });
        dropzone.addEventListener('dragleave', () => {
          delete dropzone.dataset.dragover;
        });
        dropzone.addEventListener('drop', (event) => {
          event.preventDefault();
          delete dropzone.dataset.dragover;
          selectZipFile(event.dataTransfer?.files?.[0]);
        });
        fileInput.addEventListener('change', () => {
          selectZipFile(fileInput.files?.[0]);
        });

        formZip.append(dropzone, titleField, submitBtn);

        formZip.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!selectedFile) return;
          const file = selectedFile;
          submitBtn.disabled = true;
          feedback.textContent = 'در حال خواندن و استخراج فایل زیپ…';
          feedback.dataset.error = 'false';

          const reader = new FileReader();
          reader.onload = () => {
            void (async () => {
              try {
                const base64Data = String(reader.result || '').split(',')[1] || '';
                const res = await api(
                  '/library/import/zip',
                  {
                    filename: file.name,
                    content_base64: base64Data,
                    title: titleInput.value.trim() || undefined,
                    parent_id: parent,
                  },
                  'POST',
                );
                const total = res.stats?.total ?? 0;
                dialog.close();
                showToast(`فایل زیپ با موفقیت استخراج شد (${total} یادداشت).`, {
                  variant: 'success',
                });
                await load();
                document.dispatchEvent(new Event('garden:library'));
              } catch (error) {
                submitBtn.disabled = false;
                feedback.textContent = message(error);
                feedback.dataset.error = 'true';
              }
            })();
          };
          reader.onerror = () => {
            submitBtn.disabled = false;
            feedback.textContent = 'خواندن فایل زیپ با خطا مواجه شد.';
            feedback.dataset.error = 'true';
          };
          reader.readAsDataURL(file);
        });

        panel.append(formZip);
      }
    };

    gitTabBtn.addEventListener('click', () => {
      currentTab = 'git';
      feedback.textContent = '';
      renderTab();
    });
    zipTabBtn.addEventListener('click', () => {
      currentTab = 'zip';
      feedback.textContent = '';
      renderTab();
    });

    renderTab();
    dialog.showModal();
  };

  const syncViewTabs = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-library-view]').forEach((tab) => {
      const active = tab.dataset.libraryView === view;
      tab.setAttribute('aria-pressed', String(active));
      tab.classList.toggle('is-active', active);
    });
  };

  const renderBreadcrumb = () => {
    pathHost.replaceChildren(
      actionBtn(
        'ریشهٔ کتابخانه',
        'folder',
        async () => {
          parent = null;
          path.length = 0;
          publicPath = [];
          view = 'items';
          await load();
        },
        'library-crumb-btn',
      ),
    );

    for (const [index, crumb] of path.entries()) {
      pathHost.append(svgIcon('chevron', 13));
      pathHost.append(
        actionBtn(
          crumb.title,
          null,
          async () => {
            parent = crumb.id;
            path.splice(index + 1);
            await load();
          },
          'library-crumb-btn',
        ),
      );
    }

    for (const [index, node] of publicPath.entries()) {
      pathHost.append(svgIcon('chevron', 13));
      pathHost.append(
        actionBtn(
          node.label,
          null,
          async () => {
            publicPath.splice(index + 1);
            await load();
          },
          'library-crumb-btn',
        ),
      );
    }
  };

  const renderEmptyCard = (hasQuery: boolean) => {
    const copy = libraryEmptyCopy(view, {
      authenticated: Boolean(currentUser),
      hasQuery,
      inFolder: Boolean(parent || publicPath.length),
    });

    emptyEl.replaceChildren();
    const title = el('h2', copy.title);
    const desc = el('p', copy.description);
    emptyEl.append(title, desc);

    if (copy.ctaHref && copy.ctaLabel) {
      const link = el('a', copy.ctaLabel, 'garden-button-primary');
      link.href = copy.ctaHref;
      emptyEl.append(link);
    } else if (copy.action === 'clear-filter' && copy.ctaLabel) {
      emptyEl.append(
        actionBtn(
          copy.ctaLabel,
          'close',
          () => {
            if (filterInput) filterInput.value = '';
            renderFilteredRows();
          },
          'garden-button-secondary',
        ),
      );
    } else if (copy.action === 'focus-create' && copy.ctaLabel && currentUser) {
      emptyEl.append(
        actionBtn(
          copy.ctaLabel,
          'pencil',
          () => {
            form.querySelector<HTMLInputElement>('[name="title"]')?.focus();
          },
          'garden-button-primary',
        ),
      );
    }

    emptyEl.hidden = false;
  };

  const buildRowElement = (row: BrowserRow): HTMLLIElement => {
    const li = document.createElement('li');
    li.dataset.label = row.title;
    li.dataset.kind = row.kind;
    li.dataset.source = row.source;

    const mainCol = el('div', undefined, 'library-row-main');
    const icon = svgIcon(row.kind === 'folder' ? 'folder' : 'file', 16);

    if (row.kind === 'folder' && row.source !== 'community') {
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'library-row-title-btn';
      openBtn.append(icon, el('span', row.title));
      openBtn.addEventListener('click', () =>
        void run(async () => {
          if (row.source === 'public' && row.publicNode) {
            publicPath.push(row.publicNode);
          } else {
            parent = row.id;
            path.push({ id: row.id, title: row.title });
          }
          view = 'items';
          await load();
        }),
      );
      mainCol.append(openBtn);
    } else {
      const href = row.href || personalNoteHref(row.raw || row);
      const link = el('a', undefined, 'library-row-title-link');
      link.href = href;
      link.append(icon, el('span', row.title));
      mainCol.append(link);
    }

    const metaRow = el('div', undefined, 'library-row-meta');
    if (row.source === 'public') {
      metaRow.append(el('span', 'منبع رسمی', 'library-badge library-badge-official'));
    } else if (row.source === 'community') {
      metaRow.append(el('span', 'عمومی', 'library-badge library-badge-success'));
      if (row.verified) {
        metaRow.append(el('span', 'تأییدشده', 'library-badge library-badge-official'));
      }
    } else {
      const vis = describeVisibility(row.visibility);
      const visBadge = el('span', vis.label, `library-badge library-badge-${vis.tone}`);
      metaRow.append(visBadge);
      if (row.has_git) {
        const gitBadge = el('span', undefined, 'library-badge library-badge-git');
        gitBadge.append(svgIcon('git', 11), el('span', 'متصل به گیت'));
        metaRow.append(gitBadge);
      }
      if (row.updated) {
        metaRow.append(el('span', 'به‌روزشده', 'library-badge library-badge-updated'));
      }
    }
    mainCol.append(metaRow);
    li.append(mainCol);

    if (row.source === 'personal' && row.raw) {
      const actionsCol = el('div', undefined, 'library-row-actions');
      const item = row.raw;

      if (view === 'trash') {
        actionsCol.append(
          actionBtn('بازیابی', 'restore', async () => {
            await api(`/library/items/${item.id}/restore`, {});
            showToast(`«${item.title}» بازیابی شد.`, { variant: 'success' });
            await load();
            document.dispatchEvent(new Event('garden:library'));
          }),
          actionBtn(
            'حذف دائمی',
            'trash',
            () => openPermanentDeleteDialog(item),
            'library-row-btn is-danger',
          ),
        );
      } else if (item.kind === 'folder') {
        if (item.has_git) {
          const syncBtn = actionBtn('بروزرسانی گیت', 'refresh', async () => {
            syncBtn.disabled = true;
            syncBtn.classList.add('is-spinning');
            try {
              const res = await api(`/library/items/${item.id}/git-sync`, {}, 'POST');
              showToast(res.message || 'مخزن گیت همگام‌سازی شد.', { variant: 'success' });
              await load();
              document.dispatchEvent(new Event('garden:library'));
            } finally {
              syncBtn.disabled = false;
              syncBtn.classList.remove('is-spinning');
            }
          });
          actionsCol.append(syncBtn);
        }

        actionsCol.append(
          actionBtn('اشتراک', 'share', () => openShareDialog(item)),
          actionBtn('تغییر نام', 'pencil', () => openRenameDialog(item)),
          actionBtn('انتقال', 'move', () => openMoveDialog(item)),
          actionBtn(
            'زباله‌دان',
            'trash',
            () => openTrashConfirmDialog(item),
            'library-row-btn is-danger',
          ),
        );
      } else if (view === 'items') {
        const editLink = el('a', undefined, 'library-row-btn');
        editLink.href = `${personalNoteHref(item)}?edit=1`;
        editLink.append(svgIcon('pencil', 14), el('span', 'ویرایش'));
        actionsCol.append(
          editLink,
          actionBtn('اشتراک', 'share', () => openShareDialog(item)),
          actionBtn('تغییر نام', 'pencil', () => openRenameDialog(item)),
          actionBtn('انتقال', 'move', () => openMoveDialog(item)),
          actionBtn(
            'زباله‌دان',
            'trash',
            () => openTrashConfirmDialog(item),
            'library-row-btn is-danger',
          ),
        );
      }

      if (actionsCol.children.length > 0) {
        li.append(actionsCol);
      }
    }

    return li;
  };

  const renderFilteredRows = () => {
    const query = filterInput?.value ?? '';
    const hasQuery = Boolean(query.trim());
    if (filterClear) filterClear.hidden = !hasQuery;

    const { rows } = filterAndSortLibraryRows(loadedRows, query);
    listEl.replaceChildren(...rows.map(buildRowElement));

    if (rows.length === 0) {
      renderEmptyCard(hasQuery);
    } else {
      emptyEl.hidden = true;
    }
  };

  const syncAuthChrome = () => {
    const loggedIn = Boolean(currentUser);
    if (guestBanner) guestBanner.hidden = loggedIn || view === 'public';
    const canCreate = loggedIn && view === 'items' && publicPath.length === 0;
    form.hidden = !canCreate;
    if (importBtn) {
      importBtn.hidden = view !== 'items' || publicPath.length > 0;
    }
    if (emptyTrashBtn) {
      emptyTrashBtn.hidden = !(loggedIn && view === 'trash' && loadedRows.length > 0);
    }
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (submitBtn) submitBtn.disabled = creating || !loggedIn;
  };

  const load = async (append = false) => {
    hasLoadedOnce = true;
    const version = ++generation;
    const epoch = identityEpoch;

    syncViewTabs();
    renderBreadcrumb();
    syncAuthChrome();

    if (!append) {
      offset = 0;
      loadedRows = [];
      listEl.replaceChildren();
      emptyEl.hidden = true;
    }

    const nextRows: BrowserRow[] = [];

    if (!append && view === 'items' && !parent) {
      try {
        const rawPublicNodes = publicPath.length
          ? (publicPath[publicPath.length - 1].items ?? [])
          : await publicTreePromise;
        const resolvedNodes = currentUser
          ? await personalNodes(rawPublicNodes, api)
          : rawPublicNodes;
        if (version !== generation || epoch !== identityEpoch) return;

        for (const node of resolvedNodes) {
          nextRows.push({
            id: `public:${node.link || node.label}`,
            title: node.label,
            kind: node.link ? 'note' : 'folder',
            source: 'public',
            href: node.link,
            publicNode: node,
          });
        }
      } catch (error) {
        if (version !== generation || epoch !== identityEpoch) return;
        statusEl.textContent = message(error);
        statusEl.dataset.error = 'true';
      }
    }

    let fetchedCount = 0;
    if (view === 'public') {
      try {
        const rows = await api<any[]>(`/library/public?offset=${offset}&limit=100`);
        if (version !== generation || epoch !== identityEpoch) return;
        fetchedCount = rows.length;
        for (const item of rows) {
          nextRows.push({
            id: item.id,
            title: item.title,
            kind: item.kind === 'folder' ? 'folder' : 'note',
            source: 'community',
            href: `/published/${encodeURIComponent(item.id)}`,
            verified: Boolean(item.verified),
            raw: item,
          });
        }
      } catch (error) {
        if (version !== generation || epoch !== identityEpoch) return;
        statusEl.textContent = message(error);
        statusEl.dataset.error = 'true';
      }
    } else if (currentUser && !publicPath.length) {
      const endpoint =
        view === 'watching' || view === 'favorites'
          ? `/library/${view}`
          : `/library/items?${view === 'trash' ? 'trashed=true' : parent ? `parent_id=${parent}` : ''}`;

      try {
        const rows = await api<any[]>(
          `${endpoint}${endpoint.includes('?') ? '&' : '?'}offset=${offset}&limit=100`,
        );
        if (version !== generation || epoch !== identityEpoch) return;
        fetchedCount = rows.length;
        for (const item of rows) {
          nextRows.push({
            id: item.id,
            title: item.title,
            kind: item.kind === 'folder' ? 'folder' : 'note',
            source: 'personal',
            href: item.href,
            canonical_slug: item.canonical_slug,
            visibility: item.visibility,
            share_token: item.share_token,
            has_git: Boolean(item.has_git),
            git_repo_url: item.git_repo_url,
            updated: Boolean(item.updated),
            raw: item,
          });
        }
      } catch (error) {
        if (version !== generation || epoch !== identityEpoch) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          throw error;
        }
      }
    }

    offset += fetchedCount;
    moreBtn.hidden = fetchedCount < 100;
    loadedRows = append ? [...loadedRows, ...nextRows] : nextRows;
    renderFilteredRows();
    syncAuthChrome();
  };

  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('برای درون‌ریزی مستندات ابتدا وارد حساب کاربری شوید.', {
          variant: 'info',
          actionLabel: 'ورود به حساب',
          href: '/account',
        });
        return;
      }
      openImportDialog();
    });
  }

  emptyTrashBtn?.addEventListener('click', () => {
    if (!currentUser || !loadedRows.length) return;
    openEmptyTrashDialog();
  });

  root.querySelectorAll<HTMLElement>('[data-library-view]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () =>
      void run(async () => {
        view = tabBtn.dataset.libraryView || 'items';
        parent = null;
        path.length = 0;
        publicPath = [];
        if (filterInput) filterInput.value = '';
        await load();
      }),
    );
  });

  filterInput?.addEventListener('input', () => renderFilteredRows());
  filterClear?.addEventListener('click', () => {
    if (filterInput) {
      filterInput.value = '';
      filterInput.focus();
    }
    renderFilteredRows();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentUser) {
      showToast('برای ساخت یادداشت وارد حساب کاربری شوید.', {
        variant: 'info',
        actionLabel: 'ورود',
        href: '/account',
      });
      return;
    }
    if (creating) return;
    creating = true;
    syncAuthChrome();
    void run(async () => {
      const epoch = identityEpoch;
      try {
        const data = new FormData(form);
        const item = await api<any>('/library/items', {
          title: data.get('title'),
          kind: data.get('kind'),
          parent_id: parent,
        });
        if (epoch !== identityEpoch) return;
        form.reset();
        if (item.kind === 'note') {
          window.location.href = `/library/${item.id}?edit=1`;
        } else {
          showToast(`پوشهٔ «${item.title}» ساخته شد.`, { variant: 'success' });
          document.dispatchEvent(new Event('garden:library'));
        }
      } finally {
        if (epoch === identityEpoch) {
          creating = false;
          syncAuthChrome();
        }
      }
    });
  });

  moreBtn.addEventListener('click', () => void run(() => load(true)));
  document.addEventListener('garden:library', () => void run(() => load()));

  const resetBrowserForIdentity = (user: Account | null, nextId: string | null) => {
    currentUser = user;
    currentIdentity = nextId;
    creating = false;
    identityEpoch++;
    generation++;
    parent = null;
    path.length = 0;
    publicPath = [];
    view = 'items';
    form.reset();
    root.querySelectorAll('dialog').forEach((d) => d.close());
    statusEl.textContent = '';
  };

  const syncSessionAndReload = async (force = false) => {
    const user = await getSession(force);
    const nextId = user?.id ?? null;
    const changed = currentIdentity !== nextId;
    if (changed) {
      resetBrowserForIdentity(user, nextId);
    } else {
      currentUser = user;
    }
    if (!hasLoadedOnce || changed) {
      await load();
    }
  };

  document.addEventListener('garden:identity', (event) => {
    const detail = (event as CustomEvent<Account | null>).detail ?? null;
    const nextId = detail?.id ?? null;
    if (currentIdentity === nextId) return;
    resetBrowserForIdentity($identity.get() ?? detail, nextId);
    void run(() => load());
  });

  document.addEventListener('garden:account', () => {
    invalidateSessionCache();
    void run(() => syncSessionAndReload(true));
  });

  void run(() => syncSessionAndReload(false));
}
