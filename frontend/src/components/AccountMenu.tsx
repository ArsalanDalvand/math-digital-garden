import { DirectionProvider } from '@base-ui/react/direction-provider';
import {
  ChevronDown,
  GitPullRequest,
  LogOut,
  NotebookPen,
  Settings,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Account, applyPreferences, type Preferences } from '../scripts/account-preferences';
import { ApiError, api } from '../scripts/api';
import { $identity, setAppIdentity, syncThemeFromDom } from '../stores/garden';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
export default function AccountMenu() {
  const [user, setUser] = useState<Account | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      generation = 0,
      current: Account | null = null;
    let pending: Preferences | undefined,
      saving = false;
    const load = async () => {
      const request = ++generation;
      current = null;
      pending = undefined;
      try {
        const sessionRes = await api<Account | { authenticated: boolean; account: Account | null }>(
          '/auth/session',
        );
        const value =
          sessionRes && typeof sessionRes === 'object' && 'authenticated' in sessionRes
            ? sessionRes.authenticated
              ? sessionRes.account
              : null
            : sessionRes;
        if (!active || request !== generation) return;
        if (!value) {
          setUser(null);
          setError('');
          setAppIdentity(null);
          return;
        }
        current = value;
        setUser({
          ...value,
          avatar_url: value.avatar_url ? value.avatar_url + '?v=' + Date.now() : null,
        });
        applyPreferences(value.preferences);
        syncThemeFromDom();
        setAppIdentity(value);
        setError('');
      } catch (error) {
        if (!active || request !== generation) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setError('');
          setAppIdentity(null);
        } else setError('دریافت حساب ممکن نشد.');
      }
    };
    const savePreferences = async (changes: Partial<Preferences>) => {
      if (!current) return;
      pending = { ...(pending || current.preferences), ...changes };
      current = { ...current, preferences: pending };
      document.dispatchEvent(
        new CustomEvent('garden:preference-save', { detail: { state: 'saving' } }),
      );
      if (saving) return;
      saving = true;
      try {
        while (active && pending && current) {
          const preferences: Preferences = pending;
          const identity: string = current.id;
          const request: number = generation;
          pending = undefined;
          try {
            const result = await api<Account>(
              '/account/preferences',
              { ...preferences, expected_user_id: identity },
              'PATCH',
            );
            if (!active || request !== generation || current?.id !== identity) continue;
            if (result.id !== identity) {
              void load();
              continue;
            }
            if (!pending) {
              current = result;
              setUser((previous) =>
                previous?.id === result.id
                  ? { ...previous, preferences: result.preferences }
                  : previous,
              );
              applyPreferences(result.preferences);
              syncThemeFromDom();
              $identity.set(result);
              setError('');
              document.dispatchEvent(
                new CustomEvent('garden:preference-save', { detail: { state: 'saved' } }),
              );
            }
          } catch {
            if (active && request === generation && current?.id === identity && !pending) {
              setError('ذخیره ترجیحات انجام نشد؛ دوباره تنظیمات را تغییر دهید.');
              document.dispatchEvent(
                new CustomEvent('garden:preference-save', { detail: { state: 'error' } }),
              );
            }
          }
        }
      } finally {
        saving = false;
      }
    };
    const reading = (event: Event) =>
      void savePreferences(
        (event as CustomEvent<Pick<Preferences, 'size' | 'leading' | 'width' | 'focus'>>).detail,
      );
    const theme = (event: Event) =>
      void savePreferences((event as CustomEvent<Pick<Preferences, 'theme'>>).detail);
    const preferencesUpdated = (event: Event) => {
      if (current && !pending && !saving)
        current = { ...current, preferences: (event as CustomEvent<Preferences>).detail };
    };
    const update = () => void load();
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        ++generation;
        current = null;
        pending = undefined;
      } else update();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) update();
    };
    void load();
    document.addEventListener('garden:account', update);
    document.addEventListener('garden:reading-settings', reading);
    document.addEventListener('garden:theme-setting', theme);
    document.addEventListener('garden:preferences', preferencesUpdated);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', restored);
    return () => {
      active = false;
      ++generation;
      pending = undefined;
      document.removeEventListener('garden:account', update);
      document.removeEventListener('garden:reading-settings', reading);
      document.removeEventListener('garden:theme-setting', theme);
      document.removeEventListener('garden:preferences', preferencesUpdated);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', restored);
    };
  }, []);
  const name = user?.full_name || user?.email || 'حساب کاربری';
  const initial = Array.from(name)[0] || '؟';
  const avatar = user?.avatar_url ? (
    <img src={user.avatar_url} alt="" className="account-avatar" width={28} height={28} />
  ) : (
    <span className="account-avatar" aria-hidden="true">
      {user ? initial : <UserRound size={16} />}
    </span>
  );
  async function logout() {
    try {
      await api('/auth/logout', undefined, 'POST');
      try {
        localStorage.removeItem('garden-theme');
        localStorage.removeItem('garden-reading');
        localStorage.removeItem('garden-default-mode');
        localStorage.removeItem('garden-fixed-toolbar');
      } catch {}
      setAppIdentity(null);
      location.assign('/account');
    } catch {
      setError('خروج انجام نشد؛ دوباره تلاش کنید.');
    }
  }
  if (!user) {
    return (
      <div className="inline-flex items-center gap-2">
        <a
          href="/account"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="ورود یا ثبت‌نام در حساب کاربری"
        >
          <UserRound size={15} />
          <span>ورود / ثبت‌نام</span>
        </a>
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }
  return (
    <DirectionProvider direction="rtl">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" aria-label={'منوی حساب: ' + name} />}>
          {avatar}
          <span className="max-w-32 truncate hidden sm:inline">{name}</span>
          <ChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {user ? (
            <>
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="size-8 rounded-full object-cover shrink-0 ring-1 ring-border"
                  />
                ) : (
                  <span className="size-8 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {initial}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-semibold text-foreground">
                    {name}
                  </strong>
                  <span
                    className="block truncate text-[11px] text-muted-foreground font-mono tracking-tight"
                    dir="ltr"
                  >
                    {user.email}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator className="my-1 bg-border" />
              <DropdownMenuItem
                onClick={() => location.assign('/settings/account/profile')}
                className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer"
              >
                <UserRound size={15} className="opacity-70" />
                پروفایل من
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => location.assign('/settings/account/preferences')}
                className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer"
              >
                <Settings size={15} className="opacity-70" />
                ترجیحات من
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => location.assign('/library')}
                className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer"
              >
                <NotebookPen size={15} className="opacity-70" />
                کتابخانه
              </DropdownMenuItem>
              {['author', 'admin'].includes(user.role) && (
                <DropdownMenuItem
                  onClick={() => location.assign('/review')}
                  className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer"
                >
                  <GitPullRequest size={15} className="opacity-70" />
                  بازبینی پیشنهادها
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="my-1 bg-border" />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void logout()}
                className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut size={15} className="scale-x-[-1] opacity-80" />
                خروج از حساب
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={() => location.assign('/account')}
              className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer"
            >
              <UserRound size={15} className="opacity-70" />
              ورود / ثبت‌نام
            </DropdownMenuItem>
          )}
          {error && (
            <p role="alert" className="px-3 py-2 text-sm">
              {error}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </DirectionProvider>
  );
}
