import { expect, test } from './fixtures.ts';

test.describe('Workspace note controls and reading settings', () => {
  test('reading settings panel updates typography variables and closes with Escape', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const summary = page.locator('.reading-settings > summary');
    await expect(summary).toBeVisible();
    await summary.click();

    await expect(page.locator('.reading-settings')).toHaveAttribute('open', '');
    const widthSelect = page.locator('[data-reading-setting="width"]');
    await widthSelect.selectOption('960');

    const appliedWidth = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--reading-width').trim(),
    );
    expect(appliedWidth).toBe('960px');

    await page.keyboard.press('Escape');
    await expect(page.locator('.reading-settings')).not.toHaveAttribute('open', '');
  });

  test('note page exposes workspace actions and navigation toggle cleanly', async ({ page }) => {
    const targetUrl = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
    const response = await page.goto(targetUrl);
    expect(response?.status()).toBe(200);

    await expect(page.locator('[data-workspace-note]')).toBeAttached();
    const toolsToggle = page.locator('.desktop-tools-toggle');
    await expect(toolsToggle).toBeVisible();
    const navToggle = page.locator('[data-nav-toggle]');
    await expect(navToggle).toHaveAttribute('aria-expanded', 'true');
    await navToggle.click();
    await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
    await navToggle.click();
    await expect(navToggle).toHaveAttribute('aria-expanded', 'true');
  });
});
