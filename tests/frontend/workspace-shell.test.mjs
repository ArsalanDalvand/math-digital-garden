import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../frontend/src/'+p,import.meta.url),'utf8');
test('workspace exposes account in header and a physical left tool rail',()=>{
 const shell=read('layouts/Reader.astro');assert.match(shell,/workspace-header/);assert.match(shell,/<AccountMenu client:load/);
 const note=read('pages/notes/[slug].astro');assert.match(note,/slot="tools"/);
});
