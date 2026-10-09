import { APP_PATH, expect, test } from './fixtures';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
});

test('every control is at least 44 px tall and wide', async ({ page }) => {
  await page.getByRole('button', { name: /show more/i }).click();
  await page.click('summary:has-text("Settings")');
  const small = await page.$$eval('button, summary, input, select, a, [role=menuitem]', (els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      // A native checkbox is tiny by design; its 44 px label is the target.
      .map((el) =>
        el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.closest('label') ?? el) : el,
      )
      .map((el) => {
        const box = el.getBoundingClientRect();
        return { what: `${el.tagName}:${el.textContent?.trim().slice(0, 24) ?? ''}`, box };
      })
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(
        ({ what, box }) =>
          `${what} ${String(Math.round(box.width))}x${String(Math.round(box.height))}`,
      ),
  );
  expect(small, 'controls under 44 px').toEqual([]);
});

test('the panel is a sheet that rises from its handle', async ({ page }) => {
  const handle = page.getByRole('button', { name: /show more/i });
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  const peek = (await page.locator('#panel-body').boundingBox())?.height ?? 0;

  await handle.click();
  await expect(page.getByRole('button', { name: /hide the panel/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.waitForTimeout(300);
  const open = (await page.locator('#panel-body').boundingBox())?.height ?? 0;
  expect(open).toBeGreaterThan(peek);
});

test('draws the near distance without being asked', async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => window.__perf?.visibleChunks ?? 0))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__perf?.visibleChunks ?? 0))
    .toBeLessThanOrEqual(4);
});

test('a tap on a block opens the menu', async ({ page }) => {
  await page.touchscreen.tap(187, 300);
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 3000 });
});
