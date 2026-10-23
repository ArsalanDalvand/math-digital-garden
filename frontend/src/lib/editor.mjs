/** Apply CodeMirror's normalized offsets to raw text without normalizing untouched bytes.
 * @param {string} raw @param {{from:number,to:number,insert:string}[]} changes */
export function applyRawChanges(raw, changes) {
  const offsets = [0];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\r' && raw[i + 1] === '\n') i++;
    offsets.push(i + 1);
  }
  for (const change of [...changes].reverse()) {
    if (change.from < 0 || change.to < change.from || change.to >= offsets.length) throw new RangeError('Invalid editor change');
    raw = raw.slice(0, offsets[change.from]) + change.insert + raw.slice(offsets[change.to]);
  }
  return raw;
}

/** Keep the exact YAML prefix in storage while CodeMirror edits only the note body. */
/** @param {string} raw */
export function splitEditorMarkdown(raw) {
  const frontmatter = raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? '';
  return {frontmatter, body: raw.slice(frontmatter.length)};
}

/** @param {string} raw @param {string} yaml */
export function replaceEditorFrontmatter(raw, yaml) {
  const {frontmatter,body}=splitEditorMarkdown(raw);
  const newline=frontmatter.includes('\r\n')?'\r\n':'\n';
  return '---'+newline+yaml.replace(/\r?\n/g,newline)+newline+'---'+newline+body;
}

/** @param {string} hash @param {(content:string,hash:string)=>Promise<{current_hash:string}>} persist */
export function createAutosaver(hash, persist) {
  let blocked = false;
  let tail = Promise.resolve();
  return (/** @type {string} */ content) => {
    const pending = tail.then(async () => {
      if (blocked) throw new Error('Reload is required before saving again');
      try { hash = (await persist(content, hash)).current_hash; }
      catch (error) { blocked = error instanceof Error && 'status' in error && [401, 403, 409].includes(Number(error.status)); throw error; }
    });
    tail = pending.catch(() => {});
    return pending;
  };
}
