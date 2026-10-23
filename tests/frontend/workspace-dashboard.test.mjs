import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = '../../frontend/src/scripts/workspace-model.mjs';
test('Workspace loads each owner endpoint independently and reports pending, empty and error without fallback data', async () => {
  const {loadWorkspace} = await import(moduleUrl);
  const changes = [], calls = [];
  let release;
  const pending = new Promise(resolve => release = resolve);
  const loading = loadWorkspace(async path => {
    calls.push(path);
    if(path === '/workspace') return pending;
    throw Object.assign(new Error('Service unavailable'), {status:503});
  }, (section, state) => changes.push([section, state]));
  assert.deepEqual(changes.map(([section, state]) => [section, state.state]), [['workspace','loading'],['proposals','loading']]);
  release({forks:[], bookmarks:[]});
  const result = await loading;
  assert.deepEqual(calls, ['/workspace','/proposals']);
  assert.deepEqual(result.workspace, {state:'ready',data:{forks:[],bookmarks:[]}});
  assert.equal(result.proposals.state, 'error');
  assert.equal(result.proposals.error.status, 503);
  assert.equal(result.proposals.data, undefined);
  assert.equal(changes.length, 4);
});
test('Workspace filters returned titles/slugs and proposal status without changing source data', async () => {
  const {filterWorkspace} = await import(moduleUrl);
  const data = {forks:[{slug:'limits',title:'حد تابع'}], bookmarks:[{slug:'sets',title:'مجموعه‌ها'}], proposals:[{slug:'limits',status:'pending'},{slug:'sets',status:'approved'}]};
  const before = JSON.stringify(data);
  assert.deepEqual(filterWorkspace(data, '  LIMITS ', 'pending'), {forks:data.forks,bookmarks:[],proposals:[data.proposals[0]]});
  assert.equal(filterWorkspace(data, 'حد', 'all').forks.length, 1);
  assert.equal(filterWorkspace(data, '', 'rejected').proposals.length, 0);
  assert.equal(JSON.stringify(data), before);
});
