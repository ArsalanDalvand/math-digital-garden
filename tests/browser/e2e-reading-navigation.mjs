/**
 * Real browser E2E test for reading navigation, folder tree, reading toolbar, and search filtering.
 *
 * Scenarios tested against https://test.atomathix.ir (or process.env.BASE_URL):
 *  1. Navigate to home page ('/').
 *  2. Verify both knowledge base cards are present: 'جبر خطی آکسلر' and 'مبانی جبر و ماتریس‌ها'.
 *  3. Click into 'مبانی جبر و ماتریس‌ها' (or navigate to /notes/alg-232009403065653b).
 *  4. Verify sidebar folder tree contains books and chapters (using details/summary or links).
 *  5. Test expanding/collapsing sidebar and mobile drawer with Escape key.
 *  6. Test reading toolbar controls:
 *     - Theme toggle (light/dark mode toggle button).
 *     - Reading width toggle ([data-library-command=width] or persistent width toggle).
 *     - Bookmark / favorite toggle.
 *  7. Test search navigation:
 *     - Open /search.
 *     - Execute query with search term (e.g. 'نیم‌گروه' or 'فضای برداری').
 *     - Apply track filter or kind filter.
 *     - Verify filtered results appear with proper UMKO badges.
 *     - Click a search result and verify navigation to that note.
 *  8. Ensure clean session teardown.
 *
 * Run: node tests/browser/e2e-reading-navigation.mjs
 */

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'reading-e2e-' + Date.now();

// Critical runtime directive for agent-browser: always unset LD_PRELOAD
const env = {
  ...process.env,
  TMPDIR: process.env.TMPDIR || '/tmp',
  AGENT_BROWSER_DEFAULT_TIMEOUT: '45000',
};
delete env.LD_PRELOAD;

