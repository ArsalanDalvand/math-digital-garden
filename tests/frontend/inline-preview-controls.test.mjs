import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom'),{transpile}=require('typescript');
const source=readFileSync(new URL('../../frontend/src/components/InlinePreviews.astro',import.meta.url),'utf8');
test('inline preview has no eye button and keyboard intent gives cloned regions distinct names',()=>{
 const dom=new JSDOM('<article class="note"><a data-note-preview="cantor" href="/notes/cantor">کانتور</a><pre aria-label="بلوک کد"></pre></article><template data-preview-slug="cantor" data-preview-title="کانتور"><button data-close-preview>بستن</button><pre tabindex="0" role="region" aria-label="بلوک کد">code</pre></template><div id="inline-note-preview"></div>',{runScripts:'outside-only'});
 const d=dom.window.document,popup=d.querySelector('#inline-note-preview');
 popup.showPopover=()=>{};popup.hidePopover=()=>{};
 const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
 dom.window.eval(transpile(script,{target:7,module:0}));
 const trigger=d.querySelector('a[data-note-preview]');
 assert.equal(d.querySelector('.note-preview-trigger'),null);
 trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));
 assert.equal(trigger.getAttribute('aria-expanded'),'true');
 const names=[...d.querySelectorAll('pre')].map(node=>node.getAttribute('aria-label'));
 assert.equal(new Set(names).size,names.length);
 d.querySelector('[data-close-preview]').click();
 assert.equal(d.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');dom.window.close();
});

test('inline preview fetches on-demand via API when no template exists and caches response',async()=>{
 const dom=new JSDOM('<article class="note"><a data-note-preview="cantor" href="/notes/cantor">کانتور</a><pre aria-label="بلوک کد"></pre></article><div id="inline-note-preview"></div>',{runScripts:'outside-only',url:'http://localhost/notes/source'});
 const d=dom.window.document,popup=d.querySelector('#inline-note-preview');
 popup.showPopover=()=>{popup.dataset.open='true';};
 popup.hidePopover=()=>{delete popup.dataset.open;};
 const origMatches=popup.matches.bind(popup);
 popup.matches=sel=>sel===':popover-open'?popup.dataset.open==='true':origMatches(sel);
 let fetchCount=0;
 dom.window.fetch=async(url)=>{
  fetchCount++;
  assert.equal(url,'/api/note-preview/cantor');
  return new Response(JSON.stringify({slug:'cantor',title:'کانتور',href:'/notes/cantor',html:'<p>پیش‌نمایش کانتور</p><pre tabindex="0" role="region" aria-label="بلوک کد">x</pre>'}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
 dom.window.eval(transpile(script,{target:7,module:0}));
 const trigger=d.querySelector('a[data-note-preview]');
 trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(fetchCount,1);
 assert.equal(trigger.getAttribute('aria-expanded'),'true');
 assert.match(popup.innerHTML,/پیش‌نمایش کانتور/);
 const names=[...d.querySelectorAll('pre')].map(node=>node.getAttribute('aria-label'));
 assert.equal(new Set(names).size,names.length);
 d.querySelector('[data-close-preview]').click();
 assert.equal(d.activeElement,trigger);
 assert.equal(trigger.getAttribute('aria-expanded'),'false');

 // Second open must use client cache with zero extra network calls
 trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(fetchCount,1);
 dom.window.close();
});
