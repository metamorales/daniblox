import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const lines = (page: Page): Promise<string[]> =>
  page.$$eval('aside li[data-line]', (els) => els.map((e) => e.textContent ?? ''));

async function say(page: Page, text: string): Promise<void> {
  await page.fill('#command', text);
  await page.click('button[type=submit]');
}

const stateOf = (page: Page, index: number): Promise<string> =>
  page.evaluate((i) => window.__app?.kits[i]?.state ?? '', index);

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
});

test('two cats stand in the meadow, named in the roster', async ({ page }) => {
  const names = await page.evaluate(() => window.__app?.kits.map((k) => k.name) ?? []);
  expect(names).toEqual(['Luciana', 'Xochi']);
  await expect(page.getByRole('button', { name: /^Luciana/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^Xochi/ })).toBeVisible();
});

test('a line that starts with a name goes to that cat, and selects her', async ({ page }) => {
  await say(page, 'Xochi, wander');
  await expect.poll(() => stateOf(page, 1), { timeout: 8000 }).not.toBe('idle');
  expect(await stateOf(page, 0)).toBe('idle');
  await expect.poll(async () => (await lines(page)).join('\n')).toMatch(/Xochi/);
  await expect(page.getByRole('button', { name: /^Xochi/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('clicking a card picks who an unaddressed order goes to', async ({ page }) => {
  await page.getByRole('button', { name: /^Xochi/ }).click();
  await say(page, 'wander');
  await expect.poll(() => stateOf(page, 1), { timeout: 8000 }).not.toBe('idle');
  expect(await stateOf(page, 0)).toBe('idle');
});

test('pockets show what she carries, and the chosen block is what you place', async ({ page }) => {
  await page.evaluate(() => window.__app?.kits[0]?.take(5, 3));
  await expect(page.getByRole('button', { name: /^Luciana/ })).toContainText('3 bark');

  const count = (id: number): Promise<number> =>
    page.evaluate((want) => {
      let n = 0;
      for (const b of window.__app?.world.toBytes() ?? []) if (b === want) n++;
      return n;
    }, id);
  const gems = await count(8);
  await page.getByRole('button', { name: 'Place gem' }).click();
  await page.mouse.move(640, 430);
  await page.waitForTimeout(200);
  await page.mouse.click(640, 430);
  await page.getByRole('menuitem', { name: /put gem here yourself/i }).click();
  await expect.poll(() => count(8)).toBe(gems + 1);
});
