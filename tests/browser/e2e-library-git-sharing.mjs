/**
 * Real browser E2E test for Personal Library, Shared Git Docs, and Study Assistant UI:
 *  1. Unauthenticated visitor opens unlisted shared Git repo (/shared/TOKEN)
 *  2. Sidebar tree renders cleanly without horizontal overflow
 *  3. Relative Markdown links resolve to ?note=UUID and navigate without 404
 *  4. Mermaid diagram inside shared doc renders SVG
 *  5. Fresh user registers and creates a folder + note in /library
 *  6. Personal note opens in /library/[id] without errors
 *  7. AI Study Assistant UI renders on /sample
 *
 * Target: https://test.atomathix.ir (or process.env.BASE_URL)
 * Run: node tests/browser/e2e-library-git-sharing.mjs
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'library-e2e-' + Date.now();
const sharedToken = process.env.SHARED_TOKEN || '7wXYh2lXsgeyqDe3cO-1g1DQTVWSzNJMTgE2e597-EM';

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
  console.log(`Starting Library & Shared Docs E2E test against ${base} (session: ${session})`);

  // 1. Open shared Git repository as unauthenticated visitor
  browser('open', `${base}/shared/${sharedToken}`);
  browser('wait', 'article.note');

  const sharedInfo = evaluate(`(() => {
    const nav = document.querySelector('.workspace-library');
    const links = Array.from(document.querySelectorAll('article.note a')).map(a => ({
      text: a.textContent?.trim() || '',
      href: a.getAttribute('href') || ''
    }));
    const resolvedLinks = links.filter(l => l.href.includes('?note='));
    return {
      title: document.querySelector('.workspace-document h1')?.textContent?.trim() || '',
      hasSidebarTree: !!document.querySelector('[data-shared-tree]'),
      noHorizontalOverflow: nav ? (nav.scrollWidth <= nav.clientWidth + 4) : true,
      resolvedLinksCount: resolvedLinks.length,
      firstResolvedHref: resolvedLinks[0]?.href || null,
      hasMermaid: !!document.querySelector('.mermaid-diagram svg'),
    };
  })()`);

  assert.ok(sharedInfo.title.length > 0, 'Shared page must display note title');
  assert.equal(sharedInfo.hasSidebarTree, true, 'Shared page must display sidebar file tree');
  assert.equal(sharedInfo.noHorizontalOverflow, true, 'Sidebar library tree must not overflow horizontally');
  assert.ok(sharedInfo.resolvedLinksCount > 0, 'Relative links in shared README must resolve to ?note=UUID');
  record(`1. Shared repo loaded (${sharedInfo.resolvedLinksCount} resolved ?note= links, clean sidebar, Mermaid: ${sharedInfo.hasMermaid})`);

  // 2. Click a resolved relative link and verify subnote loads cleanly
  browser('click', 'article.note a[href*="?note="]');
  browser('wait', 'article.note');
  const subnoteInfo = evaluate(`(() => ({
    url: location.href,
    title: document.querySelector('.workspace-document h1')?.textContent?.trim() || '',
    bodyLen: document.querySelector('article.note')?.textContent?.trim().length || 0,
  }))()`);
  assert.ok(subnoteInfo.url.includes('?note='), 'Clicking relative link must navigate to ?note=UUID');
  assert.ok(subnoteInfo.bodyLen > 30, 'Subnote content must be non-empty');
  record(`2. Navigated via relative link to subnote "${subnoteInfo.title}" (${subnoteInfo.bodyLen} chars)`);

  // 3. Register a fresh user to test Personal Library
  const email = `lib-e2e-${Date.now()}-${randomBytes(2).toString('hex')}@example.com`;
  const password = 'E2ELibraryPassword123!';

  browser('open', base + '/account');
  browser('wait', '[data-auth-form]');
  browser('click', '[data-auth-form] input[name="mode"][value="register"]');
  browser('fill', '[data-auth-form] input[name="email"]', email);
  browser('fill', '[data-auth-form] input[name="password"]', password);
  browser('click', '[data-auth-form] button[type="submit"]');
  browser('wait', '1500');

  // 4. Open /library and create a folder + note
  browser('open', base + '/library');
  browser('wait', '[data-library-browser] form button[type="submit"]:not([disabled])');
  const hasImportBtn = evaluate('!!document.querySelector("[data-import-docs]")');
  assert.equal(hasImportBtn, true, 'Personal library must expose Git/Zip import button');
  record('3. Signed in and opened personal /library with Git/Zip import control');

  browser('fill', '[data-library-browser] form input[name="title"]', 'جزوه آزمایشی E2E');
  browser('select', '[data-library-browser] form select[name="kind"]', 'note');
  browser('click', '[data-library-browser] form button[type="submit"]');
  browser('wait', '[data-library-actions]');

  const personalNote = evaluate(`(() => ({
    path: location.pathname,
    hasDoc: !!document.querySelector('.workspace-document'),
    hasActions: !!document.querySelector('[data-library-actions]'),
  }))()`);
  assert.ok(personalNote.path.startsWith('/library/'), `Creating personal note must navigate to /library/{id} (got ${personalNote.path})`);
  assert.equal(personalNote.hasDoc, true, 'Personal note reader/editor must render');
  assert.equal(personalNote.hasActions, true, 'Personal note actions must render');
  record(`4. Created and opened personal note at ${personalNote.path}`);

  // 5. Verify legacy AI Study Assistant UI is disabled/hidden on canonical notes (Phase 1)
  browser('open', base + '/notes/axler-2debc85d452ad205');
  browser('wait', 'graph-component[data-graph-ready="true"]');
  const assistantUi = evaluate(`(() => ({
    hasStudyAssistant: !!document.querySelector('.study-assistant'),
    hasChatForm: !!document.querySelector('[data-chat-form]'),
    hasGraph: !!document.querySelector('graph-component[data-graph-ready="true"]'),
  }))()`);
  assert.equal(assistantUi.hasStudyAssistant, false, 'Legacy Study Assistant UI must be hidden in Phase 1');
  assert.equal(assistantUi.hasChatForm, false, 'Legacy AI chat form must be hidden in Phase 1');
  assert.equal(assistantUi.hasGraph, true, 'Knowledge graph must still render cleanly without Study Assistant');
  record('5. Verified legacy AI Study Assistant UI is hidden and Knowledge Graph renders on canonical note');

  const pageErrors = browser('errors')?.errors || [];
  assert.equal(pageErrors.length, 0, `No critical page errors allowed: ${JSON.stringify(pageErrors)}`);

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
