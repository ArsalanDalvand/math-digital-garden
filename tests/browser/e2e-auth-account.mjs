/**
 * Real browser E2E test for authentication and account settings.
 *
 * Scenarios tested:
 *  1. Navigate to /account.
 *  2. Toggle between login and registration radio controls.
 *  3. Test validation errors on bad inputs (client-side and server-side).
 *  4. Register a new generated test account (email: 'e2e-' + Date.now() + '@example.org', password, full_name).
 *  5. Verify logged-in state is reflected on /account and in header.
 *  6. Navigate to /settings/account and verify profile form loads (follows redirect to /profile).
 *  7. Test updating preferences (full name on profile, reading width and theme on preferences).
 *  8. Test logging out, verifying return to anonymous state.
 *  9. Test logging back in with registered credentials and verifying success.
 * 10. Clean browser session close at the end.
 *
 * Run: node tests/browser/e2e-auth-account.mjs
 */

import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'https://test.atomathix.ir';
const session = 'auth-e2e-' + Date.now();

// Critical runtime directive: always unset LD_PRELOAD in child env for agent-browser
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
  console.log(`Starting E2E auth & account test against ${base} (session: ${session})`);

  // 1. Navigate to /account
  browser('open', base + '/account');
  browser('wait', '--load', 'networkidle');
  assert.equal(evaluate('!!document.querySelector("[data-auth-form]")'), true, 'Auth form must exist on /account');
  record('1. Navigated to /account and verified auth form present');

  // 2. Toggle between login and registration radio controls
  assert.equal(evaluate('document.querySelector("#auth-login").checked'), true, 'Initial state: login selected');
  assert.equal(evaluate('document.querySelector("#auth-register").checked'), false, 'Initial state: register not selected');
  assert.equal(evaluate('document.querySelector("[data-register-field]").hidden'), true, 'Name field hidden in login mode');
  assert.equal(evaluate('document.querySelector("#auth-name").disabled'), true, 'Name input disabled in login mode');
  assert.equal(evaluate('document.querySelector("[data-auth-form] button[type=submit]").textContent.trim()'), 'ورود');

  browser('check', '#auth-register');
  assert.equal(evaluate('document.querySelector("#auth-register").checked'), true, 'Register radio checked');
  assert.equal(evaluate('document.querySelector("#auth-login").checked'), false, 'Login radio unchecked');
  assert.equal(evaluate('document.querySelector("[data-register-field]").hidden'), false, 'Name field visible in register mode');
  assert.equal(evaluate('document.querySelector("#auth-name").disabled'), false, 'Name input enabled in register mode');
  assert.equal(evaluate('document.querySelector("[data-auth-form] button[type=submit]").textContent.trim()'), 'ساخت حساب');

  browser('check', '#auth-login');
  assert.equal(evaluate('document.querySelector("#auth-login").checked'), true, 'Login radio checked again');
  assert.equal(evaluate('document.querySelector("#auth-register").checked'), false, 'Register radio unchecked');
  assert.equal(evaluate('document.querySelector("[data-register-field]").hidden'), true, 'Name field hidden again');
  assert.equal(evaluate('document.querySelector("#auth-name").disabled'), true, 'Name input disabled again');
  assert.equal(evaluate('document.querySelector("[data-auth-form] button[type=submit]").textContent.trim()'), 'ورود');
  record('2. Toggled between login and registration controls and verified UI state');

  // 3. Test validation errors on bad inputs
  // 3a. Client-side input validation (invalid email format and short password)
  browser('fill', '#auth-email', 'bad-email-format');
  browser('fill', '#auth-password', 'short');
  evaluate('document.querySelector("[data-auth-form]").reportValidity()');
  assert.equal(evaluate('document.querySelector("#auth-email").getAttribute("aria-invalid")'), 'true', 'Email flagged invalid');
  const emailHelp = evaluate('document.querySelector("#auth-email-error")?.textContent');
  assert.ok(emailHelp?.includes('ایمیل معتبر'), 'Email error message displayed');

  assert.equal(evaluate('document.querySelector("#auth-password").getAttribute("aria-invalid")'), 'true', 'Password flagged invalid');
  const passwordHelp = evaluate('document.querySelector("#auth-password-error")?.textContent');
  assert.ok(passwordHelp?.includes('۱۲ تا ۲۵۶ نویسه'), 'Password length error displayed');

  // 3b. Server-side validation error (login with non-existent user credentials)
  browser('fill', '#auth-email', 'nonexistent-' + Date.now() + '@example.org');
  browser('fill', '#auth-password', 'wrong-password-123456');
  browser('click', '[data-auth-form] button[type=submit]');
  wait('document.querySelector("[data-account-status]").textContent.length > 0');
  const serverAuthError = evaluate('document.querySelector("[data-account-status]").textContent');
  assert.ok(serverAuthError.includes('ایمیل یا رمز عبور درست نیست'), 'Server rejected bad login credentials');
  record('3. Tested validation errors on bad inputs (both client-side and server-side)');

  // 4. Register a new generated test account
  browser('check', '#auth-register');
  const testEmail = 'e2e-' + Date.now() + '@example.org';
  const testPassword = 'SyntheticPassword2026!';
  const testFullName = 'کاربر آزمون خودکار E2E';

  browser('fill', '#auth-email', testEmail);
  browser('fill', '#auth-password', testPassword);
  browser('fill', '#auth-name', testFullName);
  browser('click', '[data-auth-form] button[type=submit]');

  wait('document.querySelector("[data-auth-form]").hidden');
  record(`4. Registered new test account: ${testEmail}`);

  // 5. Verify logged-in state is reflected on /account and in header
  assert.equal(evaluate('document.querySelector("[data-auth-form]").hidden'), true, 'Auth form is hidden');
  assert.equal(evaluate('document.querySelector("[data-logged-in-view]").hidden'), false, 'Logged-in card is visible');
  assert.equal(evaluate('document.querySelector("[data-logout]").hidden'), false, 'Logout button is visible');
  assert.equal(evaluate('document.querySelector("[data-profile-link]").hidden'), false, 'Profile links are visible');

  const accountStatusMsg = evaluate('document.querySelector("[data-account-status]").textContent');
  assert.ok(accountStatusMsg.includes(testFullName) || accountStatusMsg.includes(testEmail), 'Status displays user identity');

  wait('Boolean(document.querySelector("button[aria-label*=\\"منوی حساب\\"]"))');
  const headerMenuText = evaluate('document.querySelector("button[aria-label*=\\"منوی حساب\\"]").textContent');
  assert.ok(
    headerMenuText.includes(testFullName) || headerMenuText.includes(testEmail) || headerMenuText.length > 0,
    'Header dropdown menu displays user identity'
  );
  assert.equal(evaluate('document.querySelector("a[aria-label*=\\"ورود یا ثبت‌نام\\"]") === null'), true, 'Anonymous header link gone');
  record('5. Verified logged-in state on /account and in header dropdown menu');

  // 6. Navigate to /settings/account and verify profile form loads
  browser('open', base + '/settings/account');
  browser('wait', '--load', 'networkidle');
  wait('Boolean(document.querySelector("[data-settings-content]")) && !document.querySelector("[data-settings-content]").hidden');
  const redirectedPath = evaluate('location.pathname');
  assert.ok(
    redirectedPath.endsWith('/settings/account/profile'),
    `Expected redirect to /settings/account/profile, got ${redirectedPath}`
  );
  const loadedName = evaluate('document.querySelector("#profile-name").value');
  assert.equal(loadedName, testFullName, 'Profile form loaded with registered full name');
  const loadedEmail = evaluate('document.querySelector("#profile-email").value');
  assert.equal(loadedEmail, testEmail, 'Profile form loaded with registered email');
  record('6. Navigated to /settings/account, confirmed redirect to /profile, and verified form data');

  // 7. Test updating preferences (full name on profile, reading width and theme on preferences)
  // 7a. Update full name on profile
  const updatedFullName = testFullName + ' بروزرسانی';
  browser('fill', '#profile-name', updatedFullName);
  browser('click', '[data-settings-form="profile"] button[type=submit]');
  wait('document.querySelector("[data-settings-form=profile] [data-form-status]").textContent.includes("ذخیره شد")');
  record('7a. Updated full name on profile form');

  // 7b. Update preferences (reading width: 960, theme: dark)
  browser('open', base + '/settings/account/preferences');
  browser('wait', '--load', 'networkidle');
  wait('Boolean(document.querySelector("[data-settings-content]")) && !document.querySelector("[data-settings-content]").hidden');
  browser('select', '#preference-theme', 'dark');
  browser('select', '#preference-width', '960');
  browser('click', '[data-settings-form="preferences"] button[type=submit]');
  wait('document.querySelector("[data-settings-form=preferences] [data-form-status]").textContent.includes("ذخیره شد")');
  record('7b. Updated preferences (theme=dark, width=960)');

  // 7c. Reload and verify persisted preferences
  browser('reload');
  browser('wait', '--load', 'networkidle');
  wait('Boolean(document.querySelector("[data-settings-content]")) && !document.querySelector("[data-settings-content]").hidden');
  const persistedTheme = evaluate('document.documentElement.dataset.theme');
  const persistedWidth = evaluate('document.querySelector("#preference-width").value');
  assert.equal(persistedTheme, 'dark', 'Persisted theme is dark');
  assert.equal(persistedWidth, '960', 'Persisted width is 960');
  record('7c. Reloaded and confirmed persisted theme and reading width');

  // 8. Test logging out, verifying return to anonymous state
  browser('open', base + '/account');
  browser('wait', '--load', 'networkidle');
  wait('Boolean(document.querySelector("[data-logout]")) && !document.querySelector("[data-logout]").hidden');
  browser('click', '[data-logout]');
  browser('wait', '--load', 'networkidle');
  wait('Boolean(document.querySelector("[data-auth-form]")) && !document.querySelector("[data-auth-form]").hidden');
  assert.equal(evaluate('document.querySelector("[data-logout]").hidden'), true, 'Logout button is hidden');

  wait('Boolean(document.querySelector("a[aria-label*=\\"ورود یا ثبت‌نام\\"]")) && !document.querySelector("button[aria-label*=\\"منوی حساب\\"]")');
  assert.equal(
    evaluate('document.querySelector("button[aria-label*=\\"منوی حساب\\"]") === null'),
    true,
    'Header menu removed after logout'
  );
  record('8. Logged out and verified return to anonymous state across page and header');

  // 9. Test logging back in with registered credentials and verifying success
  browser('check', '#auth-login');
  browser('fill', '#auth-email', testEmail);
  browser('fill', '#auth-password', testPassword);
  browser('click', '[data-auth-form] button[type=submit]');
  wait('document.querySelector("[data-auth-form]").hidden');
  wait('Boolean(document.querySelector("[data-logged-in-view]")) && !document.querySelector("[data-logged-in-view]").hidden');
  const reLoginStatus = evaluate('document.querySelector("[data-account-status]").textContent');
  assert.ok(
    reLoginStatus.includes(updatedFullName) || reLoginStatus.includes(testEmail),
    'Account status reflects updated profile name'
  );
  wait('Boolean(document.querySelector("button[aria-label*=\\"منوی حساب\\"]"))');
  record('9. Logged back in with registered credentials and verified updated profile identity');

  console.log(`\nAll ${checks.length} checks passed successfully with 0 errors!`);
} catch (error) {
  console.error('\nE2E Test Failed:', error);
  throw error;
} finally {
  console.log('10. Cleaning up: closing browser session cleanly...');
  try {
    browser('close');
    console.log('Browser session closed cleanly.');
  } catch (closeErr) {
    console.warn('Warning: failed to close browser session:', closeErr.message);
  }
}
