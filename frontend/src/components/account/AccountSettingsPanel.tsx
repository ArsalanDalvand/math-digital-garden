import { useStore } from '@nanostores/react';
import {
  BookMarked,
  Eye,
  EyeOff,
  LayoutDashboard,
  Monitor,
  Moon,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Upload,
  UserRound,
  UserRoundCog,
} from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { evaluatePasswordPolicy, roleLabel } from '../../lib/account-helpers.mjs';
import {
  type Account,
  applyPreferences,
  type Preferences,
} from '../../scripts/account-preferences.ts';
import { ApiError, api } from '../../scripts/api.ts';
import { getSession } from '../../scripts/session.ts';
import { showToast } from '../../scripts/toast.ts';
import { $identity, setAppIdentity, syncThemeFromDom } from '../../stores/garden.ts';
import { Button } from '../ui/button.tsx';

interface AccountSettingsPanelProps {
  page: 'profile' | 'preferences';
}

interface StatusState {
  text: string;
  error: boolean;
}

const EMPTY_STATUS: StatusState = { text: '', error: false };

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  size: 19,
  leading: 2,
  width: 760,
  focus: false,
  default_mode: 'read',
  fixed_toolbar: true,
};

function readInitialMathScale(): number {
  if (typeof localStorage === 'undefined') return 1;
  try {
    const parsed = JSON.parse(localStorage.getItem('garden-reading') || '{}');
    if (parsed && typeof parsed.mathScale === 'number' && Number.isFinite(parsed.mathScale)) {
      return Math.max(0.85, Math.min(1.3, parsed.mathScale));
    }
  } catch {}
  return 1;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'ارتباط برقرار نشد؛ دوباره تلاش کنید.';
  }
  switch (error.status) {
    case 401:
      return 'نشست پایان یافته است؛ دوباره وارد شوید.';
    case 403:
      return 'رمز عبور فعلی درست نیست یا درخواست پذیرفته نشد.';
    case 409:
      return 'این ایمیل در دسترس نیست.';
    case 413:
      return 'تصویر باید حداکثر ۵۱۲ کیلوبایت باشد.';
    case 415:
    case 422:
      return 'اطلاعات پذیرفته نشد؛ قالب تصویر و فیلدهای فرم را بررسی کنید.';
    default:
      return 'ذخیره انجام نشد؛ دوباره تلاش کنید.';
  }
}

