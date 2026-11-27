import { mergeReadingStorage } from '../lib/account-helpers.mjs';

export type Preferences = {
  theme: 'light' | 'dark' | 'system';
  size: number;
  leading: number;
  width: 620 | 760 | 960;
  focus: boolean;
  default_mode: 'read' | 'edit';
  fixed_toolbar: boolean;
};
export type Account = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'student' | 'author' | 'admin';
  avatar_url: string | null;
  preferences: Preferences;
};
export function applyPreferences(preferences: Preferences) {
  const { theme, default_mode, fixed_toolbar, ...reading } = preferences;
  let mergedReading = { ...reading, mathScale: 1 };
  try {
    mergedReading = mergeReadingStorage(localStorage.getItem('garden-reading'), reading);
    localStorage.setItem('garden-theme', theme);
    localStorage.setItem('garden-reading', JSON.stringify(mergedReading));
    localStorage.setItem('garden-default-mode', default_mode);
    localStorage.setItem('garden-fixed-toolbar', String(fixed_toolbar));
  } catch {}
  const root = document.documentElement;
  const resolvedTheme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.add('theme-switching');
  root.dataset.theme = resolvedTheme;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching')),
    );
  } else {
    root.classList.remove('theme-switching');
  }
  root.style.setProperty('--reading-size', reading.size + 'px');
  root.style.setProperty('--reading-leading', String(reading.leading));
  root.style.setProperty('--reading-width', reading.width + 'px');
  root.style.setProperty('--math-scale', mergedReading.mathScale.toFixed(2));
  root.dataset.readingFocus = String(reading.focus);
  root.dataset.fixedToolbar = String(fixed_toolbar);
  root.dataset.defaultMode = default_mode;
  document.dispatchEvent(new CustomEvent('garden:preferences', { detail: preferences }));
  document.dispatchEvent(new Event('garden:reading-focus-change'));
}
