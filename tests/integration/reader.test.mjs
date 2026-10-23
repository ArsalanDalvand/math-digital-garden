import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const graphRequire = createRequire(require.resolve('starlight-site-graph'));
const { parseDocument, DomUtils } = await import(graphRequire.resolve('htmlparser2'));
const { App } = await import(require.resolve('astro/app'));
const server = new URL('../../frontend/dist/server/', import.meta.url);
const file = (await readdir(server)).find((name) => /^manifest_.*\.mjs$/.test(name));
assert.ok(file, 'Run pnpm build before pnpm test:reader');
const { manifest } = await import(new URL(file, server));
const { renderers } = await import(new URL('renderers.mjs', server));
Object.assign(manifest, {
  pageMap: new Map([
    ['src/pages/notes/[slug].astro', () => import(new URL('pages/notes/_slug_.astro.mjs', server))],
    ['src/pages/account.astro', () => import(new URL('pages/account.astro.mjs', server))],
    ['src/pages/workspace.astro', () => import(new URL('pages/workspace.astro.mjs', server))],
    ['src/pages/review.astro', () => import(new URL('pages/review.astro.mjs', server))],
    ['src/pages/api/[...path].ts', () => import(new URL('pages/api/_---path_.astro.mjs', server))],
    ['src/pages/api/preview.ts', () => import(new URL('pages/api/preview.astro.mjs', server))],
    ['src/pages/search.astro', () => import(new URL('pages/search.astro.mjs', server))],
  ]),
  serverIslandMap: new Map(),
  renderers,
  actions: () => import(new URL('noop-entrypoint.mjs', server)),
  middleware: () => import(new URL('_astro-internal_middleware.mjs', server)),
});
const app = new App(manifest);
const raw = await readFile(new URL('../fixtures/cantor.md', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('Database note renders through the built SSR route', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('?')) return Response.json([{slug:'cantor', title:'کانتور', current_content:raw}]);
    assert.match(String(url), /\/api\/notes\/cantor$/);
    return Response.json({ title: '</title><img onerror=alert(1)>', current_content: raw });
  };
  const response = await app.render(new Request('http://test/notes/cantor'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /نسخهٔ رسمی/);
  assert.match(html, /katex-display/);
  assert.match(html, /<details/);
  assert.match(html, /dir="rtl"/);
  const document = parseDocument(html);
  assert.equal(DomUtils.findAll(node=>node.name === 'img' && 'onerror' in node.attribs, document.children).length, 0);
  assert.match(html, /<title>&lt;\/title&gt;&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<title><\/title>/);
});

test('Missing notes return a readable 404 page', async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });
  const response = await app.render(new Request('http://test/notes/missing'));
  assert.equal(response.status, 404);
  assert.match(await response.text(), /یادداشت پیدا نشد/);
});

test('Unavailable API returns a readable 503 without disclosing internal errors', async () => {
  globalThis.fetch = async () => { throw new Error('private connection details'); };
  const response = await app.render(new Request('http://test/notes/cantor'));
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /دریافت یادداشت موقتاً/);
  assert.doesNotMatch(html, /private connection details/);
});

test('Malformed API payload returns a readable 503', async () => {
  globalThis.fetch = async () => Response.json({ title: 123, current_content: null });
  const response = await app.render(new Request('http://test/notes/cantor'));
  assert.equal(response.status, 503);
});

test('Invalid slug is rejected without calling the API', async () => {
  globalThis.fetch = async () => { assert.fail('Invalid slug must not reach API'); };
  const response = await app.render(new Request('http://test/notes/bad%20slug'));
  assert.equal(response.status, 404);
});


test('SSR renders aliases, backlinks, tags, TOC and safe destination previews',async()=>{
  const source={slug:'one',title:'مبدأ',current_content:'---\ntags: [ریاضی]\n---\n## بخش اول\n[[مقصد|پیوند]]',book_slug:'math',chapter_slug:'sets'};
  const target={slug:'two',title:'مقصد',current_content:'## تعریف\n$x^2$ <script>alert(1)</script>',book_slug:'math',chapter_slug:'sets'};
  globalThis.fetch=async(url)=>Response.json(String(url).includes('?') ? [source,target] : source);
  const response=await app.render(new Request('http://test/notes/one'));
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/href="\/notes\/two"/);
  assert.match(html,/پیش‌نمایش مقصد/);
  assert.match(html,/katex/);
  assert.match(html,/href="#بخش-اول"/);
  assert.match(html,/name="q"/);
  assert.match(html,/starlight-theme-select/);
  assert.doesNotMatch(html,/<script>alert/);
});

