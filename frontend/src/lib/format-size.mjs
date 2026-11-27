const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', '7z', 'rar']);

/**
 * Classify attachment type from filename extension.
 * @param {string | null | undefined} filename
 * @returns {'image' | 'pdf' | 'archive' | 'file'}
 */
export function attachmentKind(filename) {
  const ext = String(filename ?? '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase();
  if (!ext) return 'file';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  return 'file';
}

/**
 * Format byte count into localized Persian human-readable units.
 * @param {number | null | undefined} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '۰ بایت';
  if (value < 1024) return `${Math.round(value).toLocaleString('fa')} بایت`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toLocaleString('fa', { maximumFractionDigits: 1 })} کیلوبایت`;
  }
  return `${(value / (1024 * 1024)).toLocaleString('fa', { maximumFractionDigits: 2 })} مگابایت`;
}

/**
 * Build a safe Markdown link or image embed for an attachment URL.
 * @param {string} filename
 * @param {string} url
 * @returns {string}
 */
export function attachmentMarkdownLink(filename, url) {
  const safeLabel = String(filename || 'فایل').replace(/[\\[\]]/g, '\\$&');
  const safeUrl = String(url || '').replace(/\(/g, '%28').replace(/\)/g, '%29');
  const prefix = attachmentKind(filename) === 'image' ? '!' : '';
  return `${prefix}[${safeLabel}](${safeUrl})`;
}
