import { expect, test } from './fixtures.ts';

test.describe('Diagrams, KaTeX embeds, and interactive visuals', () => {
  test('sample note renders static KaTeX and callouts offline with zero errors', async ({ page }) => {
    const response = await page.goto('/sample');
    expect(response?.status()).toBe(200);

    const sampleArticle = page.locator('article.note:not([data-presentation-stage])');
    await expect(sampleArticle).toBeVisible();
    await expect(sampleArticle.locator('.katex').first()).toBeVisible();
  });

  test('canonical geometric visualizations note renders cleanly', async ({ page }) => {
    const response = await page.goto('/notes/axler-a354fd365fa3e3ed');
    expect(response?.status()).toBe(200);

    const article = page.locator('article.note[data-ai-scope="canonical"]');
    await expect(article).toBeVisible();
    const heading = article.locator('h1').or(page.locator('main h1')).first();
    await expect(heading).toBeVisible();
  });
});
