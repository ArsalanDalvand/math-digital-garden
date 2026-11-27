import { buildPresentationSlides } from './presentation-slides.mjs';

const trigger = document.querySelector<HTMLButtonElement>('[data-presentation-open]');
const dialog = document.querySelector<HTMLDialogElement>('[data-presentation]');
const source = document.querySelector<HTMLElement>(
  'article.note:not([data-live-preview]):not([data-presentation-stage])',
);
const menu = document.querySelector('[data-note-more]');

if (trigger && dialog && source && menu) {
  menu.append(trigger);
  trigger.hidden = false;

  const stage = dialog.querySelector<HTMLElement>('[data-presentation-stage]')!;
  const status = dialog.querySelector<HTMLElement>('[data-presentation-status]')!;
  const count = dialog.querySelector<HTMLElement>('[data-presentation-count]')!;
  const progressBar = dialog.querySelector<HTMLElement>('[data-presentation-progress]');
  const jumpSelect = dialog.querySelector<HTMLSelectElement>('[data-presentation-jump]');
  const previous = dialog.querySelector<HTMLButtonElement>('[data-presentation-prev]')!;
  const next = dialog.querySelector<HTMLButtonElement>('[data-presentation-next]')!;
  const fullscreen = dialog.querySelector<HTMLButtonElement>('[data-presentation-fullscreen]')!;
  const title =
    document.querySelector('.workspace-document > h1')?.textContent ||
    document.querySelector('.document-location')?.textContent ||
    document.title;

  let slides: Node[][] = [];
  let index = 0;
  let epoch = 0;
  let invalid = false;
  let controller: AbortController | undefined;
  let focus: HTMLElement | null = null;
  let identity: string | null | undefined;
  let touchStartX = 0;
  let touchStartY = 0;

  const slideLabel = (nodes: Node[], slideIdx: number): string => {
    const heading = nodes.find((n) => n.nodeType === 1 && /^H[1-6]$/.test((n as Element).tagName));
    const cleanText = heading?.textContent?.trim();
    const num = (slideIdx + 1).toLocaleString('fa-IR');
    return cleanText ? `${num}. ${cleanText.slice(0, 48)}` : `اسلاید ${num}`;
  };

  const populateJumpMenu = () => {
    if (!jumpSelect) return;
    jumpSelect.replaceChildren();
    slides.forEach((nodes, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = slideLabel(nodes, idx);
      jumpSelect.append(opt);
    });
    jumpSelect.hidden = slides.length <= 1;
  };

  const render = () => {
    stage.replaceChildren(...(slides[index] || []));
    stage.scrollTop = 0;
    count.textContent = slides.length
      ? `اسلاید ${(index + 1).toLocaleString('fa-IR')} از ${slides.length.toLocaleString('fa-IR')}`
      : '';
    if (progressBar) {
      const pct = slides.length > 0 ? ((index + 1) / slides.length) * 100 : 0;
      progressBar.style.width = `${pct.toFixed(1)}%`;
    }
    if (jumpSelect && slides.length > 0) {
      jumpSelect.value = String(index);
    }
    previous.disabled = index === 0;
    next.disabled = index >= slides.length - 1;
  };

  const clear = () => {
    epoch++;
    controller?.abort();
    slides = [];
    stage.replaceChildren();
    if (jumpSelect) jumpSelect.replaceChildren();
    if (progressBar) progressBar.style.width = '0%';
    count.textContent = '';
    status.textContent = '';
    previous.disabled = true;
    next.disabled = true;
    if (document.fullscreenElement === dialog) {
      void document.exitFullscreen().catch(() => {});
    }
  };

  const flush = () =>
    new Promise<{ content: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ذخیره کامل نشد؛ دوباره تلاش کنید.')), 15000);
      document.dispatchEvent(
        new CustomEvent('garden:flush-note', {
          detail: {
            resolve: (value: { content: string }) => {
              clearTimeout(timer);
              resolve(value);
            },
            reject: (error: unknown) => {
              clearTimeout(timer);
              reject(error);
            },
          },
        }),
      );
    });

  trigger.addEventListener('click', async () => {
    if (invalid || dialog.open) return;
    focus = document.activeElement as HTMLElement;
    clear();
    const started = epoch;
    dialog.showModal();
    status.textContent = 'در حال آماده‌سازی ارائه…';
    fullscreen.hidden = !document.fullscreenEnabled;
    render();
    try {
      const content = document.createElement('div');
      const workspace = document.querySelector<HTMLElement>('[data-workspace-note]');
      const privateScope =
        workspace?.dataset.libraryId ||
        workspace?.classList.contains('is-editing') ||
        source.dataset.aiScope === 'personal';
      if (workspace && privateScope) {
        const snapshot = await flush();
        if (started !== epoch) return;
        controller = new AbortController();
        const response = await fetch('/api/preview', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'X-Requested-With': 'MathGarden' },
          body: snapshot.content,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('آماده‌سازی ارائه انجام نشد؛ وضعیت ورود و ذخیره را بررسی کنید.');
        }
        const result = await response.json();
        if (typeof result.html !== 'string') throw new Error('پاسخ ارائه معتبر نیست.');
        content.innerHTML = result.html;
      } else {
        content.append(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
      }
      if (started !== epoch || invalid || !dialog.open) return;
      content.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
      const sloganText = document.querySelector('.note-slogan')?.textContent?.trim() || '';
      slides = buildPresentationSlides(Array.from(content.childNodes), title, sloganText);
      index = 0;
      status.textContent = '';
      populateJumpMenu();
      render();
      stage.focus();
    } catch (error) {
      if (started === epoch && !invalid) {
        status.textContent = error instanceof Error ? error.message : 'آماده‌سازی ارائه انجام نشد.';
      }
    }
  });

  const move = (position: number) => {
    if (!slides.length) return;
    index = Math.max(0, Math.min(slides.length - 1, position));
    render();
  };

  previous.addEventListener('click', () => move(index - 1));
  next.addEventListener('click', () => move(index + 1));
  jumpSelect?.addEventListener('change', () => move(Number(jumpSelect.value) || 0));

  dialog
    .querySelector('[data-presentation-close]')!
    .addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clear();
    if (!invalid) {
      (focus?.isConnected && focus.getClientRects().length
        ? focus
        : document.querySelector<HTMLElement>('[data-more-toggle]')
      )?.focus();
    }
  });

  const toggleFullscreen = () => {
    void (
      document.fullscreenElement === dialog ? document.exitFullscreen() : dialog.requestFullscreen()
    ).catch(() => {
      status.textContent = 'تمام‌صفحه در این مرورگر در دسترس نیست.';
    });
  };
  fullscreen.addEventListener('click', toggleFullscreen);

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.target as Element).closest(
        'input,textarea,select,[contenteditable],video,audio,iframe',
      )
    ) {
      return;
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.stopPropagation();
      toggleFullscreen();
      return;
    }
    const isRtl = document.documentElement.dir === 'rtl';
    const nextArrow = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const prevArrow = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const target = (
      {
        [nextArrow]: index + 1,
        [prevArrow]: index - 1,
        PageDown: index + 1,
        PageUp: index - 1,
        ' ': index + 1,
        Home: 0,
        End: slides.length - 1,
      } as Record<string, number>
    )[event.key];
    if (target !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      move(target);
    }
  });

  stage.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  stage.addEventListener(
    'touchend',
    (e) => {
      if (e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      const isRtl = document.documentElement.dir === 'rtl';
      if (isRtl) {
        if (dx > 50) move(index + 1);
        else move(index - 1);
      } else {
        if (dx < -50) move(index + 1);
        else move(index - 1);
      }
    },
    { passive: true },
  );

  document.addEventListener('garden:identity', (event) => {
    const nextId = (event as CustomEvent).detail?.id ?? null;
    if (identity === undefined) {
      identity = nextId;
      return;
    }
    if (identity === nextId) return;
    identity = nextId;
    invalid = true;
    trigger.disabled = true;
    clear();
    if (dialog.open) dialog.close();
  });

  document.addEventListener('astro:before-swap', () => {
    clear();
    if (dialog.open) dialog.close();
  });
}
