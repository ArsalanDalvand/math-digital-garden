/** Keep rendered result lists bounded without changing catalogue/filter semantics.
 * @template T
 * @param {T[]} notes
 * @param {string} requested
 */
export function paginateCatalogue(notes, requested = '1') {
  const size = 24;
  const pages = Math.max(1, Math.ceil(notes.length / size));
  const parsed = /^\d+$/.test(requested) ? Number(requested) : 1;
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(parsed) ? parsed : 1));
  return {items: notes.slice((page - 1) * size, page * size), page, pages, total: notes.length};
}
/** @param {string} q @param {string} tag @param {number} page */
export function cataloguePageHref(q, tag, page) {
  return `/search?${new URLSearchParams({q, tag, page: String(page)})}`;
}
