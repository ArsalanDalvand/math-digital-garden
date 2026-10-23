import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnowledge} from '../../frontend/src/lib/markdown.mjs';

test('Vault image embeds resolve only known assets, apply dimensions and preserve raw Markdown',async()=>{
  const raw='![[Integral.png|240]]\n\n![[../../outside.png]]';
  const garden=await buildKnowledge([{slug:'image',title:'Image',current_content:raw}]);
  assert.match(garden[0].html,/<img[^>]*src="\/vault\/math-freamwork\/04%20Sources\/Pictures\/Notes\/Integral.png"/);
  assert.match(garden[0].html,/width="240"/);
  assert.doesNotMatch(garden[0].html,/src="[^" ]*outside/);
  assert.equal(garden[0].current_content,raw);
});

test('Transclusion includes safe rendered note and block references resolve real anchors',async()=>{
  const garden=await buildKnowledge([
    {slug:'a',title:'Alpha',current_content:'![[Beta]]\n\n[[Beta#^proof-a]]'},
    {slug:'b',title:'Beta',current_content:'## قضیه\n\n> [!PROOF]\n> $x^2$\n\nاثبات تمام شد. ^proof-a\n\n<script>alert(1)</script>'}
  ]);
  assert.match(garden[0].html,/data-transclusion="b"/);
  assert.match(garden[0].html,/katex/);
  assert.match(garden[0].html,/href="\/notes\/b#block-proof-a"/);
  assert.match(garden[1].html,/id="block-proof-a"/);
  assert.doesNotMatch(garden[0].html,/<script>alert/);
});

test('Transclusion cycles and missing blocks remain bounded and do not fabricate destinations',async()=>{
  const garden=await buildKnowledge([
    {slug:'a',title:'Alpha',current_content:'![[Beta]]'},
    {slug:'b',title:'Beta',current_content:'![[Alpha]]\n\n[[Alpha#^missing]]'}
  ]);
  assert.ok(garden.every(note=>note.html.length<20000));
  assert.doesNotMatch(garden[1].html,/href="\/notes\/a#block-missing"/);
  assert.ok(garden[1].html.includes('موجود نیست'));
});

test('Private preview expands public transclusions without adding private notes to the graph',async()=>{
  const {renderNote}=await import('../../frontend/src/lib/markdown.mjs');
  const garden=await buildKnowledge([{slug:'public',title:'عمومی',current_content:'## تعریف\n$x^2$'}]);
  const preview=await renderNote('متن خصوصی\n\n![[عمومی]]',garden);
  assert.match(preview,/data-transclusion="public"/);
  assert.match(preview,/katex/);
  assert.equal(garden.length,1);
  assert.doesNotMatch(garden[0].html,/متن خصوصی/);
});
