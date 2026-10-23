/**
 * @typedef {{slug:string, title?:string, status?:string}} WorkspaceItem
 * @typedef {{state:'loading'|'ready'|'error', data?:any, error?:unknown}} SectionState
 */
/**
 * @param {(path:string) => Promise<any>} request
 * @param {(section:string, state:SectionState) => void} onChange
 */
export async function loadWorkspace(request, onChange) {
  /** @type {Record<string, SectionState>} */
  const results = {};
  await Promise.all(['workspace', 'proposals'].map(async section => {
    onChange(section, {state:'loading'});
    try {
      results[section] = {state:'ready', data:await request('/' + section)};
    } catch (error) {
      results[section] = {state:'error', error};
    }
    onChange(section, results[section]);
  }));
  return results;
}

/** @param {{forks:WorkspaceItem[], bookmarks:WorkspaceItem[], proposals:WorkspaceItem[]}} data */
export function filterWorkspace(data, query = '', status = 'all') {
  const needle = query.trim().toLocaleLowerCase('fa');
  /** @param {WorkspaceItem} item */
  const matches = item => `${item.title ?? ''} ${item.slug}`.toLocaleLowerCase('fa').includes(needle);
  return {
    forks: data.forks.filter(matches),
    bookmarks: data.bookmarks.filter(matches),
    proposals: data.proposals.filter(item => matches(item) && (status === 'all' || item.status === status)),
  };
}
