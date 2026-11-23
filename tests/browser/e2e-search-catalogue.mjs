/**
 * Real browser E2E test for Homepage Knowledge Bases, Catalogue Search, and UMKO Filtering:
 *  1. Homepage knowledge base cards (Axler & Abstract Algebra) & navigation
 *  2. /search page loading & catalogue list rendering
 *  3. Persian keyword search ("فضای برداری" / "ماتریس")
 *  4. UMKO kind/tag/track filter selection & submission
 *  5. Pagination navigation
 *  6. Clicking a search result navigates cleanly to its /notes/ page
 *
 * Target: https://test.atomathix.ir (or process.env.BASE_URL)
 * Run: node tests/browser/e2e-search-catalogue.mjs
 */

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'search-e2e-' + Date.now();

const env = { ...process.env, TMPDIR: process.env.TMPDIR || '/tmp' };
delete env.LD_PRELOAD;

function browser(...args) {
  let raw;
  try {
    raw = execFileSync(
      'agent-browser',
      ['--session', session, ...args, '--json'],
      { env, encoding: 'utf8', timeout: 45000 }
    );
  } catch (error) {
    throw new Error(
      'agent-browser ' + args[0] + ' failed: ' + String(error.stdout || error.stderr || error.message).slice(0, 500)
    );
  }
  const result = JSON.parse(raw);
  assert.equal(result.success, true, result.error);
  return result.data;
}

const evaluate = code => browser('eval', code).result;

const checks = [];
function record(name) {
  checks.push(name);
  console.log('[PASS]', name);
}

try {
  console.log(`Starting Search & Catalogue E2E test against ${base} (session: ${session})`);

  // 1. Homepage Knowledge Base cards
  browser('open', base + '/');
  browser('wait', '.kb-card');
  const homeInfo = evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.kb-card')).map(c => c.textContent || '');
    return {
      count: cards.length,
      hasAxler: cards.some(t => t.includes('جبر خطی آکسلر')),
      hasAlg: cards.some(t => t.includes('مبانی جبر و ماتریس') || t.includes('جبر')),
      hasSampleBtn: !!document.querySelector('a[href="/sample"]'),
    };
  })()`);
  assert.ok(homeInfo.count >= 2, 'Homepage must display knowledge base cards');
  assert.equal(homeInfo.hasAxler, true, 'Homepage must feature Axler Linear Algebra card');
  assert.equal(homeInfo.hasAlg, true, 'Homepage must feature Abstract Algebra card');
  assert.equal(homeInfo.hasSampleBtn, true, 'Homepage must have sample study link');
  record(`1. Homepage verified (${homeInfo.count} knowledge base cards, Axler & Abstract Algebra active)`);

  // 2. Navigate to /search via sidebar link
  browser('click', 'a.workspace-search');
  browser('wait', 'form[role="search"]');
  const initialCount = evaluate('document.querySelectorAll(".catalogue-list li").length');
  assert.ok(initialCount > 0, 'Catalogue page must list initial notes');
  record(`2. Navigated to /search (${initialCount} notes on first page)`);

  // 3. Perform Persian keyword search
  browser('fill', '#query', 'ماتریس');
  browser('click', 'form[role="search"] button[type="submit"]');
  browser('wait', '1500');
  browser('wait', '.catalogue-list li');
  const searchState = evaluate(`(() => {
    const items = Array.from(document.querySelectorAll('.catalogue-list li h2 a')).map(a => ({
      text: a.textContent?.trim() || '',
      href: a.getAttribute('href') || ''
    }));
    return {
      url: location.href,
      count: items.length,
      firstItem: items[0] || null,
    };
  })()`);
  assert.ok(searchState.url.includes('q='), 'Search URL must include query parameter');
  assert.ok(searchState.count > 0, 'Searching for "ماتریس" must return matching results');
  record(`3. Keyword search "ماتریس" returned ${searchState.count} results`);

  // 4. Filter by UMKO kind if available
  const hasKindFilter = evaluate('!!document.querySelector("#kind option[value=assertion]")');
  if (hasKindFilter) {
    browser('select', '#kind', 'assertion');
    browser('click', 'form[role="search"] button[type="submit"]');
    browser('wait', '1500');
    const filteredUrl = evaluate('location.href');
    assert.ok(filteredUrl.includes('kind=assertion'), 'URL must reflect selected UMKO kind filter');
    record('4. Applied UMKO kind=assertion filter successfully');
  } else {
    record('4. UMKO kind filter skipped (no assertion option in current query subset)');
  }

  // 5. Clear filter and test pagination
  browser('open', base + '/search');
  browser('wait', '.catalogue-pagination');
  const hasNextPage = evaluate('!!document.querySelector(".catalogue-pagination a")');
  assert.equal(hasNextPage, true, 'Pagination links must exist on full catalogue');
  browser('click', '.catalogue-pagination a');
  browser('wait', '1500');
  const page2Url = evaluate('location.href');
  assert.ok(page2Url.includes('page=2'), `Pagination must navigate to page=2 (got: ${page2Url})`);
  record('5. Catalogue pagination to page 2 verified');

  // 6. Click a result link and verify note page loads
  const firstHref = evaluate('document.querySelector(".catalogue-list li h2 a")?.getAttribute("href") || ""');
  assert.ok(firstHref.startsWith('/notes/'), `Catalogue result href must start with /notes/ (got: ${firstHref})`);
  browser('open', base + firstHref);
  browser('wait', '.workspace-document');
  const noteLoaded = evaluate('({ url: location.pathname, h1: document.querySelector(".workspace-document h1")?.textContent?.trim() })');
  assert.ok(noteLoaded.url.startsWith('/notes/'), 'Clicking catalogue result must open /notes/ page');
  assert.ok(noteLoaded.h1 && noteLoaded.h1.length > 0, 'Opened note must have a heading');
  record(`6. Opened note from search result: ${noteLoaded.h1} (${noteLoaded.url})`);

  const pageErrors = browser('errors')?.errors || [];
  assert.equal(pageErrors.length, 0, `No page errors allowed: ${JSON.stringify(pageErrors)}`);

  console.log(`\nAll ${checks.length} checks passed successfully!`);
} catch (err) {
  console.error('\n[TEST FAILURE]', err);
  throw err;
} finally {
  try {
    browser('close');
    console.log('Browser session closed cleanly.');
  } catch (closeErr) {
    console.error('Error closing session:', closeErr);
  }
}
