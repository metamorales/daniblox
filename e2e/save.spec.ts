import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const SAVE_KEY = 'daniblox:v1';

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
}

/** Put a tile on the ground at a fixed column and return its cell. */
async function placeMarker(page: Page): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(() => {
    const app = window.__app;
    if (!app) throw new Error('no app');
    const y = app.world.surfaceHeight(20, 20) + 1;
    app.editBlock(20, y, 20, 7);
    return { x: 20, y, z: 20 };
  });
}

const blockAt = (page: Page, c: { x: number; y: number; z: number }): Promise<number> =>
  page.evaluate((cell) => window.__app?.world.get(cell.x, cell.y, cell.z) ?? -1, c);

const saved = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);

test.describe('saving', () => {
  test('keeps an edit, the chat, her pockets and a setting across a reload', async ({ page }) => {
    await page.goto(APP_PATH);
    await ready(page);
    const marker = await placeMarker(page);
    await page.fill('#command', 'hello');
    await page.click('button[type=submit]');
    await page.click('summary:has-text("Settings")');
    await page.selectOption('#pref-theme', 'dark');
    await expect.poll(() => saved(page), { timeout: 6000 }).not.toBeNull();
    // The saver looks every two seconds; give the last change time to land.
    await page.waitForTimeout(2600);

    await page.reload();
    await ready(page);
    expect(await blockAt(page, marker)).toBe(7);
    await expect(page.locator('aside li[data-line]').first()).toContainText('hello');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('reset removes the save, grows a new meadow, and keeps the settings', async ({ page }) => {
    await page.goto(APP_PATH);
    await ready(page);
    const marker = await placeMarker(page);
    const seed = await page.evaluate(() => window.__app?.world.seed ?? 0);
    await page.click('summary:has-text("Settings")');
    await page.selectOption('#pref-theme', 'light');
    await expect.poll(() => saved(page), { timeout: 6000 }).not.toBeNull();

    await page.getByRole('button', { name: 'Reset the world' }).click();
    await page.getByRole('button', { name: 'Yes, reset it' }).click();

    await expect.poll(() => saved(page)).toBeNull();
    expect(await page.evaluate(() => window.__app?.world.seed ?? 0)).not.toBe(seed);
    expect(await blockAt(page, marker)).not.toBe(7);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('dialog')).toBeHidden();
    // Luciana is back on the ground, not inside the new terrain.
    const clipped = await page.evaluate(() => {
      const app = window.__app;
      const kit = app?.kits[0];
      if (!app || !kit) return true;
      return app.world.get(kit.cell.x, kit.cell.y, kit.cell.z) !== 0;
    });
    expect(clipped).toBe(false);
  });

  test('saves nothing it was not shown: no key in the save', async ({ page }) => {
    await page.goto(APP_PATH);
    await ready(page);
    await page.click('summary:has-text("Settings")');
    await page.fill('input[type=password]', 'sk-canary-save-7');
    await page.click('button:has-text("Use this model")');
    await placeMarker(page);
    await expect.poll(() => saved(page), { timeout: 6000 }).not.toBeNull();
    expect(await saved(page)).not.toContain('sk-canary-save-7');
  });
});

test.describe('share links', () => {
  test('carry the edits into a fresh visit', async ({ page, browser }) => {
    await page.goto(APP_PATH);
    await ready(page);
    const marker = await placeMarker(page);
    await page.click('summary:has-text("Settings")');
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#s=\d+&w=/);
    await expect(page.getByRole('status')).toContainText(/link/i);
    const hash = await page.evaluate(() => window.location.hash);
    const seed = await page.evaluate(() => window.__app?.world.seed ?? 0);

    const guest = await browser.newContext();
    const other = await guest.newPage();
    await other.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
    await other.goto(APP_PATH + hash);
    await ready(other);
    expect(await other.evaluate(() => window.__app?.world.seed ?? 0)).toBe(seed);
    expect(await blockAt(other, marker)).toBe(7);
    await guest.close();
  });

  test('a visitor with a save keeps it until they change the shared world', async ({ page }) => {
    await page.goto(APP_PATH);
    await ready(page);
    await placeMarker(page);
    await expect.poll(() => saved(page), { timeout: 6000 }).not.toBeNull();
    await page.waitForTimeout(2600);
    const before = await saved(page);

    // A hash change alone is a same-document jump; the app has to start again.
    await page.evaluate(() => {
      window.location.hash = '#s=5';
    });
    await page.reload();
    await ready(page);
    await expect(page.getByRole('status')).toContainText(/shared world/i);
    expect(await page.evaluate(() => window.__app?.world.seed ?? 0)).toBe(5);
    await page.waitForTimeout(2600);
    expect(await saved(page), 'the save changed before any edit').toBe(before);

    const mine = await placeMarker(page);
    await expect.poll(() => saved(page), { timeout: 6000 }).not.toBe(before);
    expect(await saved(page)).toContain('"seed":5');
    // The link has done its job and leaves the address bar.
    expect(await page.evaluate(() => window.location.hash)).toBe('');

    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => window.__app?.world.seed ?? 0)).toBe(5);
    expect(await blockAt(page, mine)).toBe(7);
  });

  test('a damaged link says so and falls back', async ({ page }) => {
    await page.goto(`${APP_PATH}#s=12&w=zzz&h=00000000`);
    await ready(page);
    await expect(page.getByRole('status')).toContainText(/damaged/i);
    expect(await page.evaluate(() => window.__app?.world.seed ?? 0)).toBe(20260409);
  });
});
