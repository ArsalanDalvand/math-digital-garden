import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {personalNodes} from '../../frontend/src/scripts/library-utils.mjs';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import {JSDOM} from '../../frontend/node_modules/jsdom/lib/api.js';
const source=fs.readFileSync(new URL('../../frontend/src/scripts/library-navigation.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
 const dom=new JSDOM(`<section data-library-navigation><button data-library-add>+</button><div data-library-tree></div><p data-library-status></p><dialog data-library-create><h2 data-create-heading></h2><p data-create-location></p><form><label>نوع<select name="kind"><option value="note">Note</option><option value="folder">Folder</option></select></label><input name="title" required/><p data-create-status></p><button type="button" data-create-cancel>Cancel</button><button type="submit">Create</button></form></dialog><template data-tree-icon="note"><svg></svg></template><template data-tree-icon="folder"><svg></svg></template></section>`,{url:'http://localhost/library'});
 const {window}=dom,requests=[],navigation=[];
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 class ApiError extends Error{constructor(status){super('error');this.status=status;}}
 vm.runInNewContext(compiled,{exports:{},require:name=>name.includes('library-utils')?{personalNodes}:({api:(path,data)=>new Promise((resolve,reject)=>requests.push({path,data,resolve,reject})),ApiError,message:e=>e.message}),document:window.document,window,location:{pathname:'/library',assign:p=>navigation.push(p)},CustomEvent:window.CustomEvent,Event:window.Event,FormData:window.FormData,console});
 return {window,document:window.document,requests,navigation,ApiError};
}
test('public and owner nodes share one sorted tree; identity discards late owner metadata',async()=>{
 const s=mount();s.requests.find(r=>r.path==='/library-tree').resolve([{label:'Public',link:'/notes/example'}]);await tick();s.requests.find(r=>r.path==='/library/canonical/metadata').resolve([]);
 s.requests.find(r=>r.path.startsWith('/library/items')).resolve([{id:'mine',title:'A private note',kind:'note'}]);await tick();
 assert.deepEqual([...s.document.querySelectorAll('[data-library-tree] > a')].map(a=>a.getAttribute('href')),['/library/mine','/notes/example']);
 s.document.dispatchEvent(new s.window.CustomEvent('garden:identity',{detail:{id:'alice'}}));
 const late=s.requests.at(-1);
 s.document.dispatchEvent(new s.window.CustomEvent('garden:identity',{detail:null}));
 late.resolve([{id:'secret',title:'STALE PRIVATE',kind:'note'}]);await tick();
 assert.equal(s.document.body.textContent.includes('STALE PRIVATE'),false);
 assert.equal(s.document.querySelector('[href="/library/mine"]'),null);
 for(const request of s.requests.filter(r=>r.path==='/library/canonical/metadata'))request.resolve([]);await tick();assert.ok(s.document.querySelector('[href="/notes/example"]'));
});
test('sidebar creation rejects duplicate submit and ignores completion after identity change',async()=>{
 const s=mount();s.requests[0].resolve([]);s.requests[1].resolve([]);await tick();
 s.document.dispatchEvent(new s.window.CustomEvent('garden:identity',{detail:{id:'alice'}}));
 s.document.querySelector('[data-library-add]').click();
 const form=s.document.querySelector('form');form.elements.title.value='New note';
 form.dispatchEvent(new s.window.Event('submit',{cancelable:true}));form.dispatchEvent(new s.window.Event('submit',{cancelable:true}));
 const creates=s.requests.filter(r=>r.data);assert.equal(creates.length,1);assert.equal(creates[0].data.title,'New note');
 s.document.dispatchEvent(new s.window.CustomEvent('garden:identity',{detail:{id:'bob'}}));
 creates[0].resolve({id:'old-user-note',kind:'note'});await tick();
 assert.deepEqual(s.navigation,[]);assert.equal(form.elements.title.value,'');assert.equal(s.document.querySelector('dialog').open,false);
});

test('late private canonical title cannot reappear after identity changes',async()=>{
 const s=mount();s.requests.find(r=>r.path==='/library-tree').resolve([{label:'Original',link:'/notes/example'}]);
 s.requests.find(r=>r.path.startsWith('/library/items')).resolve([]);await tick();
 const old=s.requests.find(r=>r.path==='/library/canonical/metadata');
 s.document.dispatchEvent(new s.window.CustomEvent('garden:identity',{detail:{id:'b'}}));await tick();
 old.resolve([{slug:'example',title:'PRIVATE OLD TITLE',hidden:false}]);await tick();
 assert.equal(s.document.body.textContent.includes('PRIVATE OLD TITLE'),false);
 s.requests.filter(r=>r.path==='/library/canonical/metadata').at(-1).resolve([]);await tick();
 assert.equal(s.document.querySelector('[href="/notes/example"]').textContent,'Original');
});
