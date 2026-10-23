import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const ts=require('typescript');

test('outline follows visible reader headings safely and restores navigation focus',()=>{
 const source=readFileSync(new URL('../../frontend/src/components/NoteOutline.astro',import.meta.url),'utf8');
 const markup=source.split('---')[2].split('<script>')[0].replace(/<List[^>]*\/>/g,'');
 const dom=new JSDOM(`${markup}<main id="main"><article class="note" hidden><h2 id="hidden">hidden</h2></article><article class="note"><h1 id="عنوان #1"><em>عنوان</em> &lt;img&gt;</h1><h2>no id</h2><div hidden><h3 id="nested">nested</h3></div><h6 id="last">آخر</h6></article><div hidden><article class="note"><h2 id="preview">preview</h2></article></div></main>`,{runScripts:'outside-only',url:'https://garden.test/note'});
 const {window}=dom;const {document}=window;
 window.eval(ts.transpile(source.match(/<script>([\s\S]*?)<\/script>/)[1],{target:ts.ScriptTarget.ES2022}));
 const details=document.querySelector('.note-outline');const summary=details.querySelector('summary');
 const open=()=>{details.open=true;details.dispatchEvent(new window.Event('toggle'));};
 open();let links=[...details.querySelectorAll('a')];
 assert.deepEqual(links.map(a=>a.textContent),['عنوان <img>','آخر']);
 assert.equal(links[0].getAttribute('href'),'#'+encodeURIComponent('عنوان #1'));
 assert.equal(details.querySelector('img'),null);
 links[0].click();assert.equal(details.open,false);assert.equal(document.activeElement.id,'عنوان #1');
 open();document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(details.open,false);assert.equal(document.activeElement,summary);
 open();document.body.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(details.open,false);
 document.querySelectorAll('article.note').forEach(article=>article.hidden=true);open();
 assert.equal(details.querySelectorAll('a').length,0);assert.match(details.textContent,/سرفصلی برای نمایش وجود ندارد/);
 details.open=false;dom.window.close();
});
