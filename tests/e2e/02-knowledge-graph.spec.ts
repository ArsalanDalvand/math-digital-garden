import { expect, test } from './fixtures.ts';

test.describe('Modular Knowledge Graph (React + Canvas + Portal)', () => {
  test('renders sidebar graph, switches depth & UMKO filters, opens fullscreen DAG modal via portal', async ({
    page,
  }) => {
    const targetUrl = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
    const response = await page.goto(targetUrl);
    expect(response?.status()).toBe(200);

    const graphSection = page.locator('[data-note-graph]');
    await expect(graphSection).toHaveAttribute('data-graph-ready', 'true', { timeout: 15_000 });

    const canvas = graphSection.locator('.kg-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);

    await graphSection.locator('[data-depth="2"]').click();
    await expect(graphSection).toHaveAttribute('data-depth-active', '2');
    await graphSection.locator('[data-depth="1"]').click();
    await expect(graphSection).toHaveAttribute('data-depth-active', '1');

    const assertionChip = graphSection.locator('[data-legend-kind="assertion"]');
    await assertionChip.click();
    await expect(assertionChip).toHaveAttribute('aria-pressed', 'true');
    await assertionChip.click();
    await expect(assertionChip).toHaveAttribute('aria-pressed', 'false');

    await graphSection.locator('[data-graph-action="settings"]').click();
    await expect(graphSection.locator('[data-graph-settings-popup]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(graphSection.locator('[data-graph-settings-popup]')).toHaveCount(0);

    await graphSection.locator('[data-graph-action="fullscreen"]').click();
    const portalModal = page.locator('.kg-fullscreen-portal [role="dialog"]');
    await expect(portalModal).toBeVisible();

    await portalModal.locator('[data-layout-toggle="dag"]').click();
    await expect(portalModal).toHaveAttribute('data-layout-mode', 'dag');
    await expect(graphSection).toHaveAttribute('data-layout-mode', 'dag');

    const umkoToggle = portalModal.locator('[data-typed-toggle]');
    await umkoToggle.click();
    await expect(umkoToggle).toHaveAttribute('aria-pressed', 'true');

    const searchInput = portalModal.locator('.kg-fs-search');
    await searchInput.fill('بردار');
    await expect(searchInput).toHaveValue('بردار');
    await page.keyboard.press('Escape');
    await expect(searchInput).toHaveValue('');
    await expect(portalModal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(portalModal).toHaveCount(0);
  });

  test('mobile study tools sheet allows opening and interacting with fullscreen graph portal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const targetUrl = process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
    const response = await page.goto(targetUrl);
    expect(response?.status()).toBe(200);

    const mobileTrigger = page.getByRole('button', { name: 'ابزارهای مطالعه' });
    await expect(mobileTrigger).toBeVisible();
    await mobileTrigger.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();

    const graphSection = sheet.locator('[data-note-graph]');
    await expect(graphSection).toHaveAttribute('data-graph-ready', 'true', { timeout: 15_000 });

    await graphSection.locator('[data-graph-action="fullscreen"]').click();
    const portalModal = page.locator('.kg-fullscreen-portal [role="dialog"]');
    await expect(portalModal).toBeVisible();

    const searchInput = portalModal.locator('.kg-fs-search');
    await searchInput.click();
    await searchInput.fill('گروه');
    await expect(searchInput).toHaveValue('گروه');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(portalModal).toHaveCount(0);
  });
});
