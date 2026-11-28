import { assertNoHorizontalOverflow, expect, test } from './fixtures.ts';

const MOCK_PREFS = {
  theme: 'light',
  size: 19,
  leading: 2,
  width: 760,
  focus: false,
  default_mode: 'read',
  fixed_toolbar: true,
};

const STUDENT_ACCOUNT = {
  id: '00000000-0000-4000-8000-000000000011',
  email: 'student@example.org',
  full_name: 'سارا دانشجو',
  role: 'student',
  avatar_url: null,
  preferences: MOCK_PREFS,
};

const AUTHOR_ACCOUNT = {
  ...STUDENT_ACCOUNT,
  id: '00000000-0000-4000-8000-000000000022',
  email: 'author@example.org',
  full_name: 'دکتر مریم احمدی',
  role: 'author',
};

test.describe('Phase E: Personal Library, Account & Settings Hub', () => {
  test('/library guest mode fires zero 401 requests, renders SVG rows and live filter cleanly', async ({
    page,
  }) => {
    const unauthorizedUrls: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401 && res.url().includes('/api/')) {
        unauthorizedUrls.push(res.url());
      }
    });

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/library');

    await expect(page.locator('[data-library-guest-banner]')).toBeVisible();
    await expect(page.locator('[data-create-item]')).toBeHidden();

    const listText = (await page.locator('[data-browser-list]').innerText()).trim();
    expect(listText).not.toMatch(/[📥📁📄🔗📋🚫🌐📦]/u);
    await expect(page.locator('[data-browser-list] li svg').first()).toBeVisible();

    for (const tabName of ['favorites', 'watching', 'trash'] as const) {
      await page.locator(`[data-library-view="${tabName}"]`).click();
      const emptyCard = page.locator('[data-browser-empty]');
      await expect(emptyCard).toBeVisible();
      await expect(emptyCard.locator('a[href="/account"]')).toBeVisible();
    }

    await page.locator('[data-library-view="items"]').click();

    const searchMetrics = await page.evaluate(() => {
      const box = document.querySelector('.library-search-box input')?.getBoundingClientRect();
      const icon = document.querySelector('.library-search-box .library-search-icon')?.getBoundingClientRect();
      const sideBox = document.querySelector('.library-filter-container input')?.getBoundingClientRect();
      const sideIcon = document.querySelector('.library-filter-container .library-filter-icon')?.getBoundingClientRect();
      return { box, icon, sideBox, sideIcon };
    });
    expect(searchMetrics.icon).toBeTruthy();
    expect(searchMetrics.icon!.x).toBeGreaterThanOrEqual(searchMetrics.box!.x);
    expect(searchMetrics.icon!.right).toBeLessThanOrEqual(searchMetrics.box!.right);
    expect(searchMetrics.sideIcon).toBeTruthy();
    expect(searchMetrics.sideIcon!.x).toBeGreaterThanOrEqual(searchMetrics.sideBox!.x);
    expect(searchMetrics.sideIcon!.right).toBeLessThanOrEqual(searchMetrics.sideBox!.right);

    await page.route('**/api/library/public*', (route) =>
      route.fulfill({
        json: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            kind: 'note',
            title: 'قضیهٔ منتشرشدهٔ عمومی',
            verified: true,
          },
        ],
      }),
    );
    await page.locator('[data-library-view="public"]').click();
    await expect(
      page.locator('[data-browser-list] a[href="/published/44444444-4444-4444-8444-444444444444"]'),
    ).toBeVisible();
    await expect(page.locator('[data-library-guest-banner]')).toBeHidden();
    expect(unauthorizedUrls).toEqual([]);
    await page.unroute('**/api/library/public*');

    await page.locator('[data-library-view="items"]').click();
    const filter = page.locator('[data-browser-filter]');
    await filter.fill('جبر');
    await expect(page.locator('[data-browser-filter-clear]')).toBeVisible();
    await page.locator('[data-browser-filter-clear]').click();
    await expect(filter).toHaveValue('');
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    expect(unauthorizedUrls).toEqual([]);
  });

  test('/library authenticated workflows render folder/note actions and styled modals', async ({
    page,
  }) => {
    let itemsState = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        parent_id: null,
        kind: 'folder',
        title: 'جزوهٔ جبر پیشرفته',
        visibility: 'unlisted',
        share_token: 'mock-folder-token',
        canonical_slug: null,
        has_git: true,
        git_repo_url: 'https://github.com/example/algebra.git',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        parent_id: null,
        kind: 'note',
        title: 'نکتهٔ هم‌ریختی حلقه‌ها',
        visibility: 'private',
        share_token: null,
        canonical_slug: null,
        has_git: false,
        git_repo_url: null,
      },
    ];

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: STUDENT_ACCOUNT } }),
    );
    await page.route('**/api/library/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/library/canonical/metadata') {
        await route.fulfill({ json: [] });
        return;
      }
      if (url.pathname === '/api/library/items') {
        await route.fulfill({ json: itemsState });
        return;
      }
      if (url.pathname.endsWith('/publication') && route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { visibility?: string };
        const id = url.pathname.split('/')[4];
        itemsState = itemsState.map((it) =>
          it.id === id
            ? {
                ...it,
                visibility: body.visibility || it.visibility,
                share_token:
                  body.visibility === 'unlisted' ? it.share_token || 'rotated-token' : null,
              }
            : it,
        );
        const updated = itemsState.find((it) => it.id === id)!;
        await route.fulfill({ json: updated });
        return;
      }
      await route.fulfill({ json: [] });
    });

    await page.goto('/library');
    await expect(page.locator('[data-library-guest-banner]')).toBeHidden();
    await expect(page.locator('[data-create-item]')).toBeVisible();

    const folderRow = page.locator('[data-browser-list] li', { hasText: 'جزوهٔ جبر پیشرفته' });
    await expect(folderRow).toBeVisible();
    await expect(folderRow).toContainText('متصل به گیت');
    await expect(folderRow).toContainText('پیوند اختصاصی');

    const noteRow = page.locator('[data-browser-list] li', { hasText: 'نکتهٔ هم‌ریختی حلقه‌ها' });
    await expect(noteRow.locator('a', { hasText: 'ویرایش' })).toBeVisible();

    await page.locator('[data-import-docs]').click();
    const importDialog = page.locator('dialog[data-import-dialog]');
    await expect(importDialog).toBeVisible();
    await importDialog.getByRole('button', { name: /فایل فشرده/ }).click();
    await expect(importDialog.locator('.attachment-dropzone')).toBeVisible();
    await importDialog.locator('.library-modal-close').click();
    await expect(importDialog).toBeHidden();

    await folderRow.getByRole('button', { name: 'اشتراک' }).click();
    const shareDialog = page.locator('dialog[data-share-dialog]');
    await expect(shareDialog).toBeVisible();
    await expect(shareDialog.locator('.share-option-card')).toHaveCount(3);
    await expect(shareDialog.locator('.share-link-card input[dir="ltr"]')).toHaveValue(
      /\/shared\/mock-folder-token/,
    );
    await expect(shareDialog.locator('a', { hasText: 'مشاهده نسخهٔ اشتراکی' })).toBeVisible();
    await shareDialog.locator('.library-modal-close').click();

    await folderRow.getByRole('button', { name: 'تغییر نام' }).click();
    const renameDialog = page.locator('dialog.library-modal', { hasText: 'تغییر نام پوشه' });
    await expect(renameDialog).toBeVisible();
    await renameDialog.locator('.library-modal-close').click();

    await folderRow.getByRole('button', { name: 'زباله‌دان' }).click();
    const trashDialog = page.locator('dialog.library-modal', { hasText: 'انتقال به زباله‌دان' });
    await expect(trashDialog).toBeVisible();
    await trashDialog.locator('.library-modal-close').click();

    await page.route('**/api/library/items?trashed=true*', (route) =>
      route.fulfill({
        json: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            parent_id: null,
            kind: 'note',
            title: 'یادداشت درون زباله‌دان',
            visibility: 'private',
          },
        ],
      }),
    );
    await page.locator('[data-library-view="trash"]').click();
    const trashedRow = page.locator('[data-browser-list] li', { hasText: 'یادداشت درون زباله‌دان' });
    await expect(trashedRow).toBeVisible();
    await expect(page.locator('[data-empty-trash]')).toBeVisible();

    await trashedRow.getByRole('button', { name: 'حذف دائمی' }).click();
    const permDialog = page.locator('dialog[data-permanent-delete-dialog]');
    await expect(permDialog).toBeVisible();
    await permDialog.locator('.library-modal-close').click();

    await page.locator('[data-empty-trash]').click();
    const emptyTrashDialog = page.locator('dialog[data-empty-trash-dialog]');
    await expect(emptyTrashDialog).toBeVisible();
    await emptyTrashDialog.locator('.library-modal-close').click();
  });

  test('/account handles guest register policy meter, password toggle, and authenticated author hub', async ({
    page,
  }) => {
    const unauthorizedUrls: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401 && res.url().includes('/api/')) {
        unauthorizedUrls.push(res.url());
      }
    });

    await page.goto('/account');
    await expect(page.locator('[data-auth-form]')).toBeVisible();

    await page.locator('label[for="auth-register"]').click();
    await expect(page.locator('[data-password-meter]')).toBeVisible();
    const passInput = page.locator('#auth-password');
    await passInput.fill('short');
    await expect(page.locator('[data-password-meter-bar]')).toHaveAttribute('data-level', 'short');

    const toggleBtn = page.locator('[data-auth-form] [data-toggle-password]');
    await expect(passInput).toHaveAttribute('type', 'password');
    const passPaddingLeft = await passInput.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).paddingLeft || '0'),
    );
    expect(passPaddingLeft).toBeGreaterThanOrEqual(40);
    await toggleBtn.click();
    await expect(passInput).toHaveAttribute('type', 'text');
    await assertNoHorizontalOverflow(page);
    expect(unauthorizedUrls).toEqual([]);

    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: AUTHOR_ACCOUNT }),
    );
    await page.goto('/account?next=%2Flibrary');
    await page.fill('#auth-email', 'author@example.org');
    await page.fill('#auth-password', 'StrongPassphrase#2026');
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/library'),
      page.locator('[data-auth-form] button[type="submit"]').click(),
    ]);
    await page.unroute('**/api/auth/login');

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: AUTHOR_ACCOUNT } }),
    );
    await page.goto('/account');
    await expect(page.locator('[data-logged-in-view]')).toBeVisible();
    await expect(page.locator('[data-logged-in-role]')).toHaveText('نویسنده');
    await expect(page.locator('[data-profile-link] a[href="/settings/account/profile"]')).toBeVisible();
    await expect(
      page.locator('[data-profile-link] a[href="/settings/account/preferences"]'),
    ).toBeVisible();
    await expect(page.locator('[data-review-hub-card]')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('/settings routes enforce guest zero-401 redirect and authenticated profile/preferences controls', async ({
    page,
  }) => {
    const unauthorizedUrls: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401 && res.url().includes('/api/')) {
        unauthorizedUrls.push(res.url());
      }
    });

    await page.goto('/settings/profile');
    expect(new URL(page.url()).pathname).toBe('/settings/account/profile');
    await expect(page.locator('[data-settings-login].library-guest-card')).toBeVisible();
    await expect(page.locator('[data-settings-content]')).toBeHidden();

    await page.goto('/settings/account/preferences');
    await expect(page.locator('[data-settings-login]')).toBeVisible();
    expect(unauthorizedUrls).toEqual([]);

    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ json: { authenticated: true, account: STUDENT_ACCOUNT } }),
    );

    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/settings/account/profile');
    await expect(page.locator('[data-settings-content]')).toBeVisible();
    await expect(page.locator('.account-identity-banner')).toContainText('سارا دانشجو');
    await expect(page.locator('[data-settings-form="password"] .password-meter')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto('/settings/account/preferences');
    await expect(page.locator('.prefs-theme-group [role="radio"], .prefs-theme-group input[type="radio"]')).toHaveCount(3);
    await expect(page.locator('[data-size-output]')).toBeVisible();
    await expect(page.locator('[data-leading-output]')).toBeVisible();
    await expect(page.locator('[data-math-scale-output]')).toBeVisible();
    await expect(page.locator('[data-prefs-preview]')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    await page.goto('/settings/account/profile');
    await assertNoHorizontalOverflow(page);
  });
});