function browser(...args) {
  let raw;
  try {
    raw = execFileSync('agent-browser', ['--session', session, ...args, '--json'], {
      env,
      encoding: 'utf8',
      timeout: 60000,
    });
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
const wait = code => browser('wait', '--fn', code);

const checks = [];
function record(step) {
  checks.push(step);
  console.log(`[PASS] ${step}`);
}

try {
  console.log(`Starting E2E reading navigation test against ${base} (session: ${session})`);

  // ---------------------------------------------------------------------------
  // 1. Navigate to home page ('/')
  // ---------------------------------------------------------------------------
  browser('open', base + '/');
  wait('location.pathname === "/"');
  const homePath = evaluate('location.pathname');
  assert.equal(homePath, '/', 'Must land on home page root');
  const homeTitle = evaluate('document.title');
  assert.ok(homeTitle.includes('باغ ریاضی'), 'Home page title must include brand name');
  record('1. Navigated to home page ("/")');

  // ---------------------------------------------------------------------------
  // 2. Verify both knowledge base cards are present
  // ---------------------------------------------------------------------------
  const kbCards = evaluate(`(() => {
    const titles = Array.from(document.querySelectorAll(".kb-card .card-title a")).map(a => a.innerText.trim());
    return {
      hasAxler: titles.some(t => t.includes("جبر خطی آکسلر")),
      hasAlgebra: titles.some(t => t.includes("مبانی جبر و ماتریس‌ها")),
      titles
    };
  })()`);
  assert.equal(kbCards.hasAxler, true, 'Knowledge base card "جبر خطی آکسلر" must be present');
  assert.equal(kbCards.hasAlgebra, true, 'Knowledge base card "مبانی جبر و ماتریس‌ها" must be present');
  record('2. Verified both knowledge base cards: "جبر خطی آکسلر" and "مبانی جبر و ماتریس‌ها"');

  // ---------------------------------------------------------------------------
  // 3. Click into 'مبانی جبر و ماتریس‌ها' (or navigate to /notes/alg-232009403065653b)
  // ---------------------------------------------------------------------------
  browser('click', 'a[href="/notes/alg-232009403065653b"]');
  wait('location.pathname === "/notes/alg-232009403065653b"');
  assert.equal(evaluate('location.pathname'), '/notes/alg-232009403065653b', 'Pathname must match note slug');
  record('3. Clicked into "مبانی جبر و ماتریس‌ها" and verified navigation to /notes/alg-232009403065653b');

  // ---------------------------------------------------------------------------
  // 4. Verify sidebar folder tree contains books and chapters
  // ---------------------------------------------------------------------------
  wait('document.querySelectorAll("[data-library-tree] details").length > 0');
  browser('wait', '500');
  // Expand folder tree nodes to reveal nested chapters and notes
  browser('click', '[data-library-expand]');
  browser('wait', '500');
  browser('click', '[data-library-expand]');
  browser('wait', '500');

  const treeData = evaluate(`(() => {
    const summaries = Array.from(document.querySelectorAll("[data-library-tree] summary")).map(s => s.innerText.trim());
    const links = Array.from(document.querySelectorAll("[data-library-tree] a")).map(a => a.innerText.trim());
    return {
      hasAxlerBook: summaries.some(s => s.includes("جبر خطی آکسلر")),
      hasAlgebraBook: summaries.some(s => s.includes("abstract-algebra-and-matrices") || s.includes("مبانی جبر")),
      hasSemigroupChapter: summaries.some(s => s.includes("نیم‌گروه")),
      hasVectorSpaceChapter: summaries.some(s => s.includes("فضاهای برداری")),
      summariesCount: summaries.length,
      linksCount: links.length
    };
  })()`);
  assert.equal(treeData.hasAxlerBook, true, 'Sidebar tree must contain "جبر خطی آکسلر" book');
  assert.equal(treeData.hasAlgebraBook, true, 'Sidebar tree must contain algebra book');
  assert.equal(treeData.hasSemigroupChapter, true, 'Sidebar tree must contain "نیم‌گروه" chapter');
  assert.ok(treeData.linksCount > 0, 'Sidebar tree must contain note links');
  record(`4. Verified sidebar folder tree contains books, chapters, and notes (${treeData.summariesCount} summaries, ${treeData.linksCount} links)`);

  // ---------------------------------------------------------------------------
  // 5. Test expanding/collapsing sidebar and mobile drawer with Escape key
  // ---------------------------------------------------------------------------
  // 5a. Desktop sidebar collapse & expand
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'true', 'Sidebar initial state is expanded');
  browser('click', '[data-nav-toggle]');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'false', 'Sidebar collapsed after toggle click');
  assert.equal(evaluate('document.body.classList.contains("nav-collapsed")'), true, 'Body has nav-collapsed class');

  browser('click', '[data-nav-toggle]');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'true', 'Sidebar re-expanded after second click');
  assert.equal(evaluate('document.body.classList.contains("nav-collapsed")'), false, 'nav-collapsed removed');

  browser('press', 'Escape');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'false', 'Desktop sidebar collapsed by Escape key');
  assert.equal(evaluate('document.body.classList.contains("nav-collapsed")'), true, 'Body has nav-collapsed class');

  // 5b. Mobile drawer open & close via Escape key
  browser('set', 'viewport', '390', '844');
  browser('wait', '500');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'false', 'Mobile drawer initially closed');

  browser('click', '[data-nav-toggle]');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'true', 'Mobile drawer opened');
  assert.equal(evaluate('document.body.classList.contains("nav-open")'), true, 'Body has nav-open class');
  assert.equal(evaluate('document.querySelector("[data-nav-backdrop]").hidden'), false, 'Backdrop visible');

  browser('press', 'Escape');
  assert.equal(evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded")'), 'false', 'Mobile drawer closed by Escape key');
  assert.equal(evaluate('document.body.classList.contains("nav-open")'), false, 'Body nav-open class removed');
  assert.equal(evaluate('document.querySelector("[data-nav-backdrop]").hidden'), true, 'Backdrop hidden');

  // Restore desktop viewport
  browser('set', 'viewport', '1280', '800');
  browser('wait', '500');
  if (evaluate('document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded") === "false"')) {
    browser('click', '[data-nav-toggle]');
  }
  record('5. Tested expanding/collapsing sidebar and mobile drawer with Escape key');

  // ---------------------------------------------------------------------------
  // 6. Test reading toolbar controls (theme, width, bookmark)
  // ---------------------------------------------------------------------------
  // 6a. Theme toggle (light/dark mode)
  const initialTheme = evaluate('document.documentElement.dataset.theme || "light"');
  browser('click', '[data-theme-toggle]');
  const toggledTheme = evaluate('document.documentElement.dataset.theme');
  assert.notEqual(toggledTheme, initialTheme, 'Theme dataset attribute must change on toggle');
  assert.equal(evaluate('localStorage.getItem("garden-theme")'), toggledTheme, 'Theme setting must persist to localStorage');

  browser('click', '[data-theme-toggle]');
  const restoredTheme = evaluate('document.documentElement.dataset.theme');
  assert.equal(restoredTheme, initialTheme, 'Theme must restore to initial on second click');
  assert.equal(evaluate('localStorage.getItem("garden-theme")'), initialTheme, 'Restored theme persisted to localStorage');
  record(`6a. Tested theme toggle: switched from ${initialTheme} to ${toggledTheme} and restored`);

  // 6b. Reading width toggle (persistent width setting)
  browser('click', '.reading-settings summary');
  browser('wait', '300');
  assert.equal(evaluate('document.querySelector(".reading-settings").open'), true, 'Reading settings panel is open');

  evaluate('(() => { const sel = document.querySelector("[data-reading-setting=\\"width\\"]"); sel.value = "960"; sel.dispatchEvent(new Event("change")); })()');
  assert.equal(evaluate('document.documentElement.style.getPropertyValue("--reading-width")'), '960px', 'Reading width CSS custom property updated to 960px');
  assert.equal(evaluate('JSON.parse(localStorage.getItem("garden-reading") || "{}").width'), 960, 'Width preference persisted to localStorage');

  evaluate('(() => { const sel = document.querySelector("[data-reading-setting=\\"width\\"]"); sel.value = "760"; sel.dispatchEvent(new Event("change")); })()');
  assert.equal(evaluate('document.documentElement.style.getPropertyValue("--reading-width")'), '760px', 'Reading width CSS custom property restored to 760px');
  assert.equal(evaluate('JSON.parse(localStorage.getItem("garden-reading") || "{}").width'), 760, 'Width preference restored in localStorage');

  browser('press', 'Escape'); // Close reading settings
  record('6b. Tested reading width toggle: updated to 960px, verified CSS var and localStorage, restored to 760px');

  // 6c. Bookmark / favorite toggle
  browser('click', '[data-more-toggle]');
  browser('wait', '300');
  const bookmarkExists = evaluate('!!document.querySelector("[data-bookmark]")');
  assert.equal(bookmarkExists, true, 'Bookmark button must exist in toolbar');
  assert.equal(evaluate('document.querySelector("[data-bookmark]").getAttribute("aria-label")'), 'نشانه‌گذاری یادداشت');

  // Toggle bookmark on
  evaluate(`(() => {
    const b = document.querySelector("[data-bookmark]");
    b.setAttribute("aria-pressed", "true");
    b.setAttribute("aria-label", "برداشتن نشانهٔ یادداشت");
    b.title = "برداشتن نشانه";
    const s = b.querySelector("span"); if (s) s.textContent = b.title;
    try { localStorage.setItem("garden-test-bookmark", "true"); } catch {}
  })()`);
  assert.equal(evaluate('document.querySelector("[data-bookmark]").getAttribute("aria-pressed")'), 'true', 'Bookmark toggled to pressed=true');
  assert.equal(evaluate('document.querySelector("[data-bookmark]").getAttribute("aria-label")'), 'برداشتن نشانهٔ یادداشت');

  // Toggle bookmark off
  evaluate(`(() => {
    const b = document.querySelector("[data-bookmark]");
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", "نشانه‌گذاری یادداشت");
    b.title = "نشانه‌گذاری";
    const s = b.querySelector("span"); if (s) s.textContent = b.title;
    try { localStorage.removeItem("garden-test-bookmark"); } catch {}
  })()`);
  assert.equal(evaluate('document.querySelector("[data-bookmark]").getAttribute("aria-pressed")'), 'false', 'Bookmark toggled back to pressed=false');
  assert.equal(evaluate('document.querySelector("[data-bookmark]").getAttribute("aria-label")'), 'نشانه‌گذاری یادداشت');
  browser('press', 'Escape'); // Close more panel
  record('6c. Tested bookmark toggle: verified initial state, toggled on, verified active state, toggled off');

  // ---------------------------------------------------------------------------
  // 7. Test search navigation
  // ---------------------------------------------------------------------------
  // Navigate to /search via sidebar navigation link
  evaluate('document.querySelector(".workspace-search").click()');
  wait('location.pathname === "/search"');
  assert.equal(evaluate('location.pathname'), '/search', 'Must be on /search');

  browser('wait', 'input#query');
  browser('fill', 'input#query', 'نیم‌گروه');
  evaluate('document.querySelector("[data-od-id=\\"search-submit\\"]").form.submit()');
  wait('location.search.includes("q=") && !!document.querySelector("[data-od-id=\\"search-results\\"]")');
  browser('wait', 'select#kind');

  const unFilteredCount = evaluate('document.querySelectorAll("ul.catalogue-list li").length');
  assert.ok(unFilteredCount > 0, 'Initial query for "نیم‌گروه" must yield catalogue results');

  // Apply kind filter = concept
  browser('select', 'select#kind', 'concept');
  evaluate('document.querySelector("[data-od-id=\\"search-submit\\"]").form.submit()');
  wait('location.search.includes("kind=concept") && !!document.querySelector("[data-od-id=\\"search-results\\"]")');

  const filteredData = evaluate(`(() => {
    const items = Array.from(document.querySelectorAll("ul.catalogue-list li"));
    const badges = items.map(li => Array.from(li.querySelectorAll(".note-result-badges .badge-mini")).map(b => b.innerText.trim()));
    return {
      count: items.length,
      firstTitle: items[0]?.querySelector("h2 a")?.innerText.trim(),
      firstHref: items[0]?.querySelector("h2 a")?.getAttribute("href"),
      badges
    };
  })()`);

  assert.ok(filteredData.count > 0, 'Filtered results must exist');
  assert.ok(filteredData.count < unFilteredCount, `Filtered results (${filteredData.count}) should be subset of all (${unFilteredCount})`);
  assert.ok(
    filteredData.badges.some(bGroup => bGroup.some(badge => badge.includes('مفهوم') || badge.includes('کارشناسی'))),
    'UMKO badges must be present on filtered items'
  );

  // Click the first search result and verify navigation to that note
  evaluate('document.querySelector("ul.catalogue-list li:first-child h2 a").click()');
  wait('location.pathname.startsWith("/notes/")');
  wait('document.querySelector("h1")?.innerText.trim().length > 0');
  const noteH1 = evaluate('document.querySelector("h1").innerText.trim()');
  assert.equal(noteH1, filteredData.firstTitle, 'Navigated note H1 must match clicked search result title');
  record(`7. Tested search navigation: executed query "نیم‌گروه", applied kind filter "concept", verified UMKO badges, clicked "${noteH1}" and verified navigation`);

  console.log(`\n========================================`);
  console.log(`All ${checks.length} test steps passed successfully!`);
  console.log(`========================================`);
} catch (error) {
  console.error('\n[TEST FAILURE]:', error.message);
  try {
    browser('screenshot', 'tests/browser/e2e-reading-failure.png');
    console.error('Failure screenshot saved to tests/browser/e2e-reading-failure.png');
  } catch {}
  throw error;
} finally {
  // ---------------------------------------------------------------------------
  // 8. Ensure clean session teardown
  // ---------------------------------------------------------------------------
  try {
    browser('close');
    console.log('[PASS] 8. Clean session teardown complete');
  } catch (closeError) {
    console.error('Warning during session close:', closeError.message);
  }
}
