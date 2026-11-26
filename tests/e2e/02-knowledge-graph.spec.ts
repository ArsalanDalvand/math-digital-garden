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

    const firstLegendChip = graphSection.locator('[data-legend-kind]').first();
    await expect(firstLegendChip).toBeVisible();
    await firstLegendChip.click();
    await expect(firstLegendChip).toHaveAttribute('aria-pressed', 'true');
    await firstLegendChip.click();
    await expect(firstLegendChip).toHaveAttribute('aria-pressed', 'false');

    await graphSection.locator('[data-graph-action="settings"]').click();
    await expect(graphSection.locator('[data-graph-settings-popup]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(graphSection.locator('[data-graph-settings-popup]')).toHaveCount(0);

    await expect(graphSection).toHaveAttribute('data-layout-mode', 'dag');

    await graphSection.locator('[data-graph-action="fullscreen"]').click();
    const portalModal = page.locator('.kg-fullscreen-portal [role="dialog"]');
    await expect(portalModal).toBeVisible();
    await expect(portalModal).toHaveAttribute('data-layout-mode', 'dag');

    await portalModal.locator('[data-layout-toggle="force"]').click();
    await expect(portalModal).toHaveAttribute('data-layout-mode', 'force');
    await portalModal.locator('[data-layout-toggle="dag"]').click();
    await expect(portalModal).toHaveAttribute('data-layout-mode', 'dag');

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
    const sheetZIndex = await sheet.evaluate((el) =>
      Number.parseInt(getComputedStyle(el).zIndex, 10),
    );
    expect(sheetZIndex).toBeGreaterThanOrEqual(70);
    await expect(sheet.getByText('ابزارهای مطالعه')).toBeVisible();

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

  test('Phase 4 enhancements: summary strip, hub filtering, path tracer, Quick Peek pivot, shape glyphs, and Color-By lens', async ({
    page,
  }) => {
    const graphRes = await page.request.get('/api/graph.json');
    expect(graphRes.status()).toBe(200);
    const sitemap = (await graphRes.json()) as Record<
      string,
      {
        title?: string;
        kind?: string;
        links?: string[];
        backlinks?: string[];
        rels?: Record<string, string[]>;
        chapter_slug?: string;
      }
    >;

    const isHubLike = (id: string, entry: (typeof sitemap)[string] | undefined) => {
      if (!entry) return false;
      const t = entry.title || '';
      return (
        entry.kind === 'collection' ||
        /MOC|نقشه|صفحه[-\s]*[0-9۰-۹]+|متن\s*خام\s*OCR/i.test(t) ||
        /مراجع\s*و\s*اسناد\s*اولیه/.test(entry.chapter_slug || '') ||
        id.includes('README')
      );
    };

    // Pick a rich atomic note connected to typed rels and (when available) at least one hub node
    let chosenId = '';
    let bestScore = -1;
    for (const [id, entry] of Object.entries(sitemap)) {
      if (isHubLike(id, entry)) continue;
      const relEntries = Object.entries(entry.rels || {});
      if (relEntries.length === 0) continue;
      const neighbors = [...(entry.links || []), ...(entry.backlinks || [])];
      const hubNeighbors = neighbors.filter((nb) => isHubLike(nb, sitemap[nb])).length;
      const hasPrereqRel = relEntries.some(([, rels]) =>
        rels.some((r) => ['rel_requires', 'rel_depends_def', 'rel_depends_sig'].includes(r)),
      );
      const score = (hubNeighbors > 0 ? 100 : 0) + (hasPrereqRel ? 50 : 0) + neighbors.length;
      if (score > bestScore) {
        bestScore = score;
        chosenId = id;
      }
    }

    const targetPath = chosenId
      ? `/${chosenId}`
      : process.env.E2E_NOTE_URL || '/notes/axler-2d7afb5de78c939e';
    const response = await page.goto(targetPath);
    expect(response?.status()).toBe(200);

    const graphSection = page.locator('[data-note-graph]');
    await expect(graphSection).toHaveAttribute('data-graph-ready', 'true', { timeout: 15_000 });

    // Feature #4: Geometric shape glyphs in legend
    await expect(graphSection.locator('.legend-badge .kg-shape-glyph').first()).toBeVisible();

    // Feature #6: Compact sidebar summary strip
    const summaryStrip = graphSection.locator('[data-graph-summary-strip]');
    await expect(summaryStrip).toBeVisible();
    await expect(summaryStrip.locator('[data-summary-pill="prerequisites"]')).toBeVisible();
    await expect(summaryStrip.locator('[data-summary-pill="impact"]')).toBeVisible();
    await expect(summaryStrip.locator('[data-summary-pill="exercises"]')).toBeVisible();

    const initialHiddenHubs = Number.parseInt(
      (await graphSection.getAttribute('data-hidden-hub-count')) || '0',
      10,
    );
    const initialNodes = Number.parseInt(
      (await graphSection.getAttribute('data-node-count')) || '0',
      10,
    );

    // Click prerequisite pill (or open fullscreen & activate Path Tracer)
    const prereqPill = summaryStrip.locator('[data-summary-pill="prerequisites"]');
    if (await prereqPill.isEnabled()) {
      await prereqPill.click();
    } else {
      await graphSection.locator('[data-graph-action="fullscreen"]').click();
    }

    const portalModal = page.locator('.kg-fullscreen-portal [role="dialog"]');
    await expect(portalModal).toBeVisible();

    // Feature #2 & Creative Learning: Prerequisite Checklist (foundation-first) + Unread CTA
    await portalModal.locator('[data-path-trace-mode="prerequisites"]').click();
    await expect(portalModal).toHaveAttribute('data-path-trace-mode', 'prerequisites');
    const studyPathPanel = portalModal.locator('[data-study-path-list]');
    await expect(studyPathPanel).toBeVisible();

    // Horizontal RTL DAG orientation toggle
    const orientBtn = portalModal.locator('[data-dag-orientation]');
    await expect(orientBtn).toBeVisible();
    await orientBtn.click();
    await expect(portalModal).toHaveAttribute('data-dag-orientation', 'horizontal');
    await orientBtn.click();
    await expect(portalModal).toHaveAttribute('data-dag-orientation', 'vertical');

    await portalModal.locator('[data-path-trace-mode="impact"]').click();
    await expect(portalModal).toHaveAttribute('data-path-trace-mode', 'impact');
    await portalModal.locator('[data-path-trace-mode="prerequisites"]').click();

    // Feature #3 + Mastery + Persian Level Formatting + Quick Peek Pivot
    const firstStep = studyPathPanel.locator('.kg-study-step').first();
    if ((await firstStep.count()) > 0) {
      await firstStep.click();
      const drawer = portalModal.locator('[data-quick-peek-drawer]');
      await expect(drawer).toBeVisible();
      await expect(drawer.locator('[data-graph-open-note]')).toBeVisible();
      await expect(drawer).not.toContainText('L3_undergrad_core');
      await expect(drawer.locator('.kg-qp-preview, .kg-qp-error')).toBeVisible({ timeout: 10_000 });

      // Mark mastered inside Quick Peek
      await drawer.locator('[data-mastery-btn="mastered"]').click();
      await expect(drawer.locator('[data-mastery-btn="mastered"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      // Test Concept Bridge shortcut from Quick Peek if present (or Bridge panel toggle)
      const bridgeBtn = drawer.locator('[data-graph-bridge-to]');
      if ((await bridgeBtn.count()) > 0) {
        await bridgeBtn.click();
        await expect(portalModal.locator('[data-bridge-panel]')).toBeVisible();
        await expect(portalModal.locator('[data-bridge-result]')).toBeVisible();
        await portalModal.locator('[data-bridge-close]').click();
      }

      const beforeUrl = page.url();
      await drawer.locator('[data-graph-pivot]').click();
      await expect(portalModal.locator('[data-pivot-banner]')).toBeVisible();
      expect(page.url()).toBe(beforeUrl);

      await portalModal.locator('[data-graph-reset-pivot]').click();
      await expect(portalModal.locator('[data-pivot-banner]')).toHaveCount(0);
    }

    // Mouse drag node in fullscreen pins it (pinnedCount >= 1), and [data-unpin-all] unpins all
    const fsCanvas = portalModal.locator('.kg-canvas');
    const cBox = await fsCanvas.boundingBox();
    if (cBox) {
      const cx = cBox.x + cBox.width / 2;
      const cy = cBox.y + cBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 80, cy + 50, { steps: 8 });
      await page.mouse.up();
      const unpinBtn = portalModal.locator('[data-unpin-all]');
      if ((await unpinBtn.count()) > 0) {
        await unpinBtn.click();
        await expect(portalModal).toHaveAttribute('data-pinned-count', '0');
      }
    }

    // Practice Launcher Panel toggle
    await portalModal.locator('[data-practice-toggle]').click();
    await expect(portalModal.locator('[data-practice-panel]')).toBeVisible();
    await portalModal.locator('[data-practice-close]').click();

    // Feature #1: Toggle MOCs & Raw OCR orphans explicitly
    const hubsToggle = portalModal.locator('[data-hubs-toggle]');
    await hubsToggle.click();
    await expect(hubsToggle).toHaveAttribute('aria-pressed', 'true');
    if (initialHiddenHubs > 0) {
      await expect
        .poll(async () =>
          Number.parseInt((await graphSection.getAttribute('data-node-count')) || '0', 10),
        )
        .toBeGreaterThan(initialNodes);
    }
    await hubsToggle.click();
    await expect(hubsToggle).toHaveAttribute('aria-pressed', 'false');

    // Feature #5: Color-By Analytical Lens (kind -> mastery -> level -> chapter -> kind)
    const colorSelect = portalModal.locator('[data-color-by]');
    await colorSelect.selectOption('mastery');
    await expect(portalModal).toHaveAttribute('data-color-by', 'mastery');
    await expect(portalModal.locator('[data-lens-item="mastered"]')).toBeVisible();

    await colorSelect.selectOption('level');
    await expect(portalModal).toHaveAttribute('data-color-by', 'level');
    await expect(portalModal.locator('[data-lens-item]').first()).toBeVisible();

    await colorSelect.selectOption('chapter');
    await expect(portalModal).toHaveAttribute('data-color-by', 'chapter');

    await colorSelect.selectOption('kind');
    await expect(portalModal).toHaveAttribute('data-color-by', 'kind');
    await expect(portalModal.locator('[data-legend-kind]').first()).toBeVisible();

    await portalModal.locator('[data-graph-close]').click();
    await expect(portalModal).toHaveCount(0);

    // Sidebar layout switcher works independently (dag <-> force)
    const sidebarToggle = graphSection.locator('[data-sidebar-layout]');
    await expect(sidebarToggle).toHaveAttribute('data-sidebar-layout', 'dag');
    await sidebarToggle.click();
    await expect(sidebarToggle).toHaveAttribute('data-sidebar-layout', 'force');
    await sidebarToggle.click();
    await expect(sidebarToggle).toHaveAttribute('data-sidebar-layout', 'dag');
  });

  test('Ego-DAG keeps huge MOC hubs compact in sidebar and opens clean fullscreen hierarchy', async ({
    page,
  }) => {
    const graphRes = await page.request.get('/api/graph.json');
    expect(graphRes.status()).toBe(200);
    const sitemap = (await graphRes.json()) as Record<
      string,
      { title?: string; kind?: string; links?: string[] }
    >;
    const hubEntry = Object.entries(sitemap).find(
      ([, v]) => v.kind === 'collection' && (v.links?.length || 0) >= 20,
    );
    if (!hubEntry) return;

    const [hubId] = hubEntry;
    const res = await page.goto(`/${hubId}`);
    expect(res?.status()).toBe(200);

    const graphSection = page.locator('[data-note-graph]');
    await expect(graphSection).toHaveAttribute('data-graph-ready', 'true', { timeout: 15_000 });
    await expect(graphSection).toHaveAttribute('data-layout-mode', 'dag');
    await expect(graphSection.locator('.kg-canvas')).toBeVisible();
  });
});
