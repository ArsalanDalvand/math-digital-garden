import { expect, test } from './fixtures.ts';

test.describe('Authentication and React AccountSettings routes', () => {
  test('account page renders login/signup options in RTL without errors', async ({ page }) => {
    const response = await page.goto('/account');
    expect(response?.status()).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('[data-account-status]')).toBeAttached();
  });

  test('account settings profile and preferences routes render guest prompt safely when logged out', async ({
    page,
  }) => {
    for (const route of ['/settings/account/profile', '/settings/account/preferences']) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('.account-settings-nav')).toBeVisible();
      await expect(page.locator('[data-settings-login]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-settings-content]')).toBeHidden();
    }
  });
});
