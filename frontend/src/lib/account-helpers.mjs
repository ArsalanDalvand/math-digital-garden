const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

const ROLE_LABELS = {
  student: 'دانشجو',
  author: 'نویسنده',
  admin: 'مدیر',
};

/**
 * Evaluate live password length/confirmation status matching backend PasswordChange rules.
 * @param {string | null | undefined} password
 * @param {string | null | undefined} [confirmation]
 * @returns {{ valid: boolean; length: number; minLength: number; maxLength: number; remaining: number; matchesConfirmation: boolean; level: 'empty' | 'short' | 'good' | 'strong' }}
 */
export function evaluatePasswordPolicy(password, confirmation = undefined) {
  const value = typeof password === 'string' ? password : '';
  const length = value.length;
  const remaining = Math.max(0, MIN_PASSWORD_LENGTH - length);
  const valid = length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH;
  const matchesConfirmation = confirmation === undefined ? true : value === confirmation;

  /** @type {'empty' | 'short' | 'good' | 'strong'} */
  let level = 'empty';
  if (length > 0 && length < MIN_PASSWORD_LENGTH) {
    level = 'short';
  } else if (length >= MIN_PASSWORD_LENGTH) {
    const hasVariety = /[a-z]/i.test(value) && /\d/.test(value) && /[^a-zA-Z0-9\s]/.test(value);
    level = length >= 16 || hasVariety ? 'strong' : 'good';
  }

  return {
    valid,
    length,
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
    remaining,
    matchesConfirmation,
    level,
  };
}

/**
 * Translate role enum value into Persian UI label.
 * @param {string | null | undefined} role
 * @returns {string}
 */
export function roleLabel(role) {
  if (!role || typeof role !== 'string') return 'عضو';
  return ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (role)] || 'عضو';
}

/**
 * Merge server reading preferences into localStorage state while preserving local-only mathScale.
 * @template {{ size: number; leading: number; width: number; focus: boolean }} T
 * @param {string | null | undefined} existingRaw
 * @param {T} reading
 * @returns {T & { mathScale: number }}
 */
export function mergeReadingStorage(existingRaw, reading) {
  let mathScale = 1;
  if (existingRaw && typeof existingRaw === 'string') {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === 'object' && typeof parsed.mathScale === 'number') {
        const clamped = Math.max(0.85, Math.min(1.3, parsed.mathScale));
        if (Number.isFinite(clamped)) mathScale = clamped;
      }
    } catch {
      mathScale = 1;
    }
  }
  return {
    ...reading,
    mathScale,
  };
}

/**
 * Validate a `?next=` redirect target as a safe same-origin relative path (preventing open redirects).
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function sanitizeNextPath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\r\n\0]/.test(value)) return null;
  if (value === '/account' || value.startsWith('/account?') || value.startsWith('/account#')) {
    return null;
  }
  return value;
}
