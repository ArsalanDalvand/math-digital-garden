import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{
  attachErrorGuards: (allowGuest401?: boolean) => () => void;
}>({
  page: async ({ page }, use) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const locUrl = msg.location()?.url || '';
      const text = msg.text();
      if (text.includes('401') && locUrl.includes('/api/account')) {
        return;
      }
      consoleErrors.push(`${text}${locUrl ? ` (${locUrl})` : ''}`);
    });

    await use(page);

    expect(pageErrors, `Unexpected page errors: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  },
});

export { expect };

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}
