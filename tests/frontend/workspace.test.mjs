import test from 'node:test';
import assert from 'node:assert/strict';

test('Editor changes preserve untouched mixed line endings, math and callouts byte-for-byte', async()=>{
  const {applyRawChanges}=await import('../../frontend/src/lib/editor.mjs');
  const raw='---\r\ntags: [ریاضی]\n---\r\n> [!PROOF]\n> $\\frac{a}{b}$\r\nپایان';
  const normalized=raw.replace(/\r\n|\r/g,'\n');
  const at=normalized.indexOf('پایان');
  assert.equal(applyRawChanges(raw,[{from:at,to:at+5,insert:'اصلاح'}]),raw.replace('پایان','اصلاح'));
  assert.equal(applyRawChanges(raw,[]),raw);
});

test('Editor keeps leading YAML outside the writing surface and preserves raw line endings',async()=>{
  const {splitEditorMarkdown,replaceEditorFrontmatter,applyRawChanges}=await import('../../frontend/src/lib/editor.mjs');
  const raw='---\r\ntitle: Old\r\ntags: [ریاضی]\r\n---\r\n# عنوان\r\n\r\n> [!PROOF]\r\n> $x^2$';
  const {frontmatter,body}=splitEditorMarkdown(raw);
  assert.equal(frontmatter,'---\r\ntitle: Old\r\ntags: [ریاضی]\r\n---\r\n');
  assert.equal(body,'# عنوان\r\n\r\n> [!PROOF]\r\n> $x^2$');
  assert.equal(frontmatter+applyRawChanges(body,[{from:2,to:7,insert:'تازه'}]),raw.replace('عنوان','تازه'));
  assert.equal(replaceEditorFrontmatter(raw,'title: New\ntags: [ریاضی]'),'---\r\ntitle: New\r\ntags: [ریاضی]\r\n---\r\n'+body);
  assert.equal(replaceEditorFrontmatter('# بدون YAML','title: New'),'---\ntitle: New\n---\n# بدون YAML');
  assert.equal(splitEditorMarkdown('---\nmissing closing marker').body,'---\nmissing closing marker');
});

test('Autosave serializes overlapping writes and uses the last acknowledged hash',async()=>{
  const {createAutosaver}=await import('../../frontend/src/lib/editor.mjs');
  const requests=[];let release;
  const save=createAutosaver('initial',async(content,hash)=>{
    requests.push([content,hash]);
    if(content==='first')await new Promise(resolve=>release=resolve);
    return {current_hash:content};
  });
  const first=save('first');await new Promise(resolve=>setTimeout(resolve,0));
  const second=save('second');release();await Promise.all([first,second]);
  assert.deepEqual(requests,[['first','initial'],['second','first']]);
});

test('Autosave stops after a conflict; later edits cannot overwrite the remote version',async()=>{
  const {createAutosaver}=await import('../../frontend/src/lib/editor.mjs');let calls=0;
  const save=createAutosaver('base',async()=>{calls++;throw Object.assign(new Error('409'),{status:409});});
  await assert.rejects(save('one'));
  await assert.rejects(save('two'));
  assert.equal(calls,1);
});

test('Autosave can retry a transient failure with the last acknowledged hash',async()=>{
  const {createAutosaver}=await import('../../frontend/src/lib/editor.mjs');
  const calls=[];
  const save=createAutosaver('base',async(content,hash)=>{
    calls.push([content,hash]);
    if(calls.length===1)throw Object.assign(new Error('Unavailable'),{status:503});
    return {current_hash:'saved'};
  });
  await assert.rejects(save('first'));
  await save('second');
  assert.deepEqual(calls,[['first','base'],['second','base']]);
});

test('GeoGebra accepts bounded YAML and preserves invalid blocks as readable code',async()=>{
  const {renderMarkdown}=await import('../../frontend/src/lib/markdown.mjs');
  const raw='```geogebra\nappName: graphing\nheight: 450\ncommands:\n  - "f(x)=x^2"\ncaption: "رسم تابع"\n```';
  const html=await renderMarkdown(raw);
  assert.match(html,/data-geogebra=/);
  assert.match(html,/بارگذاری رسم تعاملی/);
  assert.match(html,/رسم تابع/);
  const invalid=await renderMarkdown('```geogebra\nheight: 999999\ncommands: bad\n```');
  assert.doesNotMatch(invalid,/data-geogebra=/);
  assert.match(invalid,/999999/);
});
