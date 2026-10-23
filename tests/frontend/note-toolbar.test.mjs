import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom'), ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/scripts/workspace-note.ts',import.meta.url),'utf8');
test('read/write controls remain visible and expose the successful mode',()=>{
 const dom=new JSDOM('<section><button data-edit aria-pressed="false">Write</button><button data-view aria-pressed="true">Read</button><div data-editor-toolbar hidden></div></section>',{runScripts:'outside-only'});
 const {document}=dom.window;
 Object.assign(dom.window,{root:document.querySelector('section'),viewButton:document.querySelector('[data-view]'),view:{dispatch(){}},mode:{reconfigure(){}},readOnlyExtension(){}});
 Object.assign(dom.window,{toolbar:document.querySelector('[data-editor-toolbar]'),fixedToolbar:true});
 dom.window.eval(ts.transpile(source.slice(source.indexOf('  const updateToolbar='),source.indexOf("  document.addEventListener('garden:preferences'"))+'\nwindow.updateToolbar=updateToolbar;'));
 dom.window.eval(ts.transpile(source.slice(source.indexOf('  function modeSwitch'),source.indexOf("  viewButton.addEventListener"))));
 for(const reading of [false,true,false]){
  dom.window.modeSwitch(reading);
  assert.equal(document.querySelector('[data-edit]').hidden,false);
  assert.equal(document.querySelector('[data-view]').hidden,false);
  assert.equal(document.querySelector('[data-view]').getAttribute('aria-pressed'),String(reading));
  assert.equal(document.querySelector('[data-edit]').getAttribute('aria-pressed'),String(!reading));
  assert.equal(document.querySelector('section').classList.contains('is-editing'),!reading);
  assert.equal(document.querySelector('[data-editor-toolbar]').hidden,reading);
 }
 dom.window.fixedToolbar=false;dom.window.modeSwitch(false);
 assert.equal(document.querySelector('[data-editor-toolbar]').hidden,false);
 assert.equal(document.querySelector('[data-editor-toolbar]').dataset.sticky,'false');
 dom.window.close();
});
test('returning to reading waits for save and preview; errors preserve editing',async()=>{
 const dom=new JSDOM('<section class="is-editing"><button data-view>Read</button><button data-edit>Write</button><button data-original>Original</button></section>',{runScripts:'outside-only'});
 const {window}=dom, button=window.document.querySelector('button');
 let failSave=false,failPreview=false,changeDuringPreview=false,release;
 Object.assign(window,{view:{},originalButton:window.document.querySelector('[data-original]'),root:window.document.querySelector('section'),viewButton:button,raw:'draft',dirty:true,hash:'hash',hasFork:true,article:{hidden:true},panel:{hidden:false},context(){},syncOriginal(){},modeSwitch(){window.root.classList.remove('is-editing');},
  save:async()=>{if(failSave)throw new Error('save failed');window.dirty=false;},
  render:async()=>{if(failPreview)throw new Error('preview failed');if(changeDuringPreview)window.raw='new draft';await new Promise(resolve=>{release=resolve;});}
 });
 window.eval(ts.transpile(source.slice(source.indexOf('  const showReading='),source.indexOf('  function modeSwitch'))+'\nwindow.read=showReading;'));
 failSave=true;await assert.rejects(window.read(),/save failed/);
 assert.equal(window.root.classList.contains('is-editing'),true);assert.equal(window.panel.hidden,false);assert.equal(button.disabled,false);
 failSave=false;failPreview=true;await assert.rejects(window.read(),/preview failed/);
 assert.equal(window.root.classList.contains('is-editing'),true);
 failPreview=false;changeDuringPreview=true;let pending=window.read();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.disabled,true);assert.equal(window.originalButton.disabled,true);assert.equal(window.document.querySelector('[data-edit]').disabled,true);release();await assert.rejects(pending,/متن هنگام آماده‌سازی/);
 assert.equal(window.panel.hidden,false);assert.equal(button.disabled,false);
 changeDuringPreview=false;pending=window.read();await new Promise(resolve=>setImmediate(resolve));release();await pending;
 assert.equal(window.panel.hidden,true);assert.equal(window.article.hidden,false);assert.equal(button.disabled,false);
 assert.equal(window.document.activeElement,button);
 dom.window.close();
});
