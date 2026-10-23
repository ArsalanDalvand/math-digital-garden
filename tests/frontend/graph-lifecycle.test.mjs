import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const ts = require('typescript');
const source = () => readFileSync(new URL('../../frontend/src/components/NoteGraph.astro', import.meta.url), 'utf8');

test('reader graph keeps the upstream renderer inert until explicitly requested', () => {
  const markup = source();
  assert.doesNotMatch(markup, /import \{ Graph \} from/);
  assert.match(markup, /<template[^>]*data-graph-template/);
  assert.match(markup, /<button[^>]*data-load-graph/);
  assert.match(markup, /role="status"[^>]*data-graph-status/);
});

test('graph load is deferred, deduplicated while pending, and retryable after import failure', async () => {
  const markup = source();
  const script = markup.match(/<script>([\s\S]*?)<\/script>/)[1];
  const js = ts.transpile(script.replace(/import\(['"][^'"]+graph-component['"]\)/, 'loadModule()'), { target: ts.ScriptTarget.ES2022 });
  let click, calls = 0, reject, resolve;
  const button = { disabled: false, hidden: false, setAttribute() {}, removeAttribute() {}, addEventListener(name, fn) { if (name === 'click') click = fn; } };
  const status = { textContent: '' };
  const graph = { style: {}, dataset: {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
  const template = { content: { cloneNode: () => ({}) } };
  const host = { isConnected: true, querySelector: selector => selector === '[data-load-graph]' ? button : selector === '[data-graph-status]' ? status : selector === '[data-graph-template]' ? template : graph, append() {} };
  const definitions = new Map();
  vm.runInNewContext(js, {
    document: { querySelectorAll: () => [host], addEventListener() {} },
    customElements: { get: key => definitions.get(key), define: (key, value) => definitions.set(key, value) },
    MutationObserver: class { observe() {} disconnect() {} },
    loadModule: () => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    queueMicrotask, WeakSet, setTimeout() {},
  });
  assert.equal(calls, 0);
  assert.equal(typeof click, 'function');
  const first = click();
  await click();
  assert.equal(calls, 1);
  reject(new Error('offline'));
  await first;
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /دوباره/);
  const retry = click();
  assert.equal(calls, 2);
  resolve({ GraphComponent: class {} });
  await retry;
  assert.equal(button.hidden, true);
});

test('graph restores regenerated action focus after upstream mutation observers finish', () => {
  assert.match(source(), /setTimeout\(\(\) => \{/);
});

test('a reader removed during graph import does not activate a detached renderer', async () => {
  const script = source().match(/<script>([\s\S]*?)<\/script>/)[1];
  const js = ts.transpile(script.replace(/import\(['"][^'"]+graph-component['"]\)/, 'loadModule()'), { target: ts.ScriptTarget.ES2022 });
  let click, resolve, activated = 0;
  const button = { setAttribute() {}, removeAttribute() {}, addEventListener(_, fn) { click = fn; } };
  const host = { isConnected: true, querySelector: selector => selector === '[data-load-graph]' ? button : { textContent: '', content: { cloneNode() { activated++; } } }, append() { activated++; } };
  vm.runInNewContext(js, { document: { querySelectorAll: () => [host], addEventListener() {} }, customElements: { get() {}, define() { activated++; } }, loadModule: () => new Promise(yes => { resolve = yes; }), MutationObserver: class {}, WeakSet, setTimeout() {} });
  const pending = click();
  host.isConnected = false;
  resolve({ GraphComponent: class {} });
  await pending;
  assert.equal(activated, 0);
});