test('SSR publishes the ready-made graph and inert safe inline-preview templates',async()=>{
  const source={slug:'one',title:'مبدأ',current_content:'[[مقصد]]'};
  const target={slug:'two',title:'مقصد',current_content:'## تعریف\n$x^2$ <img src=x onerror=alert(1)>'};
  globalThis.fetch=async(url)=>Response.json(String(url).includes('?') ? [source,target] : source);
  const response=await app.render(new Request('http://test/notes/one'));
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html, /<graph-component[^>]*data-sitemap=/);
  assert.match(html, /data-note-preview="two"/);
  assert.match(html, /<template[^>]*data-preview-slug="two"/);
  assert.match(html, /popover="auto"/);
  assert.match(html, /role="dialog"/);
  assert.doesNotMatch(html, /<img src=x onerror/);
});


test('live search passes Persian query to API and filters frontmatter tags',async()=>{
  globalThis.fetch=async(url)=>{
    assert.equal(new URL(url).searchParams.get('q'),'مجموعه');
    return Response.json([
      {slug:'one',title:'مجموعه اول',current_content:'---\ntags: [مبانی]\n---\nمتن'},
      {slug:'two',title:'مجموعه دوم',current_content:'---\ntags: [پیشرفته]\n---\nمتن'},
    ]);
  };
  const response=await app.render(new Request('http://test/search?q='+encodeURIComponent('مجموعه')+'&tag='+encodeURIComponent('مبانی')));
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/مجموعه اول/);
  assert.doesNotMatch(html,/مجموعه دوم/);
  assert.match(html,/۱ یادداشت/);
});

test('search empty, unavailable and invalid inputs have readable responses',async()=>{
  globalThis.fetch=async()=>Response.json([]);
  let response=await app.render(new Request('http://test/search?q=unknown'));
  assert.equal(response.status,200);
  assert.match(await response.text(),/یادداشتی پیدا نشد/);
  globalThis.fetch=async()=>new Response(null,{status:503});
  response=await app.render(new Request('http://test/search'));
  assert.equal(response.status,503);
  globalThis.fetch=async()=>assert.fail('Invalid query must not reach API');
  response=await app.render(new Request('http://test/search?q='+'x'.repeat(201)));
  assert.equal(response.status,400);
});


test('Account, workspace and review are available without exposing private SSR data',async()=>{
  for(const [path,title] of [['/account','حساب کاربری'],['/workspace','جزوه‌های من'],['/review','بازبینی']]){
    const response=await app.render(new Request('http://test'+path));
    assert.equal(response.status,200);
    assert.match(await response.text(),new RegExp(title));
  }
});

test('Reader exposes editor, formula input and citation chat controls',async()=>{
  globalThis.fetch=async(url)=>Response.json(String(url).includes('?') ? [{slug:'cantor',title:'کانتور',current_content:raw}] : {slug:'cantor',title:'کانتور',current_content:raw});
  const response=await app.render(new Request('http://test/notes/cantor'));
  const html=await response.text();
  assert.match(html,/data-workspace-note="cantor"/);
  assert.match(html,/ویرایش نسخهٔ شخصی/);
  assert.match(html,/data-chat-form/);
});

test('Node adapter retains the configured local Host for CSRF and ignores untrusted hosts',async()=>{
  const {NodeApp}=await import(require.resolve('astro/app/node'));
  const request=NodeApp.createRequest({method:'GET',url:'/api/auth/me',headers:{host:'127.0.0.1:4323'},socket:{}},{allowedDomains:manifest.allowedDomains});
  assert.equal(new URL(request.url).origin,'http://127.0.0.1:4323');
  const hostile=NodeApp.createRequest({method:'GET',url:'/api/auth/me',headers:{host:'evil.invalid'},socket:{}},{allowedDomains:manifest.allowedDomains});
  assert.notEqual(new URL(hostile.url).hostname,'evil.invalid');
});

test('Excalidraw fonts are included in the Astro static deployment',async()=>{
 const fonts=new URL('../../frontend/dist/client/excalidraw/fonts/Excalifont/',import.meta.url);
 assert.ok((await readdir(fonts)).some(name=>name.endsWith('.woff2')));
});

test('Built Astro route renders native compressed Obsidian drawings without a PNG export',async()=>{
 const LZ=require('lz-string');
 const drawing='---\nexcalidraw-plugin: parsed\n---\n## Drawing\n```compressed-json\n'+LZ.compressToBase64(JSON.stringify({type:'excalidraw',elements:[{id:'r',type:'rectangle',x:0,y:0,width:20,height:30}],appState:{},files:{}}))+'\n```';
 const note={slug:'native',title:'Drawing.excalidraw',current_content:drawing};
 globalThis.fetch=async url=>Response.json(String(url).includes('?') ? [note] : note);
 const response=await app.render(new Request('http://test/notes/native'));
 assert.equal(response.status,200);
 const html=await response.text();assert.match(html,/data-excalidraw=/);assert.doesNotMatch(html,/compressed-json/);
});
