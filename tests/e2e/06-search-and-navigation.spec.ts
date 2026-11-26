import { expect, test } from './fixtures.ts';

test.describe('Search and catalogue navigation', () => {
  test('search page executes Persian query and navigates cleanly to matching note', async ({
    page,
  }) => {
    const response = await page.goto('/search');
    expect(response?.status()).toBe(200);

    const searchInput = page.locator('form[role="search"] input[name="q"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('فضای برداری');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=/);
    const noteLink = page.locator('main a[href^="/notes/"]').first();
    await expect(noteLink).toBeVisible();
    await noteLink.click();

    await page.waitForURL(/\/notes\//);
    await expect(page.locator('article.note[data-ai-scope="canonical"]')).toBeVisible();
  });

  test('command palette opens on trigger and Ctrl+K, searches via /api/search, and navigates', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const trigger = page.locator('[data-command-trigger]');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const palette = page.locator('[data-command-palette]');
    await expect(palette).toBeVisible();

    const input = page.locator('[data-command-input]');
    await input.fill('فضای برداری');
    const firstResult = page.locator('[data-command-results] a[data-command-item]').first();
    await expect(firstResult).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await firstResult.click();

    await page.waitForURL(/\/notes\//);
    await expect(page.locator('article.note[data-ai-scope="canonical"]')).toBeVisible();
  });
});
