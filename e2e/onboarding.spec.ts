import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ freshVisitor: true });

const dialog = (page: Page) => page.getByRole('dialog', { name: /Meet the cats|order|hello/ });

const words = async (page: Page): Promise<number> => {
  const text = (await dialog(page).textContent()) ?? '';
  return text.trim().split(/\s+/).length;
};

const lines = (page: Page): Promise<string[]> =>
  page.$$eval('aside li[data-line]', (els) => els.map((e) => e.textContent ?? ''));

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
});

test('welcomes a first visit in three short steps, three keypresses in all', async ({ page }) => {
  await expect(dialog(page)).toBeVisible();
  const before = await page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0);

  let presses = 0;
  for (let step = 1; step <= 3; step++) {
    await expect(dialog(page)).toContainText(`${String(step)} of 3`);
    expect(await words(page), `step ${String(step)} is too wordy`).toBeLessThanOrEqual(40);
    await expect(page.locator('[role=dialog] button[data-primary]')).toBeFocused();
    await page.keyboard.press('Enter');
    presses++;
  }
  expect(presses).toBeLessThanOrEqual(8);
  await expect(dialog(page)).toBeHidden();

  // The two steps that act did act.
  await expect.poll(async () => (await lines(page)).join(' ')).toMatch(/raise a hill here/);
  await expect.poll(async () => (await lines(page)).join(' ')).toMatch(/hello/);
  await expect
    .poll(async () => page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0), {
      timeout: 8000,
    })
    .toBeGreaterThan(before);

  // Seen once is enough.
  await page.reload();
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('can be skipped at once, and brought back from settings', async ({ page }) => {
  await expect(dialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.click('summary:has-text("Settings")');
  await page.getByRole('button', { name: /show the welcome again/i }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('1 of 3');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a keyboard-only player meets her, gives an order, chats, and reaches settings', async ({
  page,
}) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();

  // To the command box without touching the mouse.
  for (let i = 0; i < 12; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === 'command') break;
    await page.keyboard.press('Tab');
  }
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('command');
  const before = (await lines(page)).length;
  await page.keyboard.type('what are you doing');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(before + 1);

  // On to settings, open it, and change something.
  for (let i = 0; i < 12; i++) {
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    if (tag === 'SUMMARY') break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('#pref-theme')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#pref-theme')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#pref-motion')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#pref-motion')).toBeChecked();
});
