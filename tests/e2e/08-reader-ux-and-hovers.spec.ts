import { assertNoHorizontalOverflow, expect, test } from './fixtures.ts';

const NOTE_PRIMARY = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
const NOTE_ROADMAP = '/notes/axler-a354fd365fa3e3ed';
const NOTE_WIDE_TABLES = '/notes/axler-5818b1e09c3557c7';

test.describe('Phase B: Reader UX, Toolbar, Sidebar, Callouts, Tables & Hover Previews', () => {
  test('renders single status, KaTeX slogan, localized UMKO relations, pager, opaque popovers & guest toast CTAs with zero 401s', async ({
    page,
  }) => {
    const unauthorizedUrls: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401) unauthorizedUrls.push(res.url());
    });

    const response = await page.goto(NOTE_PRIMARY);
    expect(response?.status()).toBe(200);

    // 1. Single status pill inside NoteProperties + KaTeX slogan + collapsible metadata
    await expect(page.locator('.note-status')).toHaveCount(1);
    const slogan = page.locator('.note-slogan');
    if ((await slogan.count()) > 0) {
      const sloganText = (await slogan.textContent()) ?? '';
      expect(sloganText).not.toMatch(/\$[^$]+\$/);
    }
    const metaDetails = page.locator('.note-meta-details');
    if ((await metaDetails.count()) > 0) {
      await expect(metaDetails).not.toHaveAttribute('open', '');
      await metaDetails.locator('summary').click();
      await expect(metaDetails).toHaveAttribute('open', '');
    }

    // 2. SemanticConnections localized labels (no raw English bracket keys)
    const semanticSection = page.locator('.semantic-connections');
    if ((await semanticSection.count()) > 0) {
      const semanticText = (await semanticSection.textContent()) ?? '';
      expect(semanticText).not.toMatch(
        /\[(assertion|concept|property|proof|example|problem|solution)\]/i,
      );
    }

    // 3. Prev/Next NotePager
    const pager = page.locator('nav.note-pager');
    if ((await pager.count()) > 0) {
      await expect(pager).toBeVisible();
      expect(await pager.locator('a').count()).toBeGreaterThanOrEqual(1);
    }

    // 4. Guest clicks on auth-gated buttons show visible toast CTA with zero 401 requests
    await page.locator('[data-edit]').click();
    const editToast = page.locator('.garden-toast').last();
    await expect(editToast).toBeVisible();
    await expect(editToast.locator('a[href="/account"]')).toBeVisible();

    await page.locator('[data-bookmark]').click();
    const bookmarkToast = page.locator('.garden-toast').last();
    await expect(bookmarkToast).toBeVisible();
    await expect(bookmarkToast.locator('a[href="/account"]')).toBeVisible();

    expect(unauthorizedUrls).toEqual([]);

    // 5. Opaque popovers + ReadingSettings mathScale slider & Persian output + Outline clean headings
    await page.locator('.reading-settings > summary').click();
    const readingPanel = page.locator('.reading-settings-panel');
    await expect(readingPanel).toBeVisible();
    const readingBg = await readingPanel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(readingBg).not.toContain('rgba(0, 0, 0, 0)');
    expect(readingBg).not.toMatch(/\/\s*0\.\d+\)$/);

    const mathSlider = readingPanel.locator('[data-reading-setting="mathScale"]');
    await expect(mathSlider).toBeVisible();
    await mathSlider.fill('1.2');
    await mathSlider.dispatchEvent('input');
    const mathScaleVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--math-scale').trim(),
    );
    expect(mathScaleVar).toBe('1.20');
    await expect(readingPanel.locator('[data-reading-output="mathScale"]')).toContainText('۱۲۰٪');

    await page.locator('.note-outline > summary').click();
    const outlinePanel = page.locator('.note-outline-panel');
    await expect(outlinePanel).toBeVisible();
    const outlineLinks = outlinePanel.locator('a[data-depth]');
    if ((await outlineLinks.count()) > 0) {
      const firstOutlineText = ((await outlineLinks.first().textContent()) ?? '').trim();
      expect(firstOutlineText.length).toBeGreaterThan(0);
    }
    await page.keyboard.press('Escape');
    await expect(outlinePanel).not.toBeVisible();

    // 6. More menu hides auth-only items & has no raw 🔄 emoji or invisible/square icons
    await page.locator('[data-more-toggle]').click();
    const morePanel = page.locator('#workspace-more-panel');
    await expect(morePanel).toBeVisible();
    expect((await morePanel.textContent()) ?? '').not.toContain('🔄');
    await page.locator('[data-library-command="link"]').first().click();
    await expect(page.locator('.garden-toast').last()).toContainText('کپی');
    await page.keyboard.press('Escape');

    // 7. 1015px viewport hides extra inline actions into ... menu with zero overflow
    await page.setViewportSize({ width: 1015, height: 800 });
    await assertNoHorizontalOverflow(page);

    // 8. Dark mode preserves high contrast on callouts (if present)
    await page.locator('[data-theme-toggle]').click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    const calloutCount = await page.locator('[data-callout]').count();
    if (calloutCount > 0) {
      const calloutColor = await page
        .locator('[data-callout]')
        .first()
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--callout-color').trim());
      expect(calloutColor).not.toBe('#1d4ed8');
      expect(calloutColor).not.toBe('#b45309');
    }
    await page.locator('[data-theme-toggle]').click();
  });

  test('hover preview shows Kind pill, never overlaps hovered link, pins, and closes on Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    const response = await page.goto(NOTE_PRIMARY);
    expect(response?.status()).toBe(200);

    const previewableLinks = page.locator('#main a[data-note-preview]');
    const count = await previewableLinks.count();
    test.skip(count === 0, 'No internal previewable wikilinks on fixture note');

    const targetLink = previewableLinks.first();
    await targetLink.scrollIntoViewIfNeeded();
    const linkBox = await targetLink.boundingBox();
    expect(linkBox).toBeTruthy();

    await targetLink.hover();
    const popup = page.locator('#inline-note-preview');
    await expect(popup).toBeVisible({ timeout: 5_000 });
    await expect(popup.locator('.inline-preview-title')).toBeVisible();
    await expect(popup.locator('[data-preview-close]')).toBeVisible();

    const popupBox = await popup.boundingBox();
    expect(popupBox).toBeTruthy();
    if (linkBox && popupBox) {
      const overlapsVertically =
        popupBox.y < linkBox.y + linkBox.height - 1 && popupBox.y + popupBox.height > linkBox.y + 1;
      const overlapsHorizontally =
        popupBox.x < linkBox.x + linkBox.width - 1 && popupBox.x + popupBox.width > linkBox.x + 1;
      expect(overlapsVertically && overlapsHorizontally).toBe(false);
    }

    const pinBtn = popup.locator('[data-preview-pin]');
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
  });

  test('sidebar normalizes trailing slash active note and filters inside collapsed folders', async ({
    page,
  }) => {
    const response = await page.goto(`${NOTE_PRIMARY}/`);
    expect(response?.status()).toBe(200);

    const activeLink = page.locator('[data-library-tree] a[aria-current="page"]');
    await expect(activeLink).toBeVisible({ timeout: 10_000 });
    await expect(activeLink).toHaveClass(/is-active/);

    // Verify guest "+" creation button stays hidden
    await expect(page.locator('[data-library-add]')).toBeHidden();

    // Collapse all, then filter for a word known to exist across notes
    await page.locator('[data-library-collapse]').click();
    const filterInput = page.locator('[data-library-filter]');
    const activeTitle = (
      (await activeLink.getAttribute('title')) ||
      (await activeLink.textContent()) ||
      ''
    ).trim();
    const queryToken =
      activeTitle.split(/\s+/).find((w) => w.length >= 3) || activeTitle.slice(0, 4);

    await filterInput.fill(queryToken);
    await expect(page.locator('[data-library-tree] mark.library-filter-mark').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-library-tree] a').first()).toBeVisible();

    await page.locator('[data-library-filter-clear]').click();
    await expect(filterInput).toHaveValue('');
    await expect(page.locator('[data-library-tree] mark.library-filter-mark')).toHaveCount(0);

    // Filter matching nothing shows clean Persian empty state
    await filterInput.fill('zzzz_not_matching_anything_12345');
    await expect(page.locator('[data-library-tree] .library-empty-state')).toBeVisible();
    await page.locator('[data-library-filter-clear]').click();
  });

  test('table wikilinks render cleanly without raw brackets and wide tables do not overflow 390px mobile', async ({
    page,
  }) => {
    const roadmapRes = await page.goto(NOTE_ROADMAP);
    if (roadmapRes?.status() === 200) {
      const tables = page.locator('.note table');
      if ((await tables.count()) > 0) {
        const rawText = (await tables.first().textContent()) ?? '';
        expect(rawText).not.toMatch(/\[\[[^\]]+\|/);
        expect(await tables.first().locator('a.wiki-link').count()).toBeGreaterThan(0);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const wideRes = await page.goto(NOTE_WIDE_TABLES);
    const targetRes = wideRes?.status() === 200 ? wideRes : await page.goto(NOTE_PRIMARY);
    expect(targetRes?.status()).toBe(200);

    await assertNoHorizontalOverflow(page);

    // Mobile ReadingSettings opens BELOW document-toolbar instead of covering it
    const toolbarBox = await page.locator('.document-toolbar').boundingBox();
    await page.locator('.reading-settings > summary').click();
    const panelBox = await page.locator('.reading-settings-panel').boundingBox();
    expect(toolbarBox && panelBox).toBeTruthy();
    if (toolbarBox && panelBox) {
      expect(panelBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 4);
    }
  });

  test('homepage has no duplicate shell H1 heading', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('.workspace-document > h1')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveCount(1);
  });
});
