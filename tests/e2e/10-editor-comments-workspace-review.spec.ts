import { assertNoHorizontalOverflow, expect, test } from './fixtures.ts';

const TEST_NOTE_SLUG = 'axler-2d7afb5de78c939e';
const TEST_NOTE_URL = `/notes/${TEST_NOTE_SLUG}`;

const MOCK_ACCOUNT = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'student@example.org',
  full_name: 'سارا رضایی',
  role: 'student',
  avatar_url: null,
  preferences: {
    theme: 'light',
    default_mode: 'read',
    fixed_toolbar: true,
    size: 19,
    leading: 2,
    width: 760,
    font: 'vazirmatn',
    focus: false,
    math_scale: 100,
  },
};

const HASH_V1 = 'a'.repeat(64);
const HASH_V2 = 'b'.repeat(64);
const HASH_FORK = 'c'.repeat(64);
const HASH_SAVED = 'd'.repeat(64);

async function mockPreviewAndLinks(page: import('@playwright/test').Page) {
  await page.route('**/api/link-index.json', (route) =>
    route.fulfill({ json: [{ slug: TEST_NOTE_SLUG, title: 'پیش‌نیاز: دستگاه معادلات خطی', aliases: [] }] }),
  );
  await page.route('**/api/preview', async (route) => {
    const raw = route.request().postData() || '';
    const html = `<h1>پیش‌نمایش</h1><p>${raw.slice(0, 80)}</p><span class="katex"><span class="katex-html">x^2</span></span>`;
    await route.fulfill({ json: { html, blocks: [{ raw, html }] } });
  });
}

