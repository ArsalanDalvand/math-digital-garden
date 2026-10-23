import test from 'node:test';
import assert from 'node:assert/strict';

test('returning to editor hides reading copy and exposes the private version indicator', async () => {
  const {activateEditor}=await import('../../frontend/src/lib/reading-mode.mjs');
  const article={hidden:false};const panel={hidden:true};const indicator={textContent:'نسخهٔ رسمی'};
  activateEditor({article,panel,indicator});
  assert.equal(article.hidden,true);assert.equal(panel.hidden,false);
  assert.equal(indicator.textContent,'ویرایش نسخهٔ شخصی');
});
test('editor activation tolerates a missing version indicator', async () => {
  const {activateEditor}=await import('../../frontend/src/lib/reading-mode.mjs');
  const article={hidden:false};const panel={hidden:true};
  assert.doesNotThrow(()=>activateEditor({article,panel,indicator:null}));
  assert.equal(article.hidden,true);
});
