import { useStore } from '@nanostores/react';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  type Account,
  applyPreferences,
  type Preferences,
} from '../../scripts/account-preferences.ts';
import { ApiError, api } from '../../scripts/api.ts';
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

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFallback, setAvatarFallback] = useState('؟');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

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
      setFullName(user.full_name || '');
      setEmail(user.email);
      setAvatarUrl(user.avatar_url ? `${user.avatar_url}?v=${Date.now()}` : null);
      setAvatarFallback(Array.from(user.full_name || user.email)[0] || '؟');
      setPrefs(user.preferences);
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

    api<Account>('/account')
      .then((user) => {
        if (!active) return;
        if (!applyAccountSnapshot(user)) return;
        applyPreferences(user.preferences);
        syncThemeFromDom();
        setAppIdentity(user);
        setPhase('ready');
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setPhase('unauthenticated');
          setLoadingStatus({ text: getErrorMessage(error), error: true });
        } else {
          setPhase('loading');
          setLoadingStatus({ text: getErrorMessage(error), error: true });
        }
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

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
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
    } catch (error) {
      setAvatarStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleAvatarRemove() {
    if (invalidatedRef.current || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarStatus({ text: 'در حال ذخیره تصویر…', error: false });
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
      setPasswordStatus({ text: 'ذخیره شد.', error: false });
    } catch (error) {
      setPasswordStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  async function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidatedRef.current || busyForm === 'preferences') return;
    setBusyForm('preferences');
    setPrefsStatus({ text: 'در حال ذخیره…', error: false });
    try {
      const result = await api<Account>(
        '/account/preferences',
        {
          expected_user_id: ownerRef.current,
          ...prefs,
        },
        'PATCH',
      );
      if (invalidatedRef.current) return;
      applyAccountSnapshot(result);
      applyPreferences(result.preferences);
      syncThemeFromDom();
      document.dispatchEvent(new Event('garden:account'));
      setPrefsStatus({ text: 'ذخیره شد.', error: false });
    } catch (error) {
      setPrefsStatus({ text: getErrorMessage(error), error: true });
    } finally {
      setBusyForm(null);
    }
  }

  const showLoading = phase === 'loading' || phase === 'invalidated';
  const showLogin = phase === 'unauthenticated';
  const showContent = phase === 'ready';
  const reloadHref = typeof location !== 'undefined' ? location.pathname : '/settings/account/profile';

  return (
    <div className="account-settings">
      <nav aria-label="تنظیمات حساب" className="account-settings-nav">
        <a
          href="/settings/account/profile"
          aria-current={page === 'profile' ? 'page' : undefined}
        >
          پروفایل من
        </a>
        <a
          href="/settings/account/preferences"
          aria-current={page === 'preferences' ? 'page' : undefined}
        >
          ترجیحات من
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

        <div data-settings-login="" hidden={!showLogin}>
          <p>برای تغییر تنظیمات وارد حساب شوید.</p>
          <a href="/account" className="text-primary underline underline-offset-4">
            ورود / ثبت‌نام
          </a>
        </div>

        <div data-settings-content="" hidden={!showContent}>
          {page === 'profile' ? (
            <>
              <section className="account-section" aria-labelledby="avatar-heading">
                <h2 id="avatar-heading">تصویر پروفایل</h2>
                <div className="garden-row">
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
                  <div>
                    <label htmlFor="avatar-file">انتخاب تصویر</label>
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
                  <input
                    id="email-password"
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    dir="ltr"
                    required
                    maxLength={256}
                    value={emailPassword}
                    disabled={!showContent}
                    onChange={(e) => setEmailPassword(e.target.value)}
                  />
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
                  پس از تغییر رمز، نشست‌های دیگر حساب خارج می‌شوند.
                </p>
                <div className="garden-field">
                  <label htmlFor="current-password">رمز عبور فعلی</label>
                  <input
                    id="current-password"
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    dir="ltr"
                    required
                    maxLength={256}
                    value={currentPassword}
                    disabled={!showContent}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="garden-field">
                  <label htmlFor="new-password">رمز عبور جدید</label>
                  <input
                    id="new-password"
                    name="password"
                    type="password"
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
                  <p id="password-help" className="garden-field-help">
                    ۱۲ تا ۲۵۶ نویسه
                  </p>
                </div>
                <div className="garden-field">
                  <label htmlFor="confirm-password">تکرار رمز عبور جدید</label>
                  <input
                    ref={confirmInputRef}
                    id="confirm-password"
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    required
                    minLength={12}
                    maxLength={256}
                    value={confirmPassword}
                    disabled={!showContent}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
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
                <label htmlFor="preference-theme">پوسته</label>
                <select
                  id="preference-theme"
                  name="theme"
                  value={prefs.theme}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      theme: e.target.value as Preferences['theme'],
                    }))
                  }
                >
                  <option value="light">روشن</option>
                  <option value="dark">تیره</option>
                  <option value="system">همگام با دستگاه</option>
                </select>
              </div>

              <div className="garden-field">
                <label htmlFor="preference-size">اندازه متن</label>
                <input
                  id="preference-size"
                  name="size"
                  type="range"
                  min={16}
                  max={26}
                  value={prefs.size}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, size: Number(e.target.value) }))
                  }
                />
                <output htmlFor="preference-size" data-size-output="">
                  {prefs.size} پیکسل
                </output>
              </div>

              <div className="garden-field">
                <label htmlFor="preference-leading">فاصله خطوط</label>
                <input
                  id="preference-leading"
                  name="leading"
                  type="range"
                  min={1.5}
                  max={2.5}
                  step={0.1}
                  value={prefs.leading}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, leading: Number(e.target.value) }))
                  }
                />
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
                  <option value="620">باریک</option>
                  <option value="760">معمولی</option>
                  <option value="960">عریض</option>
                </select>
              </div>

              <label className="account-checkbox">
                <input
                  name="focus"
                  type="checkbox"
                  checked={prefs.focus}
                  disabled={!showContent}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, focus: e.target.checked }))
                  }
                />
                مطالعه بدون سایدبار
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
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, fixed_toolbar: e.target.checked }))
                  }
                />
                ثابت ماندن نوار ابزار هنگام ویرایش
              </label>

              <div className="garden-row">
                <Button
                  className="garden-button-primary"
                  type="submit"
                  disabled={busyForm === 'preferences' || !showContent}
                >
                  ذخیره ترجیحات
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
