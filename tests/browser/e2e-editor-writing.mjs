/**
 * Real browser E2E test for note editing, CodeMirror interaction, typing Markdown/LaTeX,
 * autosave debounce, manual save (Control+s), reading mode toggle, custom personal fork rendering,
 * and canonical note return/reset using agent-browser against https://test.atomathix.ir.
 *
 * Scenarios tested:
 *  1. Register a temporary test account so editing/fork permissions are active.
 *  2. Open a canonical note (e.g. /notes/alg-232009403065653b).
 *  3. Verify note reading mode is displayed with .workspace-document and article.note.
 *  4. Click edit button ([data-edit]) to enter editor mode.
 *  5. Wait for CodeMirror editor (.cm-content) to appear and gain focus.
 *  6. Insert new markdown text including Persian prose and LaTeX math ($a * b = b * a$).
 *  7. Verify autosave debounce indicator updates ([data-save-status] includes 'ذخیره شد').
 *  8. Test keyboard shortcut Control+s for explicit manual save.
 *  9. Switch back to reading mode ([data-view]) and verify editor panel hides.
 * 10. Verify that the custom edited content is rendered in the reader.
 * 11. Test reset/restore or return to canonical note if available.
 * 12. Ensure clean session teardown.
 *
 * Run: node tests/browser/e2e-editor-writing.mjs
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'editor-e2e-' + Date.now();
const noteSlug = process.env.NOTE_SLUG || 'alg-232009403065653b';

// Critical runtime directive for agent-browser: always unset LD_PRELOAD
const env = { ...process.env, TMPDIR: process.env.TMPDIR || '/tmp' };
delete env.LD_PRELOAD;

function browser(...args) {
  let raw;
  try {
    raw = execFileSync('agent-browser', ['--session', session, ...args, '--json'], {
      env,
      encoding: 'utf8',
      timeout: 45000,
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
  console.log(`Starting E2E editor writing test against ${base} (session: ${session})`);

  // 1. Register/login a temporary test account first so editing/fork permissions are active
  browser('open', base + '/account');
  wait('!!document.querySelector("[data-auth-form]")');
  browser('check', '#auth-register');
  wait('!document.querySelector("[data-register-field]").hidden');

  const testEmail = 'e2e-writer-' + randomBytes(4).toString('hex') + '@example.com';
  const testPassword = 'P@ssw0rd12345!' + randomBytes(4).toString('hex');
  const testName = 'کاربر آزمون نگارش ریاضی';

  browser('fill', '#auth-email', testEmail);
  browser('fill', '#auth-password', testPassword);
  browser('fill', '#auth-name', testName);
  browser('click', '[data-auth-form] button[type=submit]');
  wait('!document.querySelector("[data-logout]")?.hidden');

  const accountInfo = evaluate('document.querySelector("[data-account-status]")?.textContent');
  assert.ok(accountInfo?.includes(testName) || accountInfo?.includes('student'), 'Account status shows registered user');
  record('1. Registered temporary test account and established active session');

  // 2. Open a note, e.g. /notes/alg-232009403065653b or /notes/axler-2debc85d452ad205
  browser('open', base + '/notes/' + noteSlug);
  wait('!!document.querySelector(".workspace-document") && !!document.querySelector("article.note:not([data-live-preview])")');
  record(`2. Opened note /notes/${noteSlug}`);

  // 3. Verify note reading mode is displayed with .workspace-document and article.note
  assert.equal(evaluate('!!document.querySelector(".workspace-document")'), true, '.workspace-document must exist');
  assert.equal(evaluate('!!document.querySelector("article.note:not([data-live-preview])")'), true, 'article.note must exist');
  assert.equal(evaluate('!document.querySelector("article.note:not([data-live-preview])").hidden'), true, 'article.note must be visible');
  assert.equal(evaluate('document.querySelector("[data-editor-panel]")?.hidden'), true, 'editor panel must be hidden in reader mode');
  assert.equal(evaluate('document.querySelector("[data-view]")?.getAttribute("aria-pressed")'), 'true', 'reading mode button is active');
  record('3. Verified note reading mode is displayed with .workspace-document and article.note');

  // 4. Click edit button ([data-edit]) to enter editor mode
  browser('click', '[data-edit]');
  record('4. Clicked [data-edit] to enter editor mode');

  // 5. Wait for CodeMirror editor (.cm-content) to appear and gain focus
  wait('!!document.querySelector(".cm-content") && !document.querySelector("[data-editor-panel]").hidden');
  const isCmActive = evaluate('document.activeElement?.closest(".cm-content") !== null');
  assert.equal(isCmActive, true, 'CodeMirror editor (.cm-content) must gain focus');
  assert.equal(evaluate('document.querySelector("[data-edit]")?.getAttribute("aria-pressed")'), 'true', 'edit button is active');
  assert.equal(evaluate('document.querySelector("article.note:not([data-live-preview])").hidden'), true, 'reader article is hidden during editing');
  record('5. CodeMirror editor (.cm-content) appeared and gained focus');

  // 6. Insert new markdown text including Persian prose and LaTeX math (e.g. $a * b = b * a$)
  const marker = 'ویرایش_آزمایشی_' + randomBytes(4).toString('hex');
  const mathFormula = '$a * b = b * a$';
  const customMarkdown = `\n\n## بخش آزمایشی ${marker}\nمتن فارسی همراه با فرمول ضرب جابجایی ${mathFormula} جهت بررسی چرخه ویرایش.\n`;

  browser('press', 'Control+End');
  browser('keyboard', 'inserttext', customMarkdown);
  record('6. Inserted new Markdown text with Persian prose and LaTeX formula');

  // 7. Verify autosave debounce indicator updates ([data-save-status] includes 'ذخیره شد')
  wait('document.querySelector("[data-save-status]")?.textContent?.includes("ذخیره شد")');
  const autoSaveText = evaluate('document.querySelector("[data-save-status]")?.textContent');
  assert.ok(autoSaveText?.includes('ذخیره شد'), 'Autosave status indicator must report saved');
  record('7. Verified autosave debounce indicator updated to "ذخیره شد"');

  // 8. Test keyboard shortcut Control+s for explicit manual save
  browser('keyboard', 'inserttext', ' افزوده برای آزمون کلید ذخیره دستی.');
  wait('document.querySelector("[data-save-status]")?.textContent?.includes("ذخیره‌نشده") || document.querySelector("[data-save-status]")?.textContent?.includes("انتظار")');
  browser('press', 'Control+s');
  wait('document.querySelector("[data-save-status]")?.textContent?.includes("ذخیره شد")');
  const manualSaveText = evaluate('document.querySelector("[data-save-status]")?.textContent');
  assert.ok(manualSaveText?.includes('ذخیره شد'), 'Manual save via Control+s must update save status');
  record('8. Verified manual save triggered via Control+s keyboard shortcut');

  // 9. Switch back to reading mode ([data-view]) and verify editor panel hides
  browser('click', '[data-view]');
  wait('document.querySelector("[data-editor-panel]")?.hidden === true');
  assert.equal(evaluate('!document.querySelector("article.note:not([data-live-preview])").hidden'), true, 'reader article must be visible again');
  assert.equal(evaluate('document.querySelector("[data-editor-panel]").hidden'), true, 'editor panel must be hidden');
  assert.equal(evaluate('document.querySelector("[data-view]")?.getAttribute("aria-pressed")'), 'true', 'reading mode button is active');
  record('9. Switched back to reading mode ([data-view]) and verified editor panel hid');

  // 10. Verify that the custom edited content is rendered in the reader
  const renderedText = evaluate('document.querySelector("article.note:not([data-live-preview])")?.textContent || ""');
  assert.ok(renderedText.includes(marker), 'Custom Persian marker must be rendered in reader');
  const hasFormula = renderedText.includes('a * b = b * a') || evaluate('!!document.querySelector("article.note:not([data-live-preview]) .katex")');
  assert.ok(hasFormula, 'LaTeX math formula must be rendered in reader');
  const noteStatus = evaluate('document.querySelector(".note-status")?.textContent');
  assert.ok(noteStatus?.includes('شخصی'), 'Note status must indicate personal fork');
  record('10. Verified custom edited Markdown and LaTeX math rendered in reader mode');

  // 11. Test reset/restore or return to canonical note if available
  // 11a: Test [data-original] (view canonical version without deleting personal fork)
  browser('click', '[data-more-toggle]');
  wait('!document.querySelector("#workspace-more-panel").hidden');
  const hasOriginalBtn = evaluate('!document.querySelector("[data-original]")?.hidden');
  if (hasOriginalBtn) {
    evaluate('document.querySelector("[data-original]").click()');
    wait('document.querySelector("article.note:not([data-live-preview])").dataset.aiScope === "canonical"');
    const canonicalText = evaluate('document.querySelector("article.note:not([data-live-preview])").textContent');
    assert.equal(canonicalText.includes(marker), false, 'Canonical note view must not show personal edits');
    record('11a. Returned to canonical note view via [data-original]');
  }

  // 11b: Reload page to verify personal fork persists across navigations
  browser('open', base + '/notes/' + noteSlug);
  wait('!document.querySelector("article.note:not([data-live-preview])")?.hidden');
  wait('document.querySelector("article.note:not([data-live-preview])")?.textContent?.includes(' + JSON.stringify(marker) + ')');
  record('11b. Verified personal fork persisted on page reload');

  // 11c: Test [data-reset] (reset personal fork back to canonical note)
  browser('click', '[data-more-toggle]');
  wait('!document.querySelector("#workspace-more-panel").hidden');
  const hasResetBtn = evaluate('!document.querySelector("[data-reset]")?.hidden');
  if (hasResetBtn) {
    evaluate('window.confirm = () => true');
    evaluate('document.querySelector("[data-reset]").click()');
    wait('!document.querySelector("article.note:not([data-live-preview])")?.textContent?.includes(' + JSON.stringify(marker) + ')');
    assert.equal(evaluate('document.querySelector("article.note:not([data-live-preview])").dataset.aiScope'), 'canonical');
    record('11c. Reset personal fork to canonical version via [data-reset]');
  }

  record('11. Tested return to canonical note and reset/restore functionality');

  console.log(`\nAll 11 verification steps passed successfully (${checks.length} assertions/steps verified).`);
} finally {
  // 12. Ensure clean session teardown
  console.log('12. Ensuring clean session teardown');
  try {
    browser('close');
    record('12. Closed agent-browser session cleanly');
  } catch (teardownError) {
    console.error('Session teardown warning:', teardownError.message);
  }
}
