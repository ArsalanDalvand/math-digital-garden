import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledge } from '../../frontend/src/lib/markdown.mjs';
const notes = [
 {slug:'one', title:'اول', current_content:'---\ntags: [مجموعه]\n---\n## تعریف\n[[نام دوم|بعدی]] [[two#تعریف]] [[گمشده]] [[مشترک]]\n`[[two]]` $[[two]]$'},
 {slug:'two', title:'دوم', current_content:'---\naliases: [نام دوم, مشترک]\n---\n## تعریف\n$x^2$'},
 {slug:'three', title:'سوم', current_content:'---\naliases: [مشترک]\n---\nمتن'},
];
test('wiki aliases, anchors, missing and ambiguous links share rendering and relationships', async()=>{
 const garden=await buildKnowledge(notes);
 assert.deepEqual(garden[0].outgoing,['two']);
 assert.deepEqual(garden[1].backlinks,['one']);
 assert.deepEqual(garden[0].tags,['مجموعه']);
 assert.match(garden[0].html,/href="\/notes\/two"/);
 assert.match(garden[0].html,/href="\/notes\/two#تعریف"/);
 assert.match(garden[0].html,/wiki-missing/);
 assert.match(garden[0].html,/wiki-ambiguous/);
 assert.match(garden[1].html,/id="تعریف"/);
 assert.match(garden[1].html,/katex/);
 assert.deepEqual((await buildKnowledge([{...notes[0],current_content:'بدون پیوند'},notes[1]]))[1].backlinks,[]);
});
test('code and math do not produce wiki references',async()=>{
 const garden=await buildKnowledge([{...notes[0],current_content:'`[[two]]`\n\n$$\n[[two]]\n$$'},notes[1]]);
 assert.deepEqual(garden[0].outgoing,[]);
});
test('catalogue reads all pages and rejects malformed or unsuccessful responses',async()=>{
 const { fetchCatalogue } = await import('../../frontend/src/lib/catalogue.mjs');
 const original=globalThis.fetch;
 try {
  let calls=0;
  globalThis.fetch=async(url)=>{
   assert.match(String(url),new RegExp(`offset=${calls*100}`));
   return Response.json(calls++===0 ? Array.from({length:100},(_,i)=>({...notes[0],slug:`n${i}`})) : [notes[1]]);
  };
  assert.equal((await fetchCatalogue()).length,101);
  globalThis.fetch=async()=>Response.json([{slug:'bad/path'}]);
  await assert.rejects(fetchCatalogue());
  globalThis.fetch=async()=>new Response(null,{status:503});
  await assert.rejects(fetchCatalogue());
 } finally {globalThis.fetch=original;}
});
test('heading targets reuse generated IDs including punctuation; unknown headings stay unresolved',async()=>{
 const garden=await buildKnowledge([
 {slug:'one',title:'اول',current_content:'[[two#تعریف (مجموعه)|تعریف]] [[two#غایب]]'},
 {slug:'two',title:'دوم',current_content:'## تعریف (مجموعه)\nمتن'},
 ]);
 assert.match(garden[0].html,/href="\/notes\/two#تعریف-مجموعه"/);
 assert.doesNotMatch(garden[0].html,/href="[^"]*غایب/);
});
test('preview fragments do not duplicate document heading IDs',async()=>{
 const [note]=await buildKnowledge([{slug:'one',title:'اول',current_content:'## بخش\n$x^2$'}]);
 assert.match(note.html,/id="بخش"/);
 assert.doesNotMatch(note.previewHtml,/ id=/);
 assert.match(note.previewHtml,/katex/);
});

test('backlink preview uses the referring paragraph before embed expansion, without duplicate IDs',async()=>{
 const garden=await buildKnowledge([
  {slug:'source',title:'مبدأ',current_content:'مقدمه نامرتبط\n\nمتن مرتبط [[target#بخش|ارجاع]] ^ref\n\nمتن دوم [[target]]\n\n`[[hidden]]` [[مشترک]]\n\n![[embed]]'},
  {slug:'target',title:'مقصد',current_content:'## بخش\nمحتوا'},
  {slug:'embed',title:'جاسازی',current_content:'ارجاع داخل جاسازی [[hidden]]'},
  {slug:'hidden',title:'پنهان',current_content:'---\naliases: [مشترک]\n---\nمتن'},
  {slug:'other',title:'دیگر',current_content:'---\naliases: [مشترک]\n---\nمتن'},
 ]);
 assert.match(garden[0].referencePreviews.target,/متن مرتبط/);
 assert.match(garden[0].referencePreviews.target,/href="\/notes\/target#بخش"/);
 assert.doesNotMatch(garden[0].referencePreviews.target,/مقدمه|متن دوم| id=/);
 assert.equal(garden[0].referencePreviews.hidden,undefined);
 assert.match(garden[0].referencePreviews.embed,/href="\/notes\/embed"/);
 assert.equal(garden[0].current_content.includes('^ref'),true);
 const [list]=await buildKnowledge([
  {slug:'list',title:'فهرست',current_content:'مقدمه\n\n- ارجاع فهرست [[target]]'},
  {slug:'target',title:'مقصد',current_content:'متن'},
 ]);
 assert.match(list.referencePreviews.target,/ارجاع فهرست/);
 assert.doesNotMatch(list.referencePreviews.target,/مقدمه/);
});
