/**
 * Map HTTP status + structured backend detail messages to accurate Persian user messages.
 * @param {number} status
 * @param {string} detail
 * @returns {string}
 */
export function formatApiError(status, detail) {
  const normalized = String(detail || '').trim();
  if (status === 401) {
    return 'برای این کار وارد حساب شوید.';
  }
  if (status === 403) {
    if (/author role/i.test(normalized)) {
      return 'این بخش فقط برای نویسندگان و مدیران در دسترس است.';
    }
    if (/admin role/i.test(normalized)) {
      return 'این عملیات نیازمند دسترسی مدیر است.';
    }
    if (/owner or admin/i.test(normalized)) {
      return 'فقط صاحب یادداشت یا مدیر می‌تواند این کار را انجام دهد.';
    }
    if (/password/i.test(normalized)) {
      return 'رمز عبور فعلی درست نیست.';
    }
    return normalized || 'اجازهٔ انجام این عملیات را ندارید.';
  }
  if (status === 409) {
    if (/folder cycle/i.test(normalized)) {
      return 'نمی‌توان پوشه را داخل زیرپوشهٔ خودش منتقل کرد.';
    }
    if (/folder has children/i.test(normalized)) {
      return 'این پوشه خالی نیست؛ برای حذف کل زیرمجموعه تأیید کنید.';
    }
    if (/proposal already reviewed/i.test(normalized)) {
      return 'این پیشنهاد پیش‌تر بررسی شده است.';
    }
    if (/no personal changes/i.test(normalized)) {
      return 'هنوز تغییری نسبت به نسخهٔ رسمی ایجاد نکرده‌اید.';
    }
    if (/canonical base changed/i.test(normalized)) {
      return 'نسخهٔ رسمی از زمان شروع ویرایش تغییر کرده است؛ ابتدا همگام‌سازی کنید.';
    }
    if (/publish or share/i.test(normalized)) {
      return 'برای دیدگاه‌گذاری ابتدا یادداشت را منتشر یا با پیوند هم‌رسانی کنید.';
    }
    if (/published snapshot required/i.test(normalized)) {
      return 'برای تأیید، ابتدا یادداشت باید منتشر شده باشد.';
    }
    if (/email unavailable/i.test(normalized)) {
      return 'این ایمیل پیش‌تر ثبت شده است و قابل انتخاب نیست.';
    }
    if (/account changed/i.test(normalized)) {
      return 'حساب کاربری تغییر کرده است؛ صفحه را تازه کنید.';
    }
    if (
      /note changed|content changed|personal or canonical version changed/i.test(normalized) ||
      !normalized
    ) {
      return 'نسخه تغییر کرده است؛ متن خود را دریافت کنید و پس از بارگذاری دوباره مقایسه کنید.';
    }
    return normalized;
  }
  if (status === 413) {
    return 'حجم فایل یا درخواست از حد مجاز بیشتر است.';
  }
  if (status === 429) {
    return 'تعداد درخواست‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.';
  }
  return normalized || 'خطای موقت در ارتباط با سرویس';
}
