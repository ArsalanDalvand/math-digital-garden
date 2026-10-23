import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../../frontend/src/pages/account.astro', import.meta.url), 'utf8');
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const { transpile } = require('typescript');
const apiSource = readFileSync(new URL('../../frontend/src/scripts/api.ts', import.meta.url), 'utf8');
const { ApiError, message } = new Function(transpile(apiSource.replace(/export /g, ''), { target: 7, module: 0 }) + '\nreturn {ApiError, message};')();

async function account(api = async () => { throw new Error('signed out'); }, url = 'https://garden.test/account') {
  const markup = source.replace(/^---[\s\S]*?---/, '').replace(/<script>[\s\S]*?<\/script>/, '');
  const dom = new JSDOM(markup, { runScripts: 'outside-only', url });
  dom.window.api = api;
  dom.window.message = message;
  dom.window.ApiError = ApiError;
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/import[^;]+;/, 'const {api, message, ApiError} = window;');
  dom.window.eval(transpile(script, { target: 7, module: 0 }));
  await new Promise(resolve => setTimeout(resolve, 0));
  return dom;
}

test('account defaults to login and switches registration using native labeled radio controls', async () => {
  const dom = await account();
  const document = dom.window.document;
  const login = document.querySelector('input[type="radio"][value="login"]');
  const register = document.querySelector('input[type="radio"][value="register"]');
  assert.ok(login && register, 'mode selection must use native radio inputs');
  assert.equal(login.checked, true);
  assert.ok(document.querySelector('fieldset legend').textContent.includes('حساب'));
  const name = document.querySelector('[name="full_name"]');
  const password = document.querySelector('[name="password"]');
  assert.equal(name.disabled, true);
  assert.equal(name.closest('[data-register-field]').hidden, true);
  assert.equal(password.autocomplete, 'current-password');
  register.click();
  assert.equal(name.disabled, false);
  assert.equal(name.closest('[data-register-field]').hidden, false);
  assert.equal(password.autocomplete, 'new-password');
  assert.equal(document.querySelector('button[type="submit"]').textContent.trim(), 'ساخت حساب');
  login.click();
  assert.equal(name.disabled, true);
  assert.equal(password.autocomplete, 'current-password');
  dom.window.close();
});

test('implicit submit uses selected auth mode and preserves endpoint payload contracts', async () => {
  const calls = [];
  const dom = await account(async (path, body) => {
    if (path === '/auth/me') throw new Error('signed out');
    calls.push({ path, body: JSON.parse(JSON.stringify(body)) });
    throw new Error('خطای شبکه؛ دوباره تلاش کنید.');
  });
  const document = dom.window.document;
  const form = document.querySelector('[data-auth-form]');
  document.querySelector('[name="email"]').value = 'student@example.com';
  document.querySelector('[name="password"]').value = 'unchanged-password';
  form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1, 'Enter-key submit must not require event.submitter');
  assert.deepEqual(calls[0], { path: '/auth/login', body: { email: 'student@example.com', password: 'unchanged-password' } });
  document.querySelector('[value="register"]').click();
  document.querySelector('[name="full_name"]').value = 'دانشجو';
  form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls[1], { path: '/auth/register', body: { email: 'student@example.com', password: 'unchanged-password', full_name: 'دانشجو' } });
  assert.equal(document.querySelector('[name="password"]').value, 'unchanged-password', 'failed requests must preserve input');
  dom.window.close();
});

