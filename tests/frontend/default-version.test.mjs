import test from 'node:test';import assert from 'node:assert/strict';
import {preferredVersion} from '../../frontend/src/lib/default-version.mjs';
test('existing owner fork is default except explicit canonical',()=>{assert.equal(preferredVersion({custom_content:'mine'},''),'personal');assert.equal(preferredVersion({custom_content:'mine'},'?version=canonical'),'canonical');assert.equal(preferredVersion(null,''),'canonical');});
 test('empty personal text is still a real fork',()=>assert.equal(preferredVersion({custom_content:''},''),'personal'));
 test('legacy personal query remains supported',()=>assert.equal(preferredVersion(null,'?personal=1'),'personal'));
 test('owner version load must not replace a newer user action',()=>{assert.equal(preferredVersion({custom_content:'mine'},'',true),'unchanged');});
 test('auto owner load is bound after editor click and version handlers',async()=>{const {readFileSync}=await import('node:fs');const s=readFileSync(new URL('../../frontend/src/scripts/workspace-note.ts',import.meta.url),'utf8');assert.match(s,/preferredVersion/);assert.match(s,/userInteracted/);});
 test('entering edit before the personal preview resolves preserves the loaded owner draft',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../frontend/src/scripts/workspace-note.ts',import.meta.url),'utf8');
  const selection=source.match(/      if\(visibleRaw!==undefined\)[^\n]+/)[0];
  const choose=new Function('raw','visibleRaw','canonical','readingOriginal',selection+';return raw;');
  assert.equal(choose('existing owner draft',undefined,'public original',false),'existing owner draft');
  assert.equal(choose('',undefined,'public original',false),'');
  assert.equal(choose('existing owner draft',undefined,'public original',true),'public original');
  assert.equal(choose('existing owner draft','visible personal','public original',false),'visible personal');
 });
