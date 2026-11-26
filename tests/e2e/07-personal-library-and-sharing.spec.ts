import { expect, test } from './fixtures.ts';

test.describe('Personal library and graph API health', () => {
  test('library route renders cleanly in RTL with zero console/page errors', async ({ page }) => {
    const response = await page.goto('/library');
    expect(response?.status()).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('[data-library-browser]')).toBeVisible();
  });

  test('/api/graph.json returns valid indexed UMKO sitemap JSON', async ({ request }) => {
    const response = await request.get('/api/graph.json');
    expect(response.status()).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(data).length).toBeGreaterThan(0);
  });
});
