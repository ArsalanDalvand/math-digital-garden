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
});
