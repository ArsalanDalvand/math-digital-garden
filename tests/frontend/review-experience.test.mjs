import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const {transpile}=require('typescript');
const source=readFileSync(new URL('../../frontend/src/pages/review.astro',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function review(api){
 const dom=new JSDOM(source.replace(/^---[\s\S]*?---/,'').replace(/<script>[\s\S]*?<\/script>/,''),{runScripts:'outside-only'});
 dom.window.api=api;dom.window.message=error=>error.message;
 dom.window.MergeView=class {destroy(){}};
 dom.window.EditorState={readOnly:{of(){}}};
 dom.window.EditorView={editable:{of(){}},perLineTextDirection:{of(){}},lineWrapping:[]};
 dom.window.markdown=()=>[];
 const script=source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/import[^;]+;/g,'');
 await dom.window.eval(transpile("(async()=>{"+script+"})()",{target:7,module:0}));await tick();return dom;
}
test('review failure offers retry and recovers into a useful empty state',async()=>{
 let calls=0;const dom=await review(async()=>{if(++calls===1)throw new Error('temporary outage');return [];});
 const d=dom.window.document,retry=d.querySelector('[data-review-retry]');
 assert.ok(retry,'review must offer retry');assert.equal(retry.hidden,false);
 assert.equal(d.querySelector('[data-review-status]').getAttribute('role'),'alert');
 retry.click();await tick();assert.equal(calls,2);assert.equal(retry.hidden,true);
 assert.match(d.querySelector('[data-review-status]').textContent,/پیشنهادی/);dom.window.close();
});
test('review locks selection and mutations during a decision and preserves the comment on conflict',async()=>{
 let release;const calls=[];const item={id:'1',slug:'cantor',status:'pending',sync_status:'pending',base_content:'old',proposed_content:'new'};
 const dom=await review(async(path,body)=>{calls.push(path);if(path==='/review')return [item];if(body)return new Promise((resolve,reject)=>release=()=>reject(new Error('conflict')));return item;});
 const d=dom.window.document;d.querySelector('[data-review-list] button').click();await tick();
 d.querySelector('[data-review-comment]').value='keep this comment';
 const approve=d.querySelector('[data-decision="approve"]');approve.click();approve.click();
 assert.equal(calls.filter(path=>path==='/review/1').length,2);
 assert.equal(approve.disabled,true);assert.equal(d.querySelector('[data-review-list] button').disabled,true);
 assert.equal(d.querySelector('[data-review-panel]').getAttribute('aria-busy'),'true');
 release();await tick();assert.equal(approve.disabled,false);
 assert.equal(d.querySelector('[data-review-comment]').value,'keep this comment');dom.window.close();
});
