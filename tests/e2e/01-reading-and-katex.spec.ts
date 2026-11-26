import { assertNoHorizontalOverflow, expect, test } from './fixtures.ts';

test.describe('Reading experience, KaTeX BiDi, and theming', () => {
  test('home page renders in RTL with clean light/dark theme toggle and zero overflow', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle).toBeVisible();

    const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
    await toggle.click();
    const toggledTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
    expect(toggledTheme).not.toBe(initialTheme);
    await toggle.click();
    await assertNoHorizontalOverflow(page);
  });

  test('note page isolates KaTeX formulas as LTR inside RTL Persian prose on desktop and mobile', async ({
    page,
  }) => {
    const targetSlug = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
    const response = await page.goto(targetSlug);
    expect(response?.status()).toBe(200);

    const article = page.locator('article.note[data-ai-scope="canonical"]');
    await expect(article).toBeVisible();
    const katex = article.locator('.katex').first();
    await expect(katex).toBeVisible();

    const direction = await katex.evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe('ltr');
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(article).toBeVisible();
    const mobileBox = await article.boundingBox();
    expect(mobileBox?.width).toBeGreaterThanOrEqual(300);
    await assertNoHorizontalOverflow(page);
  });
});
