import { atom, map } from 'nanostores';
import { DEFAULT_GRAPH_CONFIG, type LayoutMode, type RelationPlaneKey } from '../lib/graph/types.ts';
import type { Account } from '../scripts/account-preferences.ts';

export type ThemeMode = 'light' | 'dark';

export interface ActiveNoteRef {
  slug: string;
  title: string;
}

export interface GraphUiState {
  depth: number;
  layoutMode: LayoutMode;
  typedOnly: boolean;
  renderArrows: boolean;
  renderLabels: boolean;
  repelForce: number;
  colliderPadding: number;
  linkDistance: number;
  centerForce: number;
  activeKindFilter: string | null;
  activePlaneFilter: RelationPlaneKey | null;
  searchQuery: string;
  isFullscreen: boolean;
  settingsOpen: boolean;
  nodeCount: number;
  linkCount: number;
  typedLinkCount: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage: string;
}

export const DEFAULT_GRAPH_UI_STATE: GraphUiState = {
  depth: DEFAULT_GRAPH_CONFIG.depth,
  layoutMode: DEFAULT_GRAPH_CONFIG.layoutMode,
  typedOnly: DEFAULT_GRAPH_CONFIG.typedOnly,
  renderArrows: DEFAULT_GRAPH_CONFIG.renderArrows,
  renderLabels: DEFAULT_GRAPH_CONFIG.renderLabels,
  repelForce: DEFAULT_GRAPH_CONFIG.repelForce,
  colliderPadding: DEFAULT_GRAPH_CONFIG.colliderPadding,
  linkDistance: DEFAULT_GRAPH_CONFIG.linkDistance,
  centerForce: DEFAULT_GRAPH_CONFIG.centerForce,
  activeKindFilter: null,
  activePlaneFilter: null,
  searchQuery: '',
  isFullscreen: false,
  settingsOpen: false,
  nodeCount: 0,
  linkCount: 0,
  typedLinkCount: 0,
  status: 'idle',
  errorMessage: '',
};

export const $theme = atom<ThemeMode>('light');
export const $identity = atom<Account | null>(null);
export const $activeNote = atom<ActiveNoteRef | null>(null);
export const $graphUi = map<GraphUiState>({ ...DEFAULT_GRAPH_UI_STATE });

export function resetGraphSettings(): void {
  $graphUi.set({
    ...$graphUi.get(),
    depth: DEFAULT_GRAPH_CONFIG.depth,
    layoutMode: DEFAULT_GRAPH_CONFIG.layoutMode,
    typedOnly: DEFAULT_GRAPH_CONFIG.typedOnly,
    renderArrows: DEFAULT_GRAPH_CONFIG.renderArrows,
    renderLabels: DEFAULT_GRAPH_CONFIG.renderLabels,
    repelForce: DEFAULT_GRAPH_CONFIG.repelForce,
    colliderPadding: DEFAULT_GRAPH_CONFIG.colliderPadding,
    linkDistance: DEFAULT_GRAPH_CONFIG.linkDistance,
    centerForce: DEFAULT_GRAPH_CONFIG.centerForce,
    activeKindFilter: null,
    activePlaneFilter: null,
    searchQuery: '',
  });
}

export function syncThemeFromDom(): ThemeMode {
  if (typeof document === 'undefined') {
    return $theme.get();
  }
  const root = document.documentElement;
  const next: ThemeMode =
    root.dataset.theme === 'dark' || root.classList.contains('dark') ? 'dark' : 'light';
  if ($theme.get() !== next) {
    $theme.set(next);
  }
  return next;
}

export function setAppTheme(theme: ThemeMode, options?: { notify?: boolean }): void {
  if (typeof document === 'undefined') {
    $theme.set(theme);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('garden-theme', theme);
  } catch {}
  $theme.set(theme);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  } else {
    root.classList.remove('theme-switching');
  }
  if (options?.notify !== false) {
    document.dispatchEvent(new CustomEvent('garden:theme-setting', { detail: { theme } }));
  }
}

export function setAppIdentity(user: Account | null): void {
  $identity.set(user);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent('garden:identity', {
        detail: user ? { id: user.id, role: user.role } : null,
      }),
    );
  }
}

declare global {
  interface Window {
    __gardenThemeObserverAttached?: boolean;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  syncThemeFromDom();
  if (!window.__gardenThemeObserverAttached && typeof MutationObserver === 'function') {
    window.__gardenThemeObserverAttached = true;
    const observer = new MutationObserver(() => {
      syncThemeFromDom();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
}