export default function AccountSettingsPanel({ page }: AccountSettingsPanelProps) {
  const storeIdentity = useStore($identity);

  const [loadingStatus, setLoadingStatus] = useState<StatusState>({
    text: 'در حال دریافت حساب…',
    error: false,
  });
  const [phase, setPhase] = useState<'loading' | 'unauthenticated' | 'ready' | 'invalidated'>(
    'loading',
  );

  const [role, setRole] = useState<'student' | 'author' | 'admin'>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFallback, setAvatarFallback] = useState('؟');
  const [avatarDragOver, setAvatarDragOver] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showEmailPass, setShowEmailPass] = useState(false);
  const [showCurPass, setShowCurPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [mathScale, setMathScale] = useState<number>(() => readInitialMathScale());

  const [avatarStatus, setAvatarStatus] = useState<StatusState>(EMPTY_STATUS);
  const [profileStatus, setProfileStatus] = useState<StatusState>(EMPTY_STATUS);
  const [emailStatus, setEmailStatus] = useState<StatusState>(EMPTY_STATUS);
  const [passwordStatus, setPasswordStatus] = useState<StatusState>(EMPTY_STATUS);
  const [prefsStatus, setPrefsStatus] = useState<StatusState>(EMPTY_STATUS);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busyForm, setBusyForm] = useState<string | null>(null);

  const ownerRef = useRef<string | undefined>(undefined);
  const sessionOwnerRef = useRef<string | null | undefined>(undefined);
  const invalidatedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);

  const invalidateIdentity = useCallback(() => {
    if (invalidatedRef.current) return;
    invalidatedRef.current = true;
    setPhase('invalidated');
    setFullName('');
    setEmail('');
    setEmailPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLoadingStatus({
      text: 'حساب تغییر کرده است؛ برای ادامه صفحه را دوباره باز کنید.',
      error: true,
    });
  }, []);

  const applyAccountSnapshot = useCallback(
    (user: Account) => {
      if (invalidatedRef.current) return false;
      if (
        (ownerRef.current && ownerRef.current !== user.id) ||
        (sessionOwnerRef.current !== undefined && sessionOwnerRef.current !== user.id)
      ) {
        invalidateIdentity();
        return false;
      }
      ownerRef.current = user.id;
      sessionOwnerRef.current = user.id;
      setRole(user.role);
      setFullName(user.full_name || '');
      setEmail(user.email);
      setAvatarUrl(user.avatar_url ? `${user.avatar_url}?v=${Date.now()}` : null);
      setAvatarFallback(Array.from(user.full_name || user.email)[0] || '؟');
      setPrefs(user.preferences);
      setMathScale(readInitialMathScale());
      return true;
    },
    [invalidateIdentity],
  );

  useEffect(() => {
    let active = true;

    const handleIdentityEvent = (event: Event) => {
      const next = (event as CustomEvent<{ id: string } | null>).detail?.id || null;
      sessionOwnerRef.current = next;
      if (ownerRef.current && next !== ownerRef.current) {
        invalidateIdentity();
      }
    };

    const handlePreferencesEvent = (event: Event) => {
      const detail = (event as CustomEvent<Preferences>).detail;
      if (detail && !invalidatedRef.current) {
        setPrefs(detail);
      }
    };

    document.addEventListener('garden:identity', handleIdentityEvent);
    document.addEventListener('garden:preferences', handlePreferencesEvent);

    getSession(true)
      .then((user) => {
        if (!active) return;
        if (!user) {
          setPhase('unauthenticated');
          setLoadingStatus({ text: '', error: false });
          return;
        }
        if (!applyAccountSnapshot(user)) return;
        applyPreferences(user.preferences);
        syncThemeFromDom();
        setAppIdentity(user);
        setPhase('ready');
      })
      .catch((error) => {
        if (!active) return;
        setPhase('loading');
        setLoadingStatus({ text: getErrorMessage(error), error: true });
      });

    return () => {
      active = false;
      document.removeEventListener('garden:identity', handleIdentityEvent);
      document.removeEventListener('garden:preferences', handlePreferencesEvent);
    };
  }, [applyAccountSnapshot, invalidateIdentity]);

  useEffect(() => {
    if (!ownerRef.current || invalidatedRef.current) return;
    if (storeIdentity && storeIdentity.id !== ownerRef.current) {
      invalidateIdentity();
    }
  }, [storeIdentity, invalidateIdentity]);

  useEffect(() => {
    if (!confirmInputRef.current) return;
    const mismatch = confirmPassword !== newPassword;
    confirmInputRef.current.setCustomValidity(
      mismatch ? 'تکرار رمز عبور با رمز جدید یکسان نیست.' : '',
    );
  }, [newPassword, confirmPassword]);

  async function uploadAvatarFile(selected: File | undefined) {
    if (invalidatedRef.current || avatarBusy) return;
    if (
      !selected ||
      selected.size > 524288 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)
    ) {
      setAvatarStatus({
        text: 'تصویر PNG، JPEG یا WebP تا ۵۱۲ کیلوبایت انتخاب کنید.',
        error: true,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setAvatarBusy(true);
    setAvatarStatus({ text: 'در حال ذخیره تصویر…', error: false });
    try {
      const response = await fetch('/api/account/avatar', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'MathGarden',
          'Content-Type': selected.type,
        },
        body: selected,
      });
      if (!response.ok) throw new ApiError(response.status, 'Avatar update failed');
      const updated = (await response.json()) as Account;
      if (!applyAccountSnapshot(updated)) return;
      document.dispatchEvent(new Event('garden:account'));
      setAvatarStatus({ text: 'تصویر ذخیره شد.', error: false });
      showToast('تصویر پروفایل ذخیره شد.', { variant: 'success' });
    } catch (error) {
      setAvatarStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    await uploadAvatarFile(event.target.files?.[0]);
  }

  function handleAvatarDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setAvatarDragOver(true);
  }

  function handleAvatarDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setAvatarDragOver(false);
    void uploadAvatarFile(event.dataTransfer?.files?.[0]);
  }

  async function handleAvatarRemove() {
    if (invalidatedRef.current || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarStatus({ text: 'در حال حذف تصویر…', error: false });
    try {
      const response = await fetch('/api/account/avatar', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'MathGarden' },
      });
      if (!response.ok) throw new ApiError(response.status, 'Avatar delete failed');
      const updated = (await response.json()) as Account;
      if (!applyAccountSnapshot(updated)) return;
      document.dispatchEvent(new Event('garden:account'));
      setAvatarStatus({ text: 'تصویر حذف شد.', error: false });
      showToast('تصویر پروفایل حذف شد.', { variant: 'info' });
    } catch (error) {
      setAvatarStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidatedRef.current || busyForm === 'profile') return;
    setBusyForm('profile');
    setProfileStatus({ text: 'در حال ذخیره…', error: false });
    try {
      const result = await api<Account>('/account/profile', { full_name: fullName }, 'PATCH');
      if (invalidatedRef.current) return;
      applyAccountSnapshot(result);
      document.dispatchEvent(new Event('garden:account'));
      setProfileStatus({ text: 'ذخیره شد.', error: false });
      showToast('نام نمایشی به‌روزرسانی شد.', { variant: 'success' });
    } catch (error) {
      setProfileStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidatedRef.current || busyForm === 'email') return;
    setBusyForm('email');
    setEmailStatus({ text: 'در حال ذخیره…', error: false });
    try {
      const result = await api<Account>(
        '/account/email',
        { email, current_password: emailPassword },
        'PATCH',
      );
      if (invalidatedRef.current) return;
      setEmailPassword('');
      applyAccountSnapshot(result);
      document.dispatchEvent(new Event('garden:account'));
      setEmailStatus({ text: 'ذخیره شد.', error: false });
      showToast('نشانی ایمیل تغییر کرد.', { variant: 'success' });
    } catch (error) {
      setEmailStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidatedRef.current || busyForm === 'password') return;
    if (confirmPassword !== newPassword) {
      confirmInputRef.current?.setCustomValidity('تکرار رمز عبور با رمز جدید یکسان نیست.');
      confirmInputRef.current?.reportValidity();
      return;
    }
    setBusyForm('password');
    setPasswordStatus({ text: 'در حال ذخیره…', error: false });
    try {
      await api<Account>(
        '/account/password',
        { current_password: currentPassword, password: newPassword },
        'PATCH',
      );
      if (invalidatedRef.current) return;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({ text: 'رمز عبور تغییر کرد.', error: false });
      showToast('رمز عبور تغییر کرد و نشست‌های دیگر خارج شدند.', { variant: 'success' });
    } catch (error) {
      setPasswordStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  function syncLocalMathScale(nextScale: number) {
    const clamped = Math.max(0.85, Math.min(1.3, nextScale));
    setMathScale(clamped);
    document.documentElement.style.setProperty('--math-scale', clamped.toFixed(2));
    try {
      const raw = JSON.parse(localStorage.getItem('garden-reading') || '{}');
      localStorage.setItem('garden-reading', JSON.stringify({ ...raw, mathScale: clamped }));
    } catch {}
  }

  function handleThemePick(nextTheme: Preferences['theme']) {
    setPrefs((prev) => ({ ...prev, theme: nextTheme }));
    const resolved =
      nextTheme === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : nextTheme;
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.dataset.theme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching')),
    );
  }

  async function savePreferencesPayload(nextPrefs: Preferences, successText: string) {
    setBusyForm('preferences');
    setPrefsStatus({ text: 'در حال ذخیره…', error: false });
    try {
      const result = await api<Account>(
        '/account/preferences',
        { expected_user_id: ownerRef.current, ...nextPrefs },
        'PATCH',
      );
      if (invalidatedRef.current) return;
      applyAccountSnapshot(result);
      applyPreferences(result.preferences);
      syncThemeFromDom();
      document.dispatchEvent(new Event('garden:account'));
      setPrefsStatus({ text: 'ذخیره شد.', error: false });
      showToast(successText, { variant: 'success' });
    } catch (error) {
      setPrefsStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  async function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidatedRef.current || busyForm === 'preferences') return;
    await savePreferencesPayload(prefs, 'ترجیحات حساب ذخیره شد.');
  }

  function resetPreferencesToDefault() {
    if (invalidatedRef.current || busyForm === 'preferences') return;
    setPrefs(DEFAULT_PREFERENCES);
    syncLocalMathScale(1);
    handleThemePick(DEFAULT_PREFERENCES.theme);
    void savePreferencesPayload(DEFAULT_PREFERENCES, 'ترجیحات به حالت پیش‌فرض بازنشانی شد.');
  }

  const showLoading = phase === 'loading' || phase === 'invalidated';
  const showLogin = phase === 'unauthenticated';
  const showContent = phase === 'ready';
  const reloadHref =
    typeof location !== 'undefined' ? location.pathname : '/settings/account/profile';
  const passwordInfo = evaluatePasswordPolicy(newPassword, confirmPassword);

  return (
    <div className="account-settings">
      <nav aria-label="تنظیمات حساب" className="account-settings-nav">
        <a href="/settings/account/profile" aria-current={page === 'profile' ? 'page' : undefined}>
          <UserRoundCog size={16} aria-hidden="true" />
          <span>پروفایل و امنیت</span>
        </a>
        <a
          href="/settings/account/preferences"
          aria-current={page === 'preferences' ? 'page' : undefined}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>ترجیحات مطالعه</span>
        </a>
        <a href="/account">
          <LayoutDashboard size={16} aria-hidden="true" />
          <span>نمای کلی حساب</span>
        </a>
        <a href="/library">
          <BookMarked size={16} aria-hidden="true" />
          <span>کتابخانه شخصی</span>
        </a>
      </nav>

      <div className="account-settings-main">
        <p
          role={loadingStatus.error ? 'alert' : 'status'}
          data-error={String(loadingStatus.error)}
          data-settings-loading=""
          hidden={!showLoading}
        >
          {loadingStatus.text}{' '}
          {phase === 'invalidated' && (
            <a href={reloadHref} className="text-primary underline underline-offset-4">
              بارگذاری دوباره
            </a>
          )}
        </p>

        <div data-settings-login="" className="library-guest-card" hidden={!showLogin}>
          <span className="library-guest-card-icon" aria-hidden="true">
            <UserRound size={24} />
          </span>
          <h2>نیاز به ورود به حساب</h2>
          <p>برای تغییر مشخصات پروفایل و ذخیره‌سازی ترجیحات مطالعه وارد حساب کاربری شوید.</p>
          <a href="/account" className="garden-button-primary">
            ورود یا ثبت‌نام
          </a>
        </div>

        <div data-settings-content="" hidden={!showContent}>
          <div className="account-identity-banner">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                width={44}
                height={44}
                className="account-avatar account-avatar-medium"
              />
            ) : (
              <span className="account-avatar account-avatar-medium" aria-hidden="true">
                {avatarFallback}
              </span>
            )}
            <div className="account-identity-copy">
              <div className="account-hub-name-row">
                <strong>{fullName || email}</strong>
                <span className="account-role-pill">{roleLabel(role)}</span>
              </div>
              <span className="account-hub-email" dir="ltr">
                {email}
              </span>
            </div>
          </div>

          {page === 'profile' ? (
            <>
              <section
                className={`account-section ${avatarDragOver ? 'is-dragover' : ''}`}
                aria-labelledby="avatar-heading"
                onDragOver={handleAvatarDragOver}
                onDragLeave={() => setAvatarDragOver(false)}
                onDrop={handleAvatarDrop}
              >
                <h2 id="avatar-heading">تصویر پروفایل</h2>
                <div className="garden-row avatar-upload-row">
                  <span
                    className="account-avatar account-avatar-large"
                    data-avatar-fallback=""
                    aria-hidden="true"
                    hidden={!!avatarUrl}
                  >
                    {avatarFallback}
                  </span>
                  <img
                    data-avatar-preview=""
                    className="account-avatar account-avatar-large"
                    alt="تصویر پروفایل فعلی"
                    width={64}
                    height={64}
                    src={avatarUrl || undefined}
                    hidden={!avatarUrl}
                  />
                  <div className="avatar-upload-controls">
                    <div className="avatar-upload-actions">
                      <label htmlFor="avatar-file">
                        <Upload size={14} aria-hidden="true" />
                        <span>انتخاب یا رها کردن تصویر</span>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-avatar-remove=""
                        hidden={!avatarUrl}
                        disabled={avatarBusy || !showContent}
                        onClick={handleAvatarRemove}
                      >
                        حذف تصویر
                      </Button>
                    </div>
                    <input
                      ref={fileInputRef}
                      id="avatar-file"
                      data-avatar-file=""
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-describedby="avatar-help"
                      disabled={avatarBusy || !showContent}
                      onChange={handleAvatarUpload}
                    />
                    <p id="avatar-help" className="garden-field-help">
                      PNG، JPEG یا WebP؛ حداکثر ۵۱۲ کیلوبایت و ۵۱۲ × ۵۱۲ پیکسل.
                    </p>
                  </div>
                </div>
                <p
                  data-avatar-status=""
                  role={avatarStatus.error ? 'alert' : 'status'}
                  data-error={String(avatarStatus.error)}
                >
                  {avatarStatus.text}
                </p>
              </section>

              <form
                data-settings-form="profile"
                className="account-section"
                aria-busy={busyForm === 'profile'}
                onSubmit={submitProfile}
              >
                <h2>نام نمایشی</h2>
                <div className="garden-field">
                  <label htmlFor="profile-name">نام</label>
                  <input
                    id="profile-name"
                    name="full_name"
                    autoComplete="name"
                    required
                    maxLength={255}
                    value={fullName}
                    disabled={!showContent}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="garden-row">
                  <Button
                    className="garden-button-primary"
                    type="submit"
                    disabled={busyForm === 'profile' || !showContent}
                  >
                    ذخیره نام
                  </Button>
                  <p
                    role={profileStatus.error ? 'alert' : 'status'}
                    data-error={String(profileStatus.error)}
                    data-form-status=""
                  >
                    {profileStatus.text}
                  </p>
                </div>
              </form>

              <form
                data-settings-form="email"
                className="account-section"
                aria-busy={busyForm === 'email'}
                onSubmit={submitEmail}
              >
                <h2>تغییر ایمیل</h2>
                <div className="garden-field">
                  <label htmlFor="profile-email">ایمیل</label>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    required
                    maxLength={255}
                    value={email}
                    disabled={!showContent}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="garden-field">
                  <label htmlFor="email-password">رمز عبور فعلی</label>
                  <div className="password-input-wrap">
                    <input
                      id="email-password"
                      name="current_password"
                      type={showEmailPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      dir="ltr"
                      required
                      maxLength={256}
                      value={emailPassword}
                      disabled={!showContent}
                      onChange={(e) => setEmailPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showEmailPass ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                      aria-pressed={showEmailPass}
                      onClick={() => setShowEmailPass((v) => !v)}
                    >
                      {showEmailPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="garden-row">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busyForm === 'email' || !showContent}
                  >
                    ذخیره ایمیل
                  </Button>
                  <p
                    role={emailStatus.error ? 'alert' : 'status'}
                    data-error={String(emailStatus.error)}
                    data-form-status=""
                  >
                    {emailStatus.text}
                  </p>
                </div>
              </form>

              <form
                data-settings-form="password"
                className="account-section"
                aria-busy={busyForm === 'password'}
                onSubmit={submitPassword}
              >
                <h2>تغییر رمز عبور</h2>
                <p className="garden-field-help">
                  پس از تغییر رمز، نشست‌های دیگر حساب به‌طور خودکار خارج می‌شوند.
                </p>
                <div className="garden-field">
                  <label htmlFor="current-password">رمز عبور فعلی</label>
                  <div className="password-input-wrap">
                    <input
                      id="current-password"
                      name="current_password"
                      type={showCurPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      dir="ltr"
                      required
                      maxLength={256}
                      value={currentPassword}
                      disabled={!showContent}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showCurPass ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                      aria-pressed={showCurPass}
                      onClick={() => setShowCurPass((v) => !v)}
                    >
                      {showCurPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="garden-field">
                  <label htmlFor="new-password">رمز عبور جدید</label>
                  <div className="password-input-wrap">
                    <input
                      id="new-password"
                      name="password"
                      type={showNewPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      dir="ltr"
                      required
                      minLength={12}
                      maxLength={256}
                      aria-describedby="password-help"
                      value={newPassword}
                      disabled={!showContent}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showNewPass ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                      aria-pressed={showNewPass}
                      onClick={() => setShowNewPass((v) => !v)}
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="password-meter">
                    <div className="password-meter-track">
                      <div className="password-meter-fill" data-level={passwordInfo.level} />
                    </div>
                    <span id="password-help" className="password-meter-text">
                      {passwordInfo.level === 'empty'
                        ? '۱۲ تا ۲۵۶ نویسه'
                        : passwordInfo.level === 'short'
                          ? `${passwordInfo.remaining} نویسهٔ دیگر (${passwordInfo.length}/۱۲)`
                          : passwordInfo.level === 'strong'
                            ? 'رمز عبور قوی'
                            : 'طول رمز عبور مناسب است'}
                    </span>
                  </div>
                </div>

                <div className="garden-field">
                  <label htmlFor="confirm-password">تکرار رمز عبور جدید</label>
                  <div className="password-input-wrap">
                    <input
                      ref={confirmInputRef}
                      id="confirm-password"
                      name="confirmation"
                      type={showConfirmPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      dir="ltr"
                      required
                      minLength={12}
                      maxLength={256}
                      value={confirmPassword}
                      disabled={!showContent}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showConfirmPass ? 'پنهان کردن تکرار رمز' : 'نمایش تکرار رمز'}
                      aria-pressed={showConfirmPass}
                      onClick={() => setShowConfirmPass((v) => !v)}
                    >
                      {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && !passwordInfo.matchesConfirmation && (
                    <p role="alert" className="garden-field-help text-destructive">
                      تکرار رمز عبور با رمز جدید یکسان نیست.
                    </p>
                  )}
                </div>

                <div className="garden-row">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busyForm === 'password' || !showContent}
                  >
                    ذخیره رمز عبور
                  </Button>
                  <p
                    role={passwordStatus.error ? 'alert' : 'status'}
                    data-error={String(passwordStatus.error)}
                    data-form-status=""
                  >
                    {passwordStatus.text}
                  </p>
                </div>
              </form>
            </>
          ) : (
            <form
              data-settings-form="preferences"
              className="account-section"
              aria-busy={busyForm === 'preferences'}
              onSubmit={submitPreferences}
            >
              <h2>ظاهر و مطالعه</h2>

              <div className="garden-field">
                <span className="prefs-field-heading" id="theme-group-label">
                  پوستهٔ محیط
                </span>
                <div
                  className="prefs-theme-group"
                  role="radiogroup"
                  aria-labelledby="theme-group-label"
                >
                  {(
                    [
                      { value: 'light', label: 'روشن', icon: <Sun size={15} /> },
                      { value: 'dark', label: 'تیره', icon: <Moon size={15} /> },
                      { value: 'system', label: 'همگام با دستگاه', icon: <Monitor size={15} /> },
                    ] as const
                  ).map((opt) => {
                    const selected = prefs.theme === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className="prefs-theme-option"
                        data-selected={String(selected)}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={opt.value}
                          checked={selected}
                          disabled={!showContent}
                          onChange={() => handleThemePick(opt.value)}
                        />
                        {opt.icon}
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="garden-field">
                <div className="prefs-slider-header">
                  <label htmlFor="preference-size">اندازه متن</label>
                  <output htmlFor="preference-size" data-size-output="">
                    {prefs.size.toLocaleString('fa-IR')} پیکسل
                  </output>
                </div>
                <input
                  id="preference-size"
                  name="size"
                  type="range"
                  min={16}
                  max={26}
                  value={prefs.size}
                  disabled={!showContent}
                  onChange={(e) => setPrefs((p) => ({ ...p, size: Number(e.target.value) }))}
                />
              </div>

              <div className="garden-field">
                <div className="prefs-slider-header">
                  <label htmlFor="preference-leading">فاصله خطوط</label>
                  <output htmlFor="preference-leading" data-leading-output="" dir="ltr">
                    {prefs.leading.toFixed(1)}
                  </output>
                </div>
                <input
                  id="preference-leading"
                  name="leading"
                  type="range"
                  min={1.5}
                  max={2.5}
                  step={0.1}
                  value={prefs.leading}
                  disabled={!showContent}
                  onChange={(e) => setPrefs((p) => ({ ...p, leading: Number(e.target.value) }))}
                />
              </div>

              <div className="garden-field">
                <div className="prefs-slider-header">
                  <label htmlFor="preference-math-scale">بزرگنمایی فرمول‌ها (در این مرورگر)</label>
                  <output htmlFor="preference-math-scale" data-math-scale-output="">
                    {Math.round(mathScale * 100).toLocaleString('fa-IR')}٪
                  </output>
                </div>
                <input
                  id="preference-math-scale"
                  type="range"
                  min={0.85}
                  max={1.3}
                  step={0.05}
                  value={mathScale}
                  disabled={!showContent}
                  onChange={(e) => syncLocalMathScale(Number(e.target.value))}
                />
              </div>

              <div
                className="prefs-live-preview"
                data-prefs-preview=""
                style={{ fontSize: `${prefs.size}px`, lineHeight: String(prefs.leading) }}
              >
                <span className="prefs-preview-caption">پیش‌نمایش زندهٔ تایپوگرافی</span>
                <p>
                  هر عملگر خطی روی فضای برداری متناهی‌بعد <span dir="ltr">V</span> دارای مقدار ویژه است؛
                  یعنی <span dir="ltr" className="prefs-preview-math" style={{ fontSize: `${mathScale}em` }}>det(T − λI) = 0</span> برای دست‌کم یک <span dir="ltr">λ</span>.
                </p>
              </div>

              <div className="garden-field">
                <label htmlFor="preference-width">عرض صفحه</label>
                <select
                  id="preference-width"
                  name="width"
                  value={String(prefs.width)}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      width: Number(e.target.value) as Preferences['width'],
                    }))
                  }
                >
                  <option value="620">باریک (۶۲۰ پیکسل)</option>
                  <option value="760">معمولی (۷۶۰ پیکسل)</option>
                  <option value="960">عریض (۹۶۰ پیکسل)</option>
                </select>
              </div>

              <label className="account-checkbox">
                <input
                  name="focus"
                  type="checkbox"
                  checked={prefs.focus}
                  disabled={!showContent}
                  onChange={(e) => setPrefs((p) => ({ ...p, focus: e.target.checked }))}
                />
                مطالعه بدون سایدبار (حالت تمرکز)
              </label>

              <div className="garden-field">
                <label htmlFor="preference-mode">حالت پیش‌فرض جزوه شخصی</label>
                <select
                  id="preference-mode"
                  name="default_mode"
                  value={prefs.default_mode}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      default_mode: e.target.value as Preferences['default_mode'],
                    }))
                  }
                >
                  <option value="read">مطالعه</option>
                  <option value="edit">ویرایش</option>
                </select>
              </div>

              <label className="account-checkbox">
                <input
                  name="fixed_toolbar"
                  type="checkbox"
                  checked={prefs.fixed_toolbar}
                  disabled={!showContent}
                  onChange={(e) => setPrefs((p) => ({ ...p, fixed_toolbar: e.target.checked }))}
                />
                ثابت ماندن نوار ابزار هنگام ویرایش
              </label>

              <div className="garden-row prefs-actions-row">
                <Button
                  className="garden-button-primary"
                  type="submit"
                  disabled={busyForm === 'preferences' || !showContent}
                >
                  ذخیره ترجیحات
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyForm === 'preferences' || !showContent}
                  onClick={resetPreferencesToDefault}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>بازنشانی به پیش‌فرض</span>
                </Button>
                <p
                  role={prefsStatus.error ? 'alert' : 'status'}
                  data-error={String(prefsStatus.error)}
                  data-form-status=""
                >
                  {prefsStatus.text}
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
