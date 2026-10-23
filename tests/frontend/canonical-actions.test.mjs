import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {publicationHref,threadComments} from '../../frontend/src/scripts/library-utils.mjs';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom'),ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/scripts/library-actions.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(handler){
 const commands=['link','markdown','favorite','watch','width','history','attachments','rename','move','verify','trash'];
 const dom=new JSDOM(`<div data-note-more></div><button data-more-toggle></button><div data-note-extra-actions></div><div class="workspace-document"><h1>Math</h1></div><div data-library-actions="" data-canonical-slug="note"><div data-library-menu>${commands.map(c=>`<button data-library-command="${c}">${c}</button>`).join('')}<small data-library-info></small></div><div data-library-top><button data-library-command="share">share</button><button data-library-command="comments">comments</button></div><p data-library-status></p><dialog><button data-library-close>close</button><h2 data-library-title></h2><p data-library-dialog-status></p><div data-library-body></div></dialog></div>`,{runScripts:'outside-only',url:'http://localhost/notes/note'});
 const {window}=dom;const dialog=window.document.querySelector('dialog');
 dialog.showModal=function(){this.open=true;};dialog.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 class ApiError extends Error{constructor(status){super('API error');this.status=status;}}
 const calls=[];
 window.request=async(path,data,method)=>{calls.push({path,data,method});if(path==='/auth/me')return {id:'a',role:'student'};if(path==='/library/canonical/note'&&!data)throw new ApiError(404);if(handler)return handler(path,data,method);};
 Object.assign(window,{ApiError,message:e=>e.message,publicationHref,threadComments,applyPreferences:()=>{}});
 const copied=[];Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async value=>copied.push(value)}});
 window.eval(ts.transpile(source));
 return {dom,window,calls,copied,identity:id=>window.document.dispatchEvent(new window.CustomEvent('garden:identity',{detail:{id}})),click:command=>window.document.querySelector(`[data-library-command="${command}"]`).click()};
}
const item={id:'mine',title:'My note',content:'raw',current_hash:'hash',visibility:'private',updated_at:new Date().toISOString()};
test('canonical menu reads without creating copies; Markdown waits for acknowledged raw bytes',async()=>{
 const s=fixture();await tick();assert.equal(s.calls.filter(c=>c.data).length,0);
 let finish;s.window.document.addEventListener('garden:flush-note',e=>{finish=e.detail.resolve;});
 s.click('markdown');await tick();assert.deepEqual(s.copied,[]);
 const content='---\r\ntitle: Math\r\n---\r\n$x^2$\n';finish({content,hash:'hash'});await tick();
 assert.deepEqual(s.copied,[content]);assert.equal(s.calls.filter(c=>c.data).length,0);s.dom.window.close();
});
test('share resolves the same personal note directly, without copy confirmation or navigation',async()=>{
 const s=fixture(async(path,data)=>path==='/library/canonical/note'?item:path.endsWith('/favorite')?{favorite:false}:path.endsWith('/watch')?{watching:false}:item);
 s.window.document.addEventListener('garden:flush-note',e=>e.detail.resolve({content:'raw',hash:'hash'}));await tick();
 s.click('share');await tick();await tick();
 assert.equal(s.calls.filter(c=>c.path==='/library/canonical/note'&&c.data).length,1);
 assert.equal(s.window.location.pathname,'/notes/note');assert.equal(s.window.document.querySelector('dialog').open,true);
 assert.ok(s.window.document.querySelector('[data-library-body]').textContent.includes('انتشار عمومی'));
 assert.equal(s.calls.filter(c=>c.path==='/library/items').length,0);s.dom.window.close();
});
test('identity change discards late personal resolution and cannot open a dialog or disclose title',async()=>{
 let release;const s=fixture(async()=>new Promise(resolve=>{release=resolve;}));
 s.window.document.addEventListener('garden:flush-note',e=>e.detail.resolve({content:'raw',hash:'hash'}));await tick();s.identity('a');s.click('history');await tick();
 s.identity('b');release({...item,title:'SECRET TITLE'});await tick();
 assert.equal(s.window.document.querySelector('dialog').open,false);assert.equal(s.window.document.body.textContent.includes('SECRET TITLE'),false);s.dom.window.close();
});
test('late private history is discarded after identity change',async()=>{
 let release;const s=fixture(async(path)=>path.endsWith('/history?offset=0&limit=100')?new Promise(resolve=>{release=resolve;}):path.endsWith('/favorite')?{favorite:false}:path.endsWith('/watch')?{watching:false}:item);
 s.window.document.addEventListener('garden:flush-note',e=>e.detail.resolve({content:'raw',hash:'hash'}));await tick();s.click('history');await tick();await tick();
 s.identity('b');release([{id:'revision',content:'PRIVATE HISTORY',created_at:new Date().toISOString()}]);await tick();
 assert.equal(s.window.document.querySelector('dialog').open,false);assert.equal(s.window.document.body.textContent.includes('PRIVATE HISTORY'),false);s.dom.window.close();
});
test('canonical comments open and submit without creating or publishing a personal copy',async()=>{
 const s=fixture(async(path)=>path.includes('/comments')?[]:undefined);await tick();
 s.click('comments');await tick();
 assert.ok(s.calls.some(c=>c.path==='/library/canonical/note/comments?offset=0&limit=100'));
 const form=s.window.document.querySelector('[data-library-body] form');assert.ok(form);
 form.querySelector('textarea').value='Shared question';form.dispatchEvent(new s.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(s.calls.find(c=>c.path==='/library/canonical/note/comments'&&c.data)?.data.content,'Shared question');
 assert.equal(s.calls.some(c=>c.path==='/library/canonical/note'&&c.data),false);
 assert.equal(s.calls.some(c=>c.path.includes('/publication')),false);
 s.dom.window.close();
});
test('canonical comment response cannot repopulate a closed identity session',async()=>{
 let release;const s=fixture(async()=>new Promise(resolve=>{release=resolve;}));await tick();
 s.click('comments');await tick();s.identity('b');
 release([{id:'one',content:'LATE COMMENT',user_id:'a',created_at:new Date().toISOString(),parent_id:null}]);await tick();
 assert.equal(s.window.document.querySelector('dialog').open,false);
 assert.equal(s.window.document.body.textContent.includes('LATE COMMENT'),false);s.dom.window.close();
});
