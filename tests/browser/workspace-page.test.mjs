import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.WORKSPACE_PLAYWRIGHT || 'playwright');
const base=process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:4337';
async function fixture(t, workspace={forks:[],bookmarks:[]}, proposals=[]) {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.route('**/api/workspace',route=>route.fulfill({json:workspace}));
  await page.route('**/api/proposals',route=>route.fulfill({json:proposals}));
  await page.goto(base+'/workspace');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-workspace-feedback], [data-proposals-feedback]')].every(el=>el.textContent.includes('دریافت شدند.')));
  return page;
}
test('Bookmarks open canonical text; personal forks retain their personal route',async t=>{
  const page=await fixture(t,{forks:[{id:1,slug:'حد تابع',title:'نسخهٔ من'}],bookmarks:[{slug:'حد تابع',title:'متن رسمی'}]});
  assert.equal(await page.locator('[data-bookmarks] a').getAttribute('href'),'/notes/'+encodeURIComponent('حد تابع'));
  assert.equal(await page.locator('[data-forks] a').getAttribute('href'),'/notes/'+encodeURIComponent('حد تابع')+'?personal=1');
});
test('Proposal statuses are readable Persian labels including unknown values',async t=>{
  const page=await fixture(t,undefined,['pending','approved','rejected','changes_requested','future'].map(status=>({slug:'limits',status})));
  assert.deepEqual(await page.locator('[data-proposals] li').allTextContents(),['limits — در انتظار بررسی','limits — تأیید شده','limits — رد شده','limits — نیازمند بازنگری','limits — وضعیت نامشخص']);
});
test('Every empty section explains its next step',async t=>{
  const page=await fixture(t);
  for(const section of ['forks','bookmarks','proposals']) assert.equal(await page.locator('[data-'+section+'-empty]').isVisible(),true);
  assert.match(await page.locator('[data-forks-empty]').textContent(),/ویرایش/);
  assert.equal(await page.locator('[data-forks-empty] a').getAttribute('href'),'/search');
});
test('Endpoint errors expose retry independently of pending endpoints and recover without duplicates',async t=>{
  const page=await fixture(t);
  let release;
  await page.route('**/api/proposals',route=>new Promise(resolve=>{release=async()=>{await route.fulfill({json:[]});resolve();};}));
  await page.route('**/api/workspace',route=>route.fulfill({status:503,json:{detail:'خطای شبکه'}}));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('[data-workspace-retry]')?.hidden===false);
  assert.match(await page.locator('[data-workspace-feedback]').textContent(),/خطای شبکه/);
  assert.equal(await page.locator('[data-proposals-feedback]').getAttribute('role'),'status');
  assert.equal(await page.locator('[data-proposals-retry]').isDisabled(),true);
  await release();
  await page.route('**/api/workspace',route=>route.fulfill({json:{forks:[{id:1,slug:'limits',title:'حد'}],bookmarks:[]}}));
  await page.locator('[data-workspace-retry]').click();
  await page.locator('[data-forks] a').waitFor();
  assert.equal(await page.locator('[data-forks] a').count(),1);
  assert.equal(await page.locator('[data-workspace-retry]').isVisible(),false);
});
test('History provides loading, retry, empty state, close/focus controls and safe raw text',async t=>{
  const page=await fixture(t,{forks:[{id:1,slug:'limits',title:'حد'}],bookmarks:[]});
  let release;
  await page.route('**/api/workspace/forks/1/history',route=>new Promise(resolve=>{release=async()=>{await route.fulfill({status:503,json:{detail:'خطای تاریخچه'}});resolve();};}));
  const trigger=page.getByRole('button',{name:'تاریخچهٔ حد',exact:true});
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-controls'),'workspace-history');
  assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('[data-history]').getAttribute('aria-busy'),'true');
  assert.match(await page.locator('[data-history-status]').textContent(),/در حال دریافت/);
  await release();
  await page.getByRole('button',{name:'تلاش دوباره برای تاریخچه'}).waitFor();
  assert.match(await page.locator('[data-history-status]').textContent(),/خطای تاریخچه/);
  await page.route('**/api/workspace/forks/1/history',route=>route.fulfill({json:[]}));
  await page.getByRole('button',{name:'تلاش دوباره برای تاریخچه'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-history-status]')?.textContent.includes('هنوز'));
  await page.getByRole('button',{name:'بستن تاریخچه'}).click();
  assert.equal(await page.locator('[data-history]').isVisible(),false);
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  const raw='> [!PROOF]\r\n> $x^2$\n<script>not executable</script>';
  await page.route('**/api/workspace/forks/1/history',route=>route.fulfill({json:[{created_at:'2026-01-01T00:00:00Z',content:raw}]}));
  await trigger.click();
  await page.locator('[data-revisions] summary').click();
  assert.equal(await page.locator('[data-revisions] pre').textContent(),raw);
  assert.equal(await page.locator('[data-revisions] script').count(),0);
});

test('Removing the last bookmark updates its empty state and disables repeated requests',async t=>{
 const page=await fixture(t,{forks:[],bookmarks:[{slug:'limits',title:'حد'}]});
 let release;
 await page.route('**/api/workspace/bookmarks/limits',route=>new Promise(resolve=>{release=async()=>{await route.fulfill({status:204});resolve();};}));
 const remove=page.getByRole('button',{name:'حذف نشانه',exact:true});
 await remove.click();
 assert.equal(await remove.isDisabled(),true);
 assert.equal(await remove.getAttribute('aria-busy'),'true');
 await release();
 await page.waitForFunction(()=>document.querySelector('[data-bookmarks-empty]')?.hidden===false);
 assert.equal(await page.locator('[data-bookmarks] li').count(),0);
});
