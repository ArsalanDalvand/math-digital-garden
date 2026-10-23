/** @param {string} q */
/** @type {Map<string,{promise:Promise<import('./markdown.mjs').Note[]>,expires:number,fetch:typeof globalThis.fetch}>} */
const snapshots=new Map();
export async function fetchCatalogue(q = '') {
  const originKey=process.env.API_BASE_URL||import.meta.env?.API_BASE_URL||'http://127.0.0.1:8000';
  const key=originKey+'|'+q;const existing=snapshots.get(key);if(existing&&existing.fetch===globalThis.fetch&&existing.expires>Date.now())return existing.promise;
  const promise=fetchFreshCatalogue(q);snapshots.set(key,{promise,fetch:globalThis.fetch,expires:Date.now()+5000});
  try{return await promise;}catch(error){snapshots.delete(key);throw error;}
}
/** @param {string} q @returns {Promise<import('./markdown.mjs').Note[]>} */
async function fetchFreshCatalogue(q = '') {
  const origin = process.env.API_BASE_URL || import.meta.env?.API_BASE_URL || 'http://127.0.0.1:8000';
  /** @type {import('./markdown.mjs').Note[]} */
  const notes = [];
  // shortcut: catalogue is derived per request; use a persistent index when note count makes this slow.
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`${origin}/api/notes?offset=${offset}&limit=100&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Catalogue unavailable');
    const page = await response.json();
    if (!Array.isArray(page) || page.length > 100 || page.some((note) =>
      typeof note.slug !== 'string' || !/^[\p{L}\p{N}_-]{1,255}$/u.test(note.slug) ||
      typeof note.title !== 'string' || typeof note.current_content !== 'string')) throw new Error('Invalid catalogue');
    if (page.some((note) => notes.some((previous) => previous.slug === note.slug))) throw new Error('Duplicate catalogue entry');
    notes.push(...page);
    if (page.length < 100) return notes;
  }
}
