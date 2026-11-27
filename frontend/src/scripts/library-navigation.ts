import { ApiError, api, message } from './api';
import { personalNodes } from './library-utils.mjs';
import { getSession } from './session';

type PublicNode = { label: string; link?: string; items?: PublicNode[]; count?: number };
type Item = { id: string; title: string; kind: 'note' | 'folder'; canonical_slug?: string };
const root = document.querySelector<HTMLElement>('[data-library-navigation]');

function normalizeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if ((code >= 0x064b && code <= 0x065f) || code === 0x0670) return '';
  if (ch === 'ك') return 'ک';
  if (ch === 'ي') return 'ی';
  if (ch === 'آ' || ch === 'أ' || ch === 'إ') return 'ا';
  return ch.toLowerCase();
}

function normalizeText(str: string): string {
  let out = '';
  for (const ch of str) out += normalizeChar(ch);
  return out.trim();
}

function normalizePathname(value: string): string {
  const pathOnly = (value.split(/[?#]/)[0] || '').trim();
  if (!pathOnly) return '';
  return pathOnly.length > 1 && pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
}

function appendHighlightedLabel(container: HTMLElement, text: string, normalizedQuery: string) {
  if (!normalizedQuery) {
    container.textContent = text;
    return;
  }
  let normText = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const nc = normalizeChar(text[i]);
    if (!nc) continue;
    for (let k = 0; k < nc.length; k++) {
      normText += nc[k];
      map.push(i);
    }
  }
  const matchIdx = normText.indexOf(normalizedQuery);
  if (matchIdx === -1) {
    container.textContent = text;
    return;
  }
  const startOrig = map[matchIdx];
  const lastNormIdx = matchIdx + normalizedQuery.length - 1;
  const endOrig = (map[lastNormIdx] ?? text.length - 1) + 1;

  container.replaceChildren();
  if (startOrig > 0) container.append(document.createTextNode(text.slice(0, startOrig)));
  const mark = document.createElement('mark');
  mark.className = 'library-filter-mark';
  mark.textContent = text.slice(startOrig, endOrig);
  container.append(mark);
  if (endOrig < text.length) container.append(document.createTextNode(text.slice(endOrig)));
}

function decodeSlugFromHref(link?: string): string {
  if (!link || !link.startsWith('/notes/')) return '';
  try {
    return decodeURIComponent(link.slice('/notes/'.length).split('#')[0] || '');
  } catch {
    return link;
  }
}

function countTreeLeaves(nodes: PublicNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.items) total += countTreeLeaves(node.items);
    else if (node.link) total += 1;
  }
  return total;
}

function filterPublicTree(nodes: PublicNode[], normQuery: string): PublicNode[] {
  const result: PublicNode[] = [];
  for (const node of nodes) {
    if (node.items) {
      const folderMatches = normalizeText(node.label).includes(normQuery);
      if (folderMatches) {
        result.push({
          ...node,
          count: countTreeLeaves(node.items),
        });
      } else {
        const filteredChildren = filterPublicTree(node.items, normQuery);
        if (filteredChildren.length > 0) {
          result.push({
            label: node.label,
            items: filteredChildren,
            count: countTreeLeaves(filteredChildren),
          });
        }
      }
    } else if (node.link) {
      const labelMatches = normalizeText(node.label).includes(normQuery);
      const slugMatches = normalizeText(decodeSlugFromHref(node.link)).includes(normQuery);
      if (labelMatches || slugMatches) result.push(node);
    }
  }
  return result;
}

