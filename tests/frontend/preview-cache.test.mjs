import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewRenderer} from '../../frontend/src/lib/preview-cache.mjs';
import {previewBlocks} from '../../frontend/src/lib/preview-blocks.mjs';
import {renderMarkdown} from '../../frontend/src/lib/markdown.mjs';

test('one request prepares all callouts and reuses unchanged read/edit previews',async()=>{
 let calls=0,resolve;
 const previews=createPreviewRenderer(async(raw,blocks)=>{calls++;if(blocks)return new Promise(r=>resolve=r);return {html:'edited'};});
 previews.prepare('whole');const first=previews.render('a'),second=previews.render('b');
 resolve({html:'whole html',blocks:[{raw:'a',html:'A'},{raw:'b',html:'B'}]});
 assert.deepEqual(await Promise.all([first,second]),['A','B']);
 assert.equal(await previews.render('whole'),'whole html');assert.equal(calls,1);
 assert.deepEqual(await Promise.all([previews.render('changed'),previews.render('changed')]),['edited','edited']);assert.equal(calls,2);
});
test('identity invalidation rejects late private previews and clears cached content',async()=>{
 let resolve,calls=0;
 const previews=createPreviewRenderer(async()=>{calls++;return calls===1?new Promise(r=>resolve=r):{html:'new identity'};});
 previews.prepare('private');const waiting=previews.render('private');
 previews.clear();resolve({html:'old private',blocks:[{raw:'block',html:'old block'}]});
 await assert.rejects(waiting,/identity changed/);
 assert.equal(await previews.render('private'),'new identity');assert.equal(calls,2);
});
test('failed previews retry, and cache stays bounded',async()=>{
 let calls=0;
 const previews=createPreviewRenderer(async raw=>{calls++;if(calls===1)throw Error('offline');return {html:raw};});
 await assert.rejects(previews.render('a'),/offline/);assert.equal(await previews.render('a'),'a');
 for(let i=0;i<65;i++)await previews.render(String(i));
 const before=calls;await previews.render('a');assert.equal(calls,before+1);
});
test('separate callouts, folded and nested content render; code is excluded',async()=>{
 const raw='> [!PROOF] First\n> $x$\n\n> [!TIP]- Second\n> text\n> > [!NOTE] Nested\n> > body\n\n```md\n> [!WARNING] literal\n```\n\n![[note]]';
 const blocks=previewBlocks(raw);assert.equal(blocks.length,3);
 assert.equal(raw.slice(blocks[0].from,blocks[0].to),blocks[0].raw);
 assert.match(await renderMarkdown(blocks[0].raw),/data-callout-type="proof"/);
 assert.match(await renderMarkdown(blocks[1].raw),/data-callout-type="tip"/);
 assert.match(await renderMarkdown(blocks[1].raw),/data-callout-type="note"/);
});
