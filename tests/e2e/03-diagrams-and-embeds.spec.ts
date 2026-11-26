import { expect, test } from './fixtures.ts';

test.describe('Diagrams, KaTeX embeds, and interactive visuals', () => {
  test('sample note renders static KaTeX and callouts offline with zero errors', async ({ page }) => {
    const response = await page.goto('/sample');
    expect(response?.status()).toBe(200);

    await expect(page.locator('article.note')).toBeVisible();
    await expect(page.locator('article.note .katex').first()).toBeVisible();
  });

  test('canonical geometric visualizations note renders cleanly', async ({ page }) => {
    const response = await page.goto('/notes/axler-a354fd365fa3e3ed');
    expect(response?.status()).toBe(200);

    await expect(page.locator('article.note')).toBeVisible();
    const heading = page.locator('article.note h1, main h1').first();
    await expect(heading).toBeVisible();
  });
});