if (root) {
  const tree = root.querySelector<HTMLElement>('[data-library-tree]')!;
  const status = root.querySelector<HTMLElement>('[data-library-status]')!;
  const dialog = root.querySelector<HTMLDialogElement>('[data-library-create]')!;
  const form = dialog.querySelector<HTMLFormElement>('form')!;
  const title = form.elements.namedItem('title') as HTMLInputElement;
  const kind = form.elements.namedItem('kind') as HTMLSelectElement;
  const feedback = dialog.querySelector<HTMLElement>('[data-create-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const filterInput = root.querySelector<HTMLInputElement>('[data-library-filter]');
  const filterClear = root.querySelector<HTMLButtonElement>('[data-library-filter-clear]');
  const expandBtn = root.querySelector<HTMLButtonElement>('[data-library-expand]');
  const collapseBtn = root.querySelector<HTMLButtonElement>('[data-library-collapse]');
  const addBtn = root.querySelector<HTMLButtonElement>('[data-library-add]');
  if (addBtn) addBtn.hidden = true;

  const publicHost = document.createElement('div');
  publicHost.className = 'library-public-nodes';
  const ownedHost = document.createElement('div');
  ownedHost.className = 'library-owned-nodes';
  const emptyNotice = document.createElement('p');
  emptyNotice.className = 'library-empty-state';
  emptyNotice.textContent = 'یادداشتی با این عبارت پیدا نشد.';
  emptyNotice.hidden = true;
  tree.append(publicHost, ownedHost, emptyNotice);

  let generation = 0,
    identity: string | null | undefined,
    parent: string | null = null,
    busy = false,
    createVersion = 0;
  let trigger: HTMLElement | null = null;
  const expanded = new Set<string>();
  let cachedPublicNodes: PublicNode[] = [];
  let savedOpenPaths: Set<string> | null = null;
  let scrolledToActiveOnce = false;

  const icon = (type: string) =>
    root
      .querySelector<HTMLTemplateElement>('[data-tree-icon="' + type + '"]')!
      .content.cloneNode(true);

  const insert = (host: HTMLElement, node: HTMLElement, label: string) => {
    node.dataset.label = label;
    host.appendChild(node);
  };

  const openCreate = (from: HTMLElement, id: string | null = null, name = 'کتابخانه') => {
    trigger = from;
    parent = id;
    form.reset();
    feedback.textContent = '';
    submit.disabled = false;
    dialog.querySelector<HTMLElement>('[data-create-location]')!.textContent = 'در ' + name;
    dialog.showModal();
    title.focus();
  };

  addBtn?.addEventListener('click', (event) => openCreate(event.currentTarget as HTMLElement));
  dialog.querySelector('[data-create-cancel]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    createVersion++;
    busy = false;
    parent = null;
    form.reset();
    feedback.textContent = '';
    trigger?.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!title.value.trim()) {
      title.setCustomValidity('نام را وارد کنید.');
      title.reportValidity();
      return;
    }
    busy = true;
    submit.disabled = true;
    feedback.textContent = 'در حال ساخت…';
    const version = ++createVersion,
      epoch = generation;
    try {
      const item = await api<Item>('/library/items', {
        title: title.value.trim(),
        kind: kind.value,
        parent_id: parent,
      });
      if (version !== createVersion || epoch !== generation || !dialog.open) return;
      if (parent) expanded.add(parent);
      dialog.close();
      document.dispatchEvent(new Event('garden:library'));
      if (item.kind === 'note')
        location.assign('/library/' + encodeURIComponent(item.id) + '?edit=1');
      else addBtn?.focus();
    } catch (error) {
      if (version === createVersion && epoch === generation) feedback.textContent = message(error);
    } finally {
      if (version === createVersion) {
        busy = false;
        submit.disabled = false;
      }
    }
  });
  title.addEventListener('input', () => title.setCustomValidity(''));

  const currentPath = normalizePathname(location.pathname);

  const link = (label: string, href: string, highlightQuery = '') => {
    const a = document.createElement('a'),
      text = document.createElement('span');
    appendHighlightedLabel(text, label, highlightQuery);
    a.href = href;
    a.title = label;
    a.append(icon('note'), text);
    if (currentPath && normalizePathname(href) === currentPath) {
      a.setAttribute('aria-current', 'page');
      a.classList.add('is-active');
    }
    return a;
  };

  const folder = (label: string, count?: number, pathKey = label, highlightQuery = '') => {
    const details = document.createElement('details'),
      summary = document.createElement('summary'),
      text = document.createElement('span'),
      children = document.createElement('div');
    details.dataset.folderPath = pathKey;
    appendHighlightedLabel(text, label, highlightQuery);
    summary.append(icon('caret'), icon('folder'), text);
    if (typeof count === 'number' && count > 0) {
      const badge = document.createElement('span');
      badge.className = 'tree-badge';
      badge.textContent = count.toLocaleString('fa-IR');
      summary.append(badge);
    }
    children.className = 'folder-tree';
    details.append(summary, children);
    return { details, summary, children };
  };

  const subtreeHasActive = (items: PublicNode[]): boolean =>
    items.some(
      (n) =>
        (n.link && normalizePathname(n.link) === currentPath) || subtreeHasActive(n.items ?? []),
    );

  const renderPublicBranch = (
    host: HTMLElement,
    nodes: PublicNode[],
    options: {
      isRoot?: boolean;
      parentPath?: string;
      forceOpenAll?: boolean;
      restorePaths?: Set<string> | null;
      highlightQuery?: string;
    } = {},
  ) => {
    const {
      isRoot = false,
      parentPath = '',
      forceOpenAll = false,
      restorePaths = null,
      highlightQuery = '',
    } = options;
    const anyRootActive = isRoot && nodes.some((n) => subtreeHasActive(n.items ?? []));

    nodes.forEach((node, idx) => {
      if (node.link) {
        insert(host, link(node.label, node.link, highlightQuery), node.label);
        return;
      }
      const pathKey = parentPath ? `${parentPath}/${node.label}` : node.label;
      const { details, children } = folder(node.label, node.count, pathKey, highlightQuery);
      let loaded = false;
      const hasActive = subtreeHasActive(node.items ?? []);
      const defaultRootOpen = isRoot && !anyRootActive && idx === 0 && !restorePaths;
      const shouldOpen =
        forceOpenAll ||
        hasActive ||
        defaultRootOpen ||
        (restorePaths ? restorePaths.has(pathKey) : false);

      const loadChildren = () => {
        if (loaded) return;
        loaded = true;
        renderPublicBranch(children, node.items ?? [], {
          isRoot: false,
          parentPath: pathKey,
          forceOpenAll,
          restorePaths,
          highlightQuery,
        });
      };

      details.addEventListener('toggle', () => {
        if (details.open) loadChildren();
      });

      if (shouldOpen) {
        details.open = true;
        loadChildren();
      }
      insert(host, details, node.label);
    });
  };

  const scrollActiveIntoView = () => {
    if (scrolledToActiveOnce) return;
    requestAnimationFrame(() => {
      const current = tree.querySelector<HTMLElement>('a[aria-current="page"]');
      if (current) {
        scrolledToActiveOnce = true;
        current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  };

  const publicNodes = async (
    host: HTMLElement,
    nodes: PublicNode[],
    version: number,
    signedIn: boolean,
  ) => {
    const visible = signedIn
      ? await personalNodes(nodes, async (path, data) => {
          const rows = await api<any[]>(path, data);
          if (version !== generation) throw new Error('حساب تغییر کرد.');
          return rows;
        })
      : nodes;
    if (version !== generation || !host.isConnected) return;
    cachedPublicNodes = visible;
    host.replaceChildren();
    renderPublicBranch(host, visible, { isRoot: true });
    scrollActiveIntoView();
  };

  const populate = async (host: HTMLElement, id: string | null, version: number, offset = 0) => {
    const rows = await api<Item[]>(
      '/library/items?offset=' +
        offset +
        '&limit=50' +
        (id ? '&parent_id=' + encodeURIComponent(id) : ''),
    );
    if (version !== generation || !host.isConnected) return;
    for (const item of rows) {
      let element: HTMLElement;
      if (item.kind === 'note')
        element = link(
          item.title,
          item.canonical_slug
            ? '/notes/' + encodeURIComponent(item.canonical_slug)
            : '/library/' + encodeURIComponent(item.id),
        );
      else {
        const { details, summary, children } = folder(item.title);
        element = details;
        let loaded = false;
        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = '+';
        add.className = 'library-child-add';
        add.setAttribute('aria-label', 'ساختن در ' + item.title);
        add.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openCreate(add, item.id, item.title);
        });
        summary.append(add);
        details.addEventListener('toggle', () => {
          if (details.open) expanded.add(item.id);
          else expanded.delete(item.id);
          if (details.open && !loaded) {
            loaded = true;
            void populate(children, item.id, version).catch((error) => {
              loaded = false;
              if (version === generation) status.textContent = message(error);
            });
          }
        });
        details.open = expanded.has(item.id);
      }
      element.dataset.ownedLibraryNode = '';
      insert(host, element, item.title);
    }
    if (rows.length === 50) {
      const more = document.createElement('button');
      more.type = 'button';
      more.textContent = 'نمایش بیشتر';
      more.dataset.more = '';
      more.dataset.ownedLibraryNode = '';
      more.addEventListener('click', async () => {
        more.disabled = true;
        try {
          await populate(host, id, version, offset + 50);
          more.remove();
        } catch (error) {
          more.disabled = false;
          if (version === generation) status.textContent = message(error);
        }
      });
      host.append(more);
    }
  };

  function captureOpenPaths(): Set<string> {
    const paths = new Set<string>();
    publicHost.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((d) => {
      if (d.dataset.folderPath) paths.add(d.dataset.folderPath);
    });
    return paths;
  }

  function applyFilter() {
    const rawVal = filterInput?.value || '';
    const q = normalizeText(rawVal);
    if (filterClear) filterClear.hidden = rawVal.length === 0;

    if (!q) {
      emptyNotice.hidden = true;
      if (savedOpenPaths) {
        publicHost.replaceChildren();
        renderPublicBranch(publicHost, cachedPublicNodes, {
          isRoot: true,
          restorePaths: savedOpenPaths,
        });
        savedOpenPaths = null;
      }
      ownedHost.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => (a.style.display = ''));
      ownedHost.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
        d.style.display = '';
        const hasCurrent = d.querySelector('a[aria-current="page"]');
        if (!hasCurrent && !expanded.has(d.dataset.folderPath || '')) d.open = false;
      });
      return;
    }

    if (!savedOpenPaths) savedOpenPaths = captureOpenPaths();

    const filteredPublic = filterPublicTree(cachedPublicNodes, q);
    publicHost.replaceChildren();
    if (filteredPublic.length > 0) {
      renderPublicBranch(publicHost, filteredPublic, {
        isRoot: true,
        forceOpenAll: true,
        highlightQuery: q,
      });
    }

    const ownedDetails = ownedHost.querySelectorAll<HTMLDetailsElement>('details');
    ownedDetails.forEach((d) => {
      d.open = true;
      d.style.display = '';
    });
    let ownedMatchCount = 0;
    ownedHost.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      const textSpan = a.querySelector('span');
      const label = a.title || textSpan?.textContent || '';
      const match = normalizeText(label).includes(q);
      a.style.display = match ? 'flex' : 'none';
      if (textSpan) appendHighlightedLabel(textSpan, label, match ? q : '');
      if (match) ownedMatchCount++;
    });
    Array.from(ownedDetails)
      .reverse()
      .forEach((d) => {
        const hasVisibleLink = Array.from(d.querySelectorAll('a')).some(
          (a) => a.style.display !== 'none',
        );
        d.style.display = hasVisibleLink ? '' : 'none';
        if (hasVisibleLink) d.open = true;
      });

    emptyNotice.hidden = filteredPublic.length > 0 || ownedMatchCount > 0;
  }

  let filterTimer: ReturnType<typeof setTimeout> | undefined;
  filterInput?.addEventListener('input', () => {
    if (filterClear) filterClear.hidden = filterInput.value.length === 0;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilter, 120);
  });
  filterClear?.addEventListener('click', () => {
    if (!filterInput) return;
    filterInput.value = '';
    applyFilter();
    filterInput.focus();
  });

  expandBtn?.addEventListener('click', () => {
    savedOpenPaths = null;
    if (filterInput?.value.trim()) {
      publicHost.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => (d.open = true));
    } else if (cachedPublicNodes.length > 0) {
      publicHost.replaceChildren();
      renderPublicBranch(publicHost, cachedPublicNodes, { isRoot: true, forceOpenAll: true });
    }
    ownedHost.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
      d.open = true;
      d.dispatchEvent(new Event('toggle'));
    });
  });

  collapseBtn?.addEventListener('click', () => {
    savedOpenPaths = null;
    if (filterInput?.value) filterInput.value = '';
    if (filterClear) filterClear.hidden = true;
    emptyNotice.hidden = true;
    if (cachedPublicNodes.length > 0) {
      publicHost.replaceChildren();
      renderPublicBranch(publicHost, cachedPublicNodes, {
        isRoot: true,
        restorePaths: new Set<string>(),
      });
    }
    ownedHost.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
      if (!d.querySelector('a[aria-current="page"]')) d.open = false;
    });
  });

  const publicTree = api<PublicNode[]>('/library-tree');
  void publicTree.catch(() => {});
  const load = () => {
    const version = ++generation;
    savedOpenPaths = null;
    scrolledToActiveOnce = false;
    publicHost.replaceChildren();
    ownedHost.replaceChildren();
    emptyNotice.hidden = true;
    void getSession().then((user) => {
      if (version !== generation) return;
      const signedIn = !!user;
      if (addBtn) addBtn.hidden = !signedIn;
      void publicTree
        .then((nodes) => publicNodes(publicHost, nodes, version, signedIn))
        .catch((error) => {
          if (version === generation) status.textContent = message(error);
        });
      if (signedIn) {
        void populate(ownedHost, null, version).catch((error) => {
          if (version === generation && !(error instanceof ApiError && error.status === 401))
            status.textContent = message(error);
        });
      }
    });
  };
  load();
  document.addEventListener('garden:library', load);
  document.addEventListener('garden:account', () => {
    expanded.clear();
    dialog.close();
    load();
  });
  document.addEventListener('garden:identity', (event) => {
    const next = (event as CustomEvent).detail?.id ?? null;
    if (next === identity) return;
    identity = next;
    expanded.clear();
    dialog.close();
    status.textContent = '';
    load();
  });
}
