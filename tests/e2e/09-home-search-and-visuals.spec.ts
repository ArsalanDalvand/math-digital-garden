import { assertNoHorizontalOverflow, expect, test } from './fixtures.ts';

const NOTE_PRIMARY = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
const NOTE_GEOGEBRA = '/notes/axler-3cbca863293da4fe';

test.describe('Phase C: Homepage, CommandPalette, Search, Presentation & Visual Blocks', () => {
  test('homepage has single H1, accurate copy, book search links, and zero overflow on desktop and mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.hero-badge')).toHaveCount(0);
    await expect(page.locator('.features-grid')).toHaveCount(0);

    const mainText = (await page.locator('#main').textContent()) ?? '';
    expect(mainText).not.toContain('دستیار هوشمند');
    expect(mainText).not.toContain('دستیار هوش مصنوعی');
    expect(mainText).not.toContain('به‌زودی');

    const bookSearchLinks = page.locator('[data-book-slug] a[href^="/search?book="]');
    expect(await bookSearchLinks.count()).toBeGreaterThanOrEqual(1);
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
  });

  test('command palette exposes kind filters, quick actions, keyboard navigation, and closes on Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await page.waitForSelector('html[data-cmdk-ready="true"]');

    await page.keyboard.press('Control+k');
    const palette = page.locator('[data-command-palette]');
    await expect(palette).toBeVisible();

    await expect(palette.locator('[data-command-quick-actions]')).toBeVisible();
    const theoremChip = palette.locator('[data-command-kind="assertion"]');
    await theoremChip.click();
    await expect(theoremChip).toHaveAttribute('aria-pressed', 'true');
    await expect(palette.locator('[data-command-results]')).toBeVisible({ timeout: 5_000 });

    await palette.locator('[data-command-kind=""]').click();
    const input = palette.locator('[data-command-input]');
    await input.fill('فضای برداری');
    const items = palette.locator('[data-command-item]');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
    if ((await items.count()) > 1) {
      await input.press('ArrowDown');
      await expect(items.nth(1)).toHaveAttribute('data-active', 'true');
    }

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('search supports book and kind filters, active filter chips, highlighted snippets, and KaTeX slogans', async ({
    page,
  }) => {
    const res = await page.goto(
      '/search?q=%D9%81%D8%B6%D8%A7%DB%8C+%D8%A8%D8%B1%D8%AF%D8%A7%D8%B1%DB%8C&book=axler',
    );
    expect(res?.status()).toBe(200);

    await expect(page.locator('#book')).toHaveValue('axler');
    const chips = page.locator('[data-active-filter-chips]');
    await expect(chips).toBeVisible();
    await expect(chips.locator('[data-remove-filter="book"]')).toBeVisible();
    await expect(chips.locator('[data-remove-filter="q"]')).toBeVisible();

    const resultsText = (await page.locator('[data-od-id="search-results"]').textContent()) ?? '';
    expect(resultsText).not.toContain('🎓');
    expect(resultsText).not.toContain('🎯');

    const hitCount = await page.locator('[data-od-id="search-results"] mark.search-hit').count();
    expect(hitCount).toBeGreaterThan(0);

    const slogans = page.locator('.note-slogan-search');
    if ((await slogans.count()) > 0) {
      expect((await slogans.first().textContent()) ?? '').not.toMatch(/\$[^$]+\$/);
    }

    await chips.locator('[data-remove-filter="book"]').click();
    await page.waitForURL(/\/search\?q=/);
    expect(page.url()).not.toContain('book=');
  });

  test('presentation modal shows progress, Persian slide counter, jumper, and navigates cleanly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    const res = await page.goto(NOTE_PRIMARY);
    expect(res?.status()).toBe(200);

    await page.locator('[data-more-toggle]').click();
    const presentBtn = page.locator('[data-presentation-open]');
    await expect(presentBtn).toBeVisible();
    await presentBtn.click();

    const dialog = page.locator('[data-presentation]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-presentation-count]')).toContainText('اسلاید ۱ از');

    const nextBtn = dialog.locator('[data-presentation-next]');
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await expect(dialog.locator('[data-presentation-count]')).toContainText('اسلاید ۲ از');
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('GeoGebra note renders framed toolbar cleanly without overflow on 390px mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto(NOTE_GEOGEBRA);
    test.skip(res?.status() !== 200, 'GeoGebra fixture note not available');
    expect(res?.status()).toBe(200);

    const geoFigures = page.locator('[data-geogebra]');
    if ((await geoFigures.count()) > 0) {
      await expect(geoFigures.first().locator('.geogebra-toolbar')).toBeVisible();
      await expect(geoFigures.first().locator('[data-geogebra-fullscreen]')).toBeVisible();
    }
    await assertNoHorizontalOverflow(page);
  });
});
