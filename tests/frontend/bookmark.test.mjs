import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/scripts/workspace-note.ts',import.meta.url),'utf8');
const script=source.slice(source.indexOf('  const bookmark='),source.indexOf("  root.querySelector<HTMLFormElement>('[data-proposal-form]')"));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('bookmark restores server state, toggles through the existing API and retains state after failure',async()=>{
  const dom=new JSDOM('<button data-bookmark><span></span></button>',{runScripts:'outside-only'});
  const calls=[],messages=[];
  let fail=false,release;
  dom.window.slug='note';dom.window.libraryId=undefined;
  dom.window.say=text=>messages.push(text);
  dom.window.handle=error=>messages.push(error.message);
  dom.window.api=async(path,_body,method)=>{
    calls.push([path,method]);
    if(!method)return {bookmarks:[{slug:'note'}]};
    await new Promise(resolve=>{release=resolve;});
    if(fail)throw new Error('retry');
  };
  dom.window.eval(ts.transpile(script));
  await tick();
  const button=dom.window.document.querySelector('button');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  button.click();
  assert.equal(button.disabled,true);
  assert.equal(button.getAttribute('aria-busy'),'true');
  release();await tick();
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(button.disabled,false);
  assert.deepEqual(calls.at(-1),['/workspace/bookmarks/note','DELETE']);
  fail=true;button.click();release();await tick();
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(button.disabled,false);
  assert.equal(button.hasAttribute('aria-busy'),false);
  assert.deepEqual(calls.at(-1),['/workspace/bookmarks/note','PUT']);
  assert.equal(messages.at(-1),'retry');
  dom.window.close();
});

test('late initial bookmark response cannot overwrite the completed user action',async()=>{
  const dom=new JSDOM('<button data-bookmark><span></span></button>',{runScripts:'outside-only'});
  let release;
  Object.assign(dom.window,{libraryId:undefined,slug:'note',say:()=>{},handle:assert.fail,api:async(_path,_body,method)=>method?undefined:new Promise(resolve=>{release=resolve;})});
  dom.window.eval(ts.transpile(script));
  const button=dom.window.document.querySelector('button');
  button.click();await tick();
  release({bookmarks:[]});await tick();
  assert.equal(button.getAttribute('aria-pressed'),'true');
  dom.window.close();
});
