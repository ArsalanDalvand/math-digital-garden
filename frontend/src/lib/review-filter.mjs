/**
 * Filter author review queue items across query text and review status cleanly.
 * @template {{ slug?: string, title?: string, author_name?: string, student_comment?: string, status?: string }} T
 * @param {readonly T[]} items
 * @param {string} [query]
 * @param {'all' | 'pending' | 'approved' | 'changes_requested' | 'rejected'} [status]
 * @returns {{
 *   items: T[],
 *   counts: { all: number, pending: number, approved: number, changes_requested: number, rejected: number }
 * }}
 */
export function filterReviewProposals(items, query = '', status = 'all') {
  const list = Array.isArray(items) ? items : [];
  const needle = String(query ?? '').trim().toLocaleLowerCase('fa');

  const queryMatched = needle
    ? list.filter((item) => {
        const haystack = `${item?.title ?? ''} ${item?.slug ?? ''} ${item?.author_name ?? ''} ${item?.student_comment ?? ''}`;
        return haystack.toLocaleLowerCase('fa').includes(needle);
      })
    : list;

  const counts = {
    all: queryMatched.length,
    pending: 0,
    approved: 0,
    changes_requested: 0,
    rejected: 0,
  };
  for (const item of queryMatched) {
    const s = item?.status;
    if (s === 'pending') counts.pending++;
    else if (s === 'approved') counts.approved++;
    else if (s === 'changes_requested') counts.changes_requested++;
    else if (s === 'rejected') counts.rejected++;
  }

  const filtered =
    status === 'all' ? [...queryMatched] : queryMatched.filter((item) => item?.status === status);
  return { items: filtered, counts };
}
