const MAX_ZIP_IMPORT_BYTES = 50 * 1024 * 1024;
const PERSIAN_COLLATOR = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });

/**
 * Normalize Persian/Arabic characters, numerals, diacritics, and spacing for reliable search.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeLibraryText(value) {
  if (!value || typeof value !== 'string') return '';
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String(code - 0x06f0);
      continue;
    }
    if (code >= 0x0660 && code <= 0x0669) {
      out += String(code - 0x0660);
      continue;
    }
    if (
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670 ||
      code === 0x0640 ||
      code === 0x200c ||
      code === 0x200f
    ) {
      continue;
    }
    if (ch === 'ك') {
      out += 'ک';
    } else if (ch === 'ي' || ch === 'ى') {
      out += 'ی';
    } else if (ch === 'أ' || ch === 'إ' || ch === 'آ') {
      out += 'ا';
    } else if (ch === 'ة') {
      out += 'ه';
    } else {
      out += ch.toLowerCase();
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * @template {{ kind?: string; title?: string; label?: string; git_repo_url?: string | null }} T
 * Filter library rows by normalized query and sort folders before notes using Persian collation.
 * @param {T[]} rows
 * @param {string | null | undefined} query
 * @returns {{ rows: T[]; totalCount: number; filteredCount: number }}
 */
export function filterAndSortLibraryRows(rows, query = '') {
  const safeRows = Array.isArray(rows) ? [...rows] : [];
  const normQuery = normalizeLibraryText(query);

  safeRows.sort((a, b) => {
    const aFolder = a.kind === 'folder' ? 0 : 1;
    const bFolder = b.kind === 'folder' ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    const aLabel = String(a.title ?? a.label ?? '');
    const bLabel = String(b.title ?? b.label ?? '');
    return PERSIAN_COLLATOR.compare(aLabel, bLabel);
  });

  if (!normQuery) {
    return {
      rows: safeRows,
      totalCount: safeRows.length,
      filteredCount: safeRows.length,
    };
  }

  const filtered = safeRows.filter((row) => {
    const haystack = [row.title, row.label, row.git_repo_url]
      .filter(Boolean)
      .map((part) => normalizeLibraryText(String(part)))
      .join(' ');
    return haystack.includes(normQuery);
  });

  return {
    rows: filtered,
    totalCount: safeRows.length,
    filteredCount: filtered.length,
  };
}

/**
 * Map item visibility into localized Persian label and visual tone.
 * @param {string | null | undefined} visibility
 * @returns {{ visibility: 'private' | 'unlisted' | 'public'; label: string; tone: 'neutral' | 'accent' | 'success' }}
 */
export function describeVisibility(visibility) {
  if (visibility === 'public') {
    return { visibility: 'public', label: 'عمومی', tone: 'success' };
  }
  if (visibility === 'unlisted') {
    return { visibility: 'unlisted', label: 'پیوند اختصاصی', tone: 'accent' };
  }
  return { visibility: 'private', label: 'خصوصی', tone: 'neutral' };
}

/**
 * Validate a ZIP archive before reading into memory and uploading as base64.
 * @param {{ name?: string; size?: number } | null | undefined} fileLike
 * @returns {{ ok: boolean; error?: string }}
 */
export function validateZipImportFile(fileLike) {
  if (!fileLike || !fileLike.name) {
    return { ok: false, error: 'ابتدا یک فایل زیپ با پسوند ‎.zip انتخاب کنید.' };
  }
  if (!String(fileLike.name).trim().toLowerCase().endsWith('.zip')) {
    return { ok: false, error: 'فقط فایل‌های فشرده با پسوند ‎.zip پشتیبانی می‌شوند.' };
  }
  const size = Number(fileLike.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'فایل انتخاب‌شده خالی است.' };
  }
  if (size > MAX_ZIP_IMPORT_BYTES) {
    return { ok: false, error: 'حداکثر اندازهٔ مجاز فایل زیپ ۵۰ مگابایت است.' };
  }
  return { ok: true };
}

/**
 * Tailored empty-state title, description, and primary action per library view/auth state.
 * @param {string} view
 * @param {{ authenticated: boolean; hasQuery: boolean; inFolder: boolean }} state
 * @returns {{ title: string; description: string; ctaLabel?: string; ctaHref?: string; action?: 'clear-filter' | 'focus-create' | 'root' }}
 */
export function libraryEmptyCopy(view, state) {
  const { authenticated, hasQuery, inFolder } = state;

  if (hasQuery) {
    return {
      title: 'موردی با این فیلتر پیدا نشد',
      description: 'عبارت جستجو را کوتاه‌تر یا فیلتر فعلی را پاک کنید.',
      ctaLabel: 'پاک کردن فیلتر',
      action: 'clear-filter',
    };
  }

  if (!authenticated && view !== 'items' && view !== 'public') {
    const viewName =
      view === 'favorites' ? 'علاقه‌مندی‌ها' : view === 'watching' ? 'پیگیری‌ها' : 'زباله‌دان';
    return {
      title: `برای مشاهدهٔ ${viewName} وارد شوید`,
      description: 'نشانه‌گذاری‌ها، پیگیری تغییرات و جزوه‌های شخصی فقط در حساب کاربری شما نگهداری می‌شوند.',
      ctaLabel: 'ورود یا ثبت‌نام',
      ctaHref: '/account',
    };
  }

  if (view === 'public') {
    return {
      title: 'هنوز یادداشت عمومی منتشرنشده است',
      description:
        'یادداشت‌ها و جزوه‌هایی که کاربران به‌صورت عمومی منتشر کنند، برای مطالعهٔ همگان اینجا نمایش داده می‌شوند.',
    };
  }

  if (view === 'favorites') {
    return {
      title: 'هنوز یادداشتی در علاقه‌مندی‌ها ندارید',
      description: 'هنگام مطالعهٔ هر یادداشت می‌توانید با گزینهٔ علاقه‌مندی‌ها آن را اینجا سنجاق کنید.',
    };
  }

  if (view === 'watching') {
    return {
      title: 'هیچ یادداشتی تحت پیگیری نیست',
      description: 'با فعال کردن پیگیری روی یادداشت‌های رسمی یا اشتراکی، به‌روزرسانی‌های آن‌ها اینجا نمایش داده می‌شود.',
    };
  }

  if (view === 'trash') {
    return {
      title: 'زباله‌دان خالی است',
      description: 'یادداشت‌ها یا پوشه‌هایی که حذف کنید، تا زمان بازیابی در این بخش نگهداری می‌شوند.',
    };
  }

  if (inFolder) {
    return {
      title: 'این پوشه هنوز خالی است',
      description: 'از نوار بالا یک یادداشت یا زیرپوشه بسازید، یا مستندات خود را از گیت/زیپ درون‌ریزی کنید.',
      ctaLabel: 'ساخت مورد تازه',
      action: 'focus-create',
    };
  }

  return {
    title: 'هنوز موردی در این نما نیست',
    description: 'می‌توانید نخستین یادداشت یا پوشهٔ خود را بسازید.',
    ctaLabel: 'ساخت مورد تازه',
    action: 'focus-create',
  };
}
