import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const solidCount = (page: Page): Promise<number> =>
  page.evaluate(() => {
    let n = 0;
    for (const byte of window.__app?.world.toBytes() ?? []) if (byte !== 0) n++;
    return n;
  });

const lines = (page: Page): Promise<string[]> =>
  page.$$eval('aside li[data-line]', (els) => els.map((e) => e.textContent ?? ''));

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
});

test.describe('the command palette', () => {
  test('opens on Ctrl+K, sends what was typed, and closes on Escape', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#palette-input')).toBeFocused();

    await page.keyboard.type('wander');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await lines(page)).join(' ')).toContain('wander');
    await expect
      .poll(async () => page.evaluate(() => window.__app?.kits[0]?.state ?? ''), { timeout: 8000 })
      .not.toBe('idle');

    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('breaks and places a block for the player at the reticle', async ({ page }) => {
    // Away from Luciana: she spawns at the orbit point, and breaking the
    // block under her feet would drop her into the cell the tile wants.
    await page.evaluate(() => window.__app?.orbit.setTarget(20, 12, 20));
    await page.waitForFunction(() => window.__app?.orbit.targetCell().x === 20, undefined, {
      timeout: 5000,
    });
    const start = await solidCount(page);

    await page.keyboard.press('Control+k');
    await page.keyboard.type('break the block');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#palette-list [aria-selected=true]')).toHaveText(
      /Break the block here/,
    );
    await page.keyboard.press('Enter');
    await expect.poll(() => solidCount(page)).toBeLessThan(start);

    const broken = await solidCount(page);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('place your block');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => solidCount(page)).toBeGreaterThan(broken);
  });

  test('F brings the camera to Luciana', async ({ page }) => {
    await page.evaluate(() => {
      const app = window.__app;
      const kit = app?.kits[0];
      if (!app || !kit) return;
      app.orbit.setTarget(4, 10, 4);
    });
    await page.waitForTimeout(600);
    await page.keyboard.press('f');
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const app = window.__app;
            const kit = app?.kits[0];
            if (!app || !kit) return 999;
            return Math.hypot(
              app.orbit.target.x - kit.position.x,
              app.orbit.target.z - kit.position.z,
            );
          }),
        { timeout: 4000 },
      )
      .toBeLessThan(1.5);
  });
});

test.describe('pointing at a block', () => {
  test('a click opens the menu, and "Mine this" sets Luciana digging', async ({ page }) => {
    await page.mouse.move(640, 430);
    await page.waitForTimeout(200);
    await page.mouse.click(640, 430);

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Go here' })).toBeFocused();

    await page.getByRole('menuitem', { name: 'Mine this' }).click();
    await expect(menu).toBeHidden();
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(0);
    await expect
      .poll(async () => page.evaluate(() => window.__app?.kits[0]?.activity ?? ''), {
        timeout: 8000,
      })
      .not.toBe('');
  });

  test('"Break it yourself" removes the block at once', async ({ page }) => {
    const start = await solidCount(page);
    await page.mouse.move(640, 430);
    await page.waitForTimeout(200);
    await page.mouse.click(640, 430);
    await page.getByRole('menuitem', { name: 'Break it yourself' }).click();
    await expect.poll(() => solidCount(page)).toBeLessThan(start);
  });

  test('the menu walks with the arrow keys and closes on Escape', async ({ page }) => {
    await page.mouse.move(640, 430);
    await page.waitForTimeout(200);
    await page.mouse.click(640, 430);
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Mine this' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  });

  test('a long press opens the same menu, for touch', async ({ page }) => {
    await page.mouse.move(640, 430);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await expect(page.getByRole('menu')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByRole('menu')).toBeVisible();
  });
});
