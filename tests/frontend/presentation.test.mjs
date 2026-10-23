import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {sectionSlides} from '../../frontend/src/scripts/presentation-slides.mjs';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom'),ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/scripts/presentation.ts',import.meta.url),'utf8').replace(/^import .*;\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(owner=false){
 const dom=new JSDOM(`<div class="workspace-document"><h1>Title</h1><article class="note"><h2>First</h2><p>formula</p><hr><p>Last</p></article></div><div data-note-more></div>${owner?'<section data-workspace-note data-library-id="private"></section>':''}<button data-presentation-open></button><dialog data-presentation><p data-presentation-status></p><article data-presentation-stage></article><span data-presentation-count></span><button data-presentation-prev></button><button data-presentation-next></button><button data-presentation-close></button><button data-presentation-fullscreen></button></dialog>`,{runScripts:'outside-only',url:'http://localhost/notes/note'});
 const dialog=dom.window.document.querySelector('dialog');
 dialog.showModal=()=>dialog.open=true;
 dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new dom.window.Event('close'));};
 dom.window.sectionSlides=sectionSlides;
 return dom;
}
test('sections preserve rendered nodes and split on headings and separators',()=>{
 const dom=fixture();const article=dom.window.document.querySelector('article');
 assert.deepEqual(sectionSlides(Array.from(article.childNodes)).map(slide=>slide.map(n=>n.tagName)),[['H2','P'],['P']]);dom.window.close();
});
test('public presentation uses authorized DOM, navigates and restores focus',async()=>{
 const dom=fixture();const workspace=dom.window.document.createElement('section');workspace.dataset.workspaceNote='canonical';dom.window.document.body.append(workspace);dom.window.eval(ts.transpile(source));const document=dom.window.document,trigger=document.querySelector('[data-presentation-open]');trigger.getClientRects=()=>[{}];trigger.focus();trigger.click();await tick();
 const stage=document.querySelector('[data-presentation-stage]'),dialog=document.querySelector('dialog');
 assert.equal(stage.textContent,'Title');
 stage.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(stage.textContent,'Last');
 stage.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(stage.textContent,'Title');
 document.querySelector('[data-presentation-next]').click();assert.equal(stage.textContent,'Firstformula');
 stage.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(dialog.open,false);assert.equal(stage.textContent,'');assert.equal(document.activeElement,trigger);dom.window.close();
});
test('identity invalidates a pending private preview and cannot expose stale content',async()=>{
 const dom=fixture(true);let finish;
 dom.window.document.addEventListener('garden:flush-note',event=>event.detail.resolve({content:'private draft'}));
 dom.window.fetch=()=>new Promise(resolve=>{finish=resolve;});
 dom.window.eval(ts.transpile(source));dom.window.document.dispatchEvent(new dom.window.CustomEvent('garden:identity',{detail:{id:'first'}}));dom.window.document.querySelector('[data-presentation-open]').click();await tick();
 dom.window.document.dispatchEvent(new dom.window.CustomEvent('garden:identity',{detail:{id:'other'}}));
 finish({ok:true,json:async()=>({html:'<p>PRIVATE</p>'})});await tick();
 assert.equal(dom.window.document.querySelector('dialog').open,false);assert.equal(dom.window.document.querySelector('[data-presentation-stage]').textContent,'');assert.equal(dom.window.document.querySelector('[data-presentation-open]').disabled,true);dom.window.close();
});