test.describe('Phase D — Editor, Comments Sheet, Share/Attachments, Workspace & Review', () => {
  test('guest /workspace, /review, and comments sheet stay zero-401 with zero overflow', async ({
    page,
  }) => {
    const forbiddenCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/workspace') || req.url().includes('/api/proposals') || req.url().includes('/api/review')) {
        forbiddenCalls.push(req.url());
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/workspace', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-workspace-auth-prompt]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto('/review', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-review-auth-gate]')).toBeVisible();
    await expect(page.locator('[data-index]')).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    expect(forbiddenCalls).toEqual([]);

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(TEST_NOTE_URL, { waitUntil: 'networkidle' });
    await page.locator('[data-note-extra-actions] [data-library-command="comments"]').click();
    const dialog = page.locator('dialog[data-library-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-dialog-mode', 'sheet');
    await expect(dialog.locator('.library-guest-card a[href="/account"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('editor split preview, rebase banner MergeView, and 409 conflict recovery work cleanly', async ({
    page,
  }) => {
    await mockPreviewAndLinks(page);

    const baseContent = '---\ntitle: تست\n---\nخط اول رسمی';
    const forkContent = '---\ntitle: تست\n---\nخط اول ویرایش‌شده $x^2$';
    const newCanonical = '---\ntitle: تست\n---\nخط اول رسمی\nخط تازه رسمی';

    let canonicalState = { content: newCanonical, current_hash: HASH_V2 };
    let forkState: any = {
      id: 'fork-1',
      base_hash: HASH_V1,
      base_content: baseContent,
      custom_content: forkContent,
      current_hash: HASH_FORK,
    };
    let simulateConflict = true;

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: MOCK_ACCOUNT } }),
    );
    await page.route('**/api/workspace', (route) =>
      route.fulfill({ json: { forks: [], bookmarks: [] } }),
    );
    await page.route(`**/api/workspace/notes/${TEST_NOTE_SLUG}`, (route) =>
      route.fulfill({
        json: {
          canonical: { slug: TEST_NOTE_SLUG, title: 'تست', ...canonicalState },
          fork: forkState,
        },
      }),
    );
    await page.route(`**/api/library/canonical/${TEST_NOTE_SLUG}**`, (route) =>
      route.fulfill({
        status: 404,
        json: { detail: 'Not found' },
      }),
    );
    await page.route(`**/api/notes/${TEST_NOTE_SLUG}/fork/rebase`, async (route) => {
      const payload = route.request().postDataJSON();
      forkState = {
        ...forkState,
        base_hash: payload.canonical_hash,
        base_content: canonicalState.content,
        custom_content: payload.content,
        current_hash: HASH_SAVED,
      };
      await route.fulfill({ json: forkState });
    });
    await page.route(`**/api/notes/${TEST_NOTE_SLUG}/fork`, async (route) => {
      const payload = route.request().postDataJSON();
      if (simulateConflict) {
        simulateConflict = false;
        forkState = {
          ...forkState,
          custom_content: '---\ntitle: تست\n---\nنسخهٔ جدید روی سرور',
          current_hash: HASH_SAVED,
        };
        await route.fulfill({
          status: 409,
          json: { detail: 'Content changed; reload before saving' },
        });
        return;
      }
      forkState = {
        ...forkState,
        custom_content: payload.content,
        current_hash: 'e'.repeat(64),
      };
      await route.fulfill({ json: forkState });
    });

    await page.goto(TEST_NOTE_URL, { waitUntil: 'networkidle' });

    // Rebase banner appears immediately after fork load when fork.base_hash !== canonical.current_hash
    const syncBanner = page.locator('[data-sync-banner]');
    await expect(syncBanner).toBeVisible();
    await expect(syncBanner).toHaveAttribute('data-banner-mode', 'rebase');

    // Open rebase MergeView and sync cleanly
    await page.locator('[data-sync-banner-action]').click();
    const mergeDialog = page.locator('[data-merge-dialog]');
    await expect(mergeDialog).toBeVisible();
    await expect(mergeDialog.locator('.cm-mergeView .cm-editor')).toHaveCount(2);
    await page.locator('[data-merge-apply]').click();
    await expect(mergeDialog).toBeHidden();
    await expect(syncBanner).toBeHidden();

    // Enter edit mode and toggle Split Preview
    await page.locator('[data-edit]').click();
    await expect(page.locator('[data-editor] .cm-editor')).toBeVisible();
    await expect(page.locator('[data-editor-stats]')).toContainText('واژه');

    const splitBtn = page.locator('[data-toolbar-split]');
    await splitBtn.click();
    await expect(page.locator('.editor-workspace-grid')).toHaveAttribute('data-editor-layout', 'split');
    await expect(page.locator('[data-live-preview] .katex')).toBeVisible();

    // Trigger edit + explicit save -> hits simulated 409 -> opens conflict recovery MergeView
    await page.locator('[data-editor] .cm-content').click();
    await page.keyboard.type('\nتغییر محلی');
    await page.locator('[data-save]').click();
    await expect(mergeDialog).toBeVisible();
    await expect(page.locator('[data-merge-title]')).toContainText('رفع تداخل');
    await expect(mergeDialog.locator('.cm-mergeView .cm-editor')).toHaveCount(2);
    await page.locator('[data-merge-apply]').click();
    await expect(mergeDialog).toBeHidden();
    await expect(page.locator('[data-save-badge]')).toHaveAttribute('data-state', 'saved');
  });

  test('comments sheet displays real names, KaTeX, filters, inline reply & inline edit', async ({
    page,
  }) => {
    await mockPreviewAndLinks(page);

    const itemId = '00000000-0000-4000-8000-000000000099';
    const commentsList: any[] = [
      {
        id: 'c1',
        content: 'پرسش اول دربارهٔ $x^2 + 1$',
        user_id: MOCK_ACCOUNT.id,
        author_name: 'سارا رضایی',
        author_role: 'student',
        created_at: '2026-11-26T10:00:00Z',
        parent_id: null,
        resolved: false,
      },
      {
        id: 'c2',
        content: 'پاسخ روشنگر با فرمول $\\det(A) \\neq 0$',
        user_id: '00000000-0000-4000-8000-000000000002',
        author_name: 'دکتر کریمی',
        author_role: 'author',
        created_at: '2026-11-26T10:05:00Z',
        parent_id: 'c1',
        resolved: false,
      },
      {
        id: 'c3',
        content: 'نکتهٔ تایپی برطرف شد.',
        user_id: '00000000-0000-4000-8000-000000000003',
        author_name: 'علی محمدی',
        author_role: 'student',
        created_at: '2026-11-25T10:00:00Z',
        parent_id: null,
        resolved: true,
      },
    ];

    let itemVisibility = 'private';
    let itemToken = '';

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: MOCK_ACCOUNT } }),
    );
    await page.route('**/api/workspace', (route) =>
      route.fulfill({ json: { forks: [], bookmarks: [] } }),
    );
    await page.route(`**/api/workspace/notes/${TEST_NOTE_SLUG}`, (route) =>
      route.fulfill({
        json: { canonical: { slug: TEST_NOTE_SLUG, content: '# عنوان', current_hash: HASH_V1 }, fork: null },
      }),
    );

    await page.route(`**/api/library/canonical/${TEST_NOTE_SLUG}/comments**`, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ json: commentsList });
        return;
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const created = {
          id: 'c-' + (commentsList.length + 1),
          content: body.content,
          user_id: MOCK_ACCOUNT.id,
          author_name: 'سارا رضایی',
          author_role: 'student',
          created_at: new Date().toISOString(),
          parent_id: body.parent_id ?? null,
          resolved: false,
        };
        commentsList.push(created);
        await route.fulfill({ status: 201, json: created });
        return;
      }
    });

    await page.route(`**/api/library/canonical/${TEST_NOTE_SLUG}/comments/c1**`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        commentsList[0].content = body.content;
        await route.fulfill({ json: { id: 'c1', content: body.content } });
      }
    });

    await page.route(`**/api/library/canonical/${TEST_NOTE_SLUG}`, (route) =>
      route.fulfill({
        json: {
          id: itemId,
          title: 'یادداشت نمونه',
          content: '# عنوان\nمتن',
          current_hash: HASH_V1,
          visibility: itemVisibility,
          share_token: itemToken,
          verified: false,
          published_hash: itemVisibility === 'private' ? null : HASH_V1,
          updated_at: '2026-11-26T10:00:00Z',
        },
      }),
    );

    await page.route(`**/api/library/items/${itemId}**`, async (route) => {
      const url = route.request().url();
      if (url.endsWith('/favorite')) return route.fulfill({ json: { favorite: false } });
      if (url.endsWith('/watch')) return route.fulfill({ json: { watching: false, updated: false } });
      if (url.endsWith('/publication') && route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        itemVisibility = body.visibility;
        itemToken = body.visibility === 'unlisted' ? 'secret-share-token-xyz' : '';
        return route.fulfill({
          json: {
            id: itemId,
            title: 'یادداشت نمونه',
            content: '# عنوان',
            current_hash: HASH_V1,
            visibility: itemVisibility,
            share_token: itemToken,
            verified: false,
            published_hash: HASH_V1,
          },
        });
      }
      if (url.includes('/attachments') && route.request().method() === 'GET') {
        return route.fulfill({
          json: [{ id: 'att-1', filename: 'matrix-diagram.png', size: 20480 }],
        });
      }
      return route.fulfill({
        json: {
          id: itemId,
          title: 'یادداشت نمونه',
          content: '# عنوان',
          current_hash: HASH_V1,
          visibility: itemVisibility,
          share_token: itemToken,
          verified: false,
          published_hash: HASH_V1,
          updated_at: '2026-11-26T10:00:00Z',
        },
      });
    });

    await page.goto(TEST_NOTE_URL, { waitUntil: 'networkidle' });

    // Open Comments Sheet
    await page.locator('[data-note-extra-actions] [data-library-command="comments"]').click();
    const dialog = page.locator('dialog[data-library-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-dialog-mode', 'sheet');
    await expect(dialog).toContainText('سارا رضایی');
    await expect(dialog).toContainText('دکتر کریمی');
    await expect(dialog.locator('.comment-body .katex').first()).toBeVisible();

    // Filter pill works
    await dialog.locator('[data-filter="open"]').click();
    await expect(dialog.locator('.comment-thread-card')).toHaveCount(1);
    await dialog.locator('[data-filter="all"]').click();
    await expect(dialog.locator('.comment-thread-card')).toHaveCount(2);

    // Inline Reply keeps threads intact
    await dialog.locator('.comment-thread-card').first().getByRole('button', { name: 'پاسخ' }).click();
    await expect(dialog.locator('.comment-reply-form')).toBeVisible();
    await expect(dialog.locator('.comment-thread-card')).toHaveCount(2);

    // Inline Edit replaces only the comment body cleanly
    await dialog.locator('.comment-card').first().getByRole('button', { name: 'ویرایش' }).click();
    const editBox = dialog.locator('.comment-inline-form textarea');
    await expect(editBox).toBeVisible();
    await editBox.fill('متن ویرایش‌شده $y^2$');
    await dialog.locator('.comment-inline-form button[type="submit"]').click();
    await expect(dialog).toContainText('متن ویرایش‌شده');

    await page.keyboard.press('Escape');

    // Open Unified Share Dialog
    await page.locator('[data-note-extra-actions] [data-library-command="share"]').click();
    await expect(dialog).toHaveAttribute('data-dialog-mode', 'modal');
    await dialog.locator('input[name="visibility"][value="unlisted"]').check();
    await dialog.locator('.share-visibility-form button[type="submit"]').click();
    await expect(dialog.locator('.share-link-card input')).toHaveValue(/\/shared\/secret-share-token-xyz/);

    // Open Attachments Dialog via More Menu
    await page.keyboard.press('Escape');
    await page.locator('[data-more-toggle]').click();
    await page.locator('[data-note-more] [data-library-command="attachments"]').click();
    await expect(dialog.locator('[data-attachment-dropzone]')).toBeVisible();
    await expect(dialog.locator('.attachment-card')).toContainText('matrix-diagram.png');
    await expect(dialog.locator('.attachment-card')).toContainText('۲۰');
  });

  test('/workspace and /review dashboards work end-to-end with MergeView diffs', async ({ page }) => {
    await mockPreviewAndLinks(page);

    const authorAccount = { ...MOCK_ACCOUNT, id: 'author-1', role: 'author', full_name: 'دکتر ناصری' };
    const proposalItem: any = {
      id: 'prop-1',
      slug: TEST_NOTE_SLUG,
      title: 'دستگاه معادلات خطی و ماتریس‌ها',
      author_name: 'سارا رضایی',
      base_content: '# عنوان\nمتن اصلی',
      proposed_content: '# عنوان\nمتن اصلاح‌شده',
      student_comment: 'افزودن مثال دترمینان',
      status: 'pending',
      author_review_comment: '',
      created_at: '2026-11-26T12:00:00Z',
      sync_status: 'pending',
    };

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: authorAccount } }),
    );
    await page.route('**/api/workspace', (route) =>
      route.fulfill({
        json: {
          forks: [
            {
              id: 'fork-1',
              slug: TEST_NOTE_SLUG,
              title: 'دستگاه معادلات خطی',
              custom_content: 'متن فعلی',
              updated_at: '2026-11-26T12:00:00Z',
              canonical_hash: HASH_V2,
              needs_rebase: true,
            },
          ],
          bookmarks: [{ slug: TEST_NOTE_SLUG, title: 'یادداشت نشان‌شده' }],
        },
      }),
    );
    await page.route('**/api/proposals', (route) => route.fulfill({ json: [proposalItem] }));

    await page.goto('/workspace', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-stat-forks]')).toHaveText('۱');
    await expect(page.locator('.workspace-rebase-pill')).toBeVisible();
    await page.locator('.workspace-proposal-card button', { hasText: 'مشاهدهٔ تغییرات' }).click();
    await expect(page.locator('.workspace-proposal-diff .cm-mergeView .cm-editor')).toHaveCount(2);

    // /review workbench
    await page.route('**/api/review', (route) => route.fulfill({ json: [proposalItem] }));
    await page.route('**/api/review/prop-1', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        proposalItem.status = 'approved';
        proposalItem.author_review_comment = body.comment;
        proposalItem.reviewed_at = '2026-11-26T13:00:00Z';
        await route.fulfill({ json: proposalItem });
        return;
      }
      await route.fulfill({ json: proposalItem });
    });

    await page.goto('/review', { waitUntil: 'networkidle' });
    await expect(page.locator('.review-queue-card').first()).toContainText('سارا رضایی');
    await expect(page.locator('[data-review-diff] .cm-mergeView .cm-editor')).toHaveCount(2);

    await page.locator('[data-review-tab="preview"]').click();
    await expect(page.locator('[data-review-preview] .katex')).toBeVisible();
    await page.locator('[data-review-tab="diff"]').click();

    await page.locator('[data-review-comment]').fill('عالی و دقیق.');
    await page.locator('[data-decision="approve"]').click();
    await expect(page.locator('[data-review-status-pill]')).toHaveAttribute('data-status', 'approved');
    await expect(page.locator('[data-review-decision-summary]')).toContainText('عالی و دقیق.');
  });
});