test('auth failures explain credentials, registration conflicts and retryable service errors', async () => {
  for (const [mode, code, expected] of [
    ['login', 401, 'ایمیل یا رمز عبور درست نیست'],
    ['register', 409, 'ثبت‌نام با این ایمیل ممکن نیست'],
    ['login', 429, 'تلاش‌های زیادی'],
    ['login', 500, 'سرویس ورود'],
    ['register', 422, 'اطلاعات فرم'],
    ['login', 0, 'ارتباط'],
  ]) {
    const dom = await account(async path => {
      if (path === '/auth/me') throw new ApiError(401, 'Unauthenticated');
      throw code ? new ApiError(code, 'raw internal detail') : new Error('Failed to fetch');
    });
    const d = dom.window.document;
    d.querySelector('[value="' + mode + '"]').click();
    d.querySelector('[name="email"]').value = 'student@example.com';
    d.querySelector('[name="password"]').value = 'unchanged-password';
    d.querySelector('form').dispatchEvent(new dom.window.SubmitEvent('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(d.querySelector('[data-account-status]').textContent.includes(expected), `${mode} ${code}: understandable recovery message`);
    assert.equal(d.querySelector('[name="password"]').value, 'unchanged-password');
    dom.window.close();
  }
});


test('pending submission is announced and prevents duplicate requests until failure', async () => {
  let rejectRequest;
  let calls = 0;
  const dom = await account(path => {
    if (path === '/auth/me') return Promise.reject(new ApiError(401, 'signed out'));
    calls++;
    return new Promise((_, reject) => { rejectRequest = reject; });
  });
  const d = dom.window.document;
  const form = d.querySelector('form');
  const button = form.querySelector('button[type="submit"]');
  d.querySelector('[name="email"]').value = 'student@example.com';
  d.querySelector('[name="password"]').value = 'unchanged-password';
  const send = () => form.dispatchEvent(new dom.window.SubmitEvent('submit', { cancelable: true }));
  send(); send();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(form.getAttribute('aria-busy'), 'true');
  assert.match(button.textContent, /در حال/);
  assert.equal(d.querySelector('[value="register"]').disabled, true);
  rejectRequest(new ApiError(401, 'Invalid credentials'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(button.disabled, false);
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.equal(button.textContent, 'ورود');
  assert.equal(d.querySelector('[value="register"]').disabled, false);
  dom.window.close();
});


test('email autocomplete identifies the login username and signup email', async () => {
  const dom = await account();
  const d = dom.window.document;
  assert.equal(d.querySelector('[name="email"]').autocomplete, 'username');
  d.querySelector('[value="register"]').click();
  assert.equal(d.querySelector('[name="email"]').autocomplete, 'email');
  d.querySelector('[value="login"]').click();
  assert.equal(d.querySelector('[name="email"]').autocomplete, 'username');
  dom.window.close();
});


test('invalid fields have associated recovery text and cannot reach the API', async () => {
  let calls = 0;
  const dom = await account(async path => {
    if (path === '/auth/me') throw new ApiError(401, 'signed out');
    calls++;
  });
  const d = dom.window.document;
  const form = d.querySelector('form');
  const email = d.querySelector('[name="email"]');
  email.value = 'invalid';
  d.querySelector('[name="password"]').value = 'unchanged-password';
  form.dispatchEvent(new dom.window.SubmitEvent('submit', { cancelable: true }));
  assert.equal(calls, 0);
  assert.equal(email.getAttribute('aria-invalid'), 'true');
  const error = d.getElementById(email.getAttribute('aria-describedby'));
  assert.ok(error.textContent.includes('ایمیل'));
  assert.equal(error.hidden, false);
  assert.equal(d.activeElement, email);
  email.value = 'student@example.com';
  email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(email.getAttribute('aria-invalid'), 'false');
  assert.equal(error.hidden, true);
  dom.window.close();
});


test('successful authentication stays on account and ignores untrusted return destinations', async () => {
  for (const next of ['https://evil.invalid/', '//evil.invalid/', 'javascript:alert(1)']) {
    const url = 'https://garden.test/account?next=' + encodeURIComponent(next);
    const dom = await account(async path => {
      if (path === '/auth/me') throw new ApiError(401, 'signed out');
      return { email: 'student@example.com', role: 'student' };
    }, url);
    const d = dom.window.document;
    d.querySelector('[name="email"]').value = 'student@example.com';
    d.querySelector('[name="password"]').value = 'unchanged-password';
    d.querySelector('form').dispatchEvent(new dom.window.SubmitEvent('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dom.window.location.href, url);
    assert.equal(d.querySelector('form').hidden, true);
    assert.equal(d.querySelector('[data-logout]').hidden, false);
    assert.equal(d.querySelector('[name="password"]').value, '');
    assert.equal(d.querySelector('a').getAttribute('href'), '/library');
    dom.window.close();
  }
});
