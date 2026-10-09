import { APP_PATH, expect, test } from './fixtures';

test.describe('talking to Luciana', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
  });

  const say = async (page: import('@playwright/test').Page, text: string): Promise<void> => {
    await page.fill('#command', text);
    await page.click('button[type=submit]');
  };

  const lines = (page: import('@playwright/test').Page): Promise<string[]> =>
    page.$$eval('aside li[data-line]', (els) => els.map((e) => e.textContent ?? ''));

  test('answers a greeting without doing anything', async ({ page }) => {
    await say(page, 'hello');
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(1);
    const said = await lines(page);
    expect(said[0]).toBe('hello');
    expect(said[1]?.length ?? 0).toBeGreaterThan(0);
  });

  test('raises a hill when asked', async ({ page }) => {
    const before = await page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0);
    await say(page, 'raise a big hill here');
    await expect
      .poll(async () => page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0), {
        timeout: 8000,
      })
      .toBeGreaterThan(before);
  });

  test('plants a forest when asked', async ({ page }) => {
    const barkBefore = await page.evaluate(() => {
      let n = 0;
      for (const b of window.__app?.world.toBytes() ?? []) if (b === 5) n++;
      return n;
    });
    await say(page, 'plant a forest here');
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            let n = 0;
            for (const b of window.__app?.world.toBytes() ?? []) if (b === 5) n++;
            return n;
          }),
        { timeout: 8000 },
      )
      .toBeGreaterThan(barkBefore);
  });

  test('builds a litter box when asked, from her pockets', async ({ page }) => {
    const bark = () =>
      page.evaluate(() => {
        let n = 0;
        for (const b of window.__app?.world.toBytes() ?? []) if (b === 5) n++;
        return n;
      });
    const before = await bark();
    await page.evaluate(() => {
      const kit = window.__app?.kits[0];
      kit?.take(5, 8);
      kit?.take(4, 1);
    });
    await say(page, 'build a litter box here');
    await expect.poll(bark, { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 8);
    await expect
      .poll(async () => (await lines(page)).join(' '), { timeout: 5000 })
      .toMatch(/litter box, done/i);
  });

  test('changes the time of day when asked', async ({ page }) => {
    await say(page, 'make it night');
    await expect
      .poll(async () => page.evaluate(() => window.__loop?.dayPhase ?? 0), { timeout: 5000 })
      .toBeGreaterThan(0.6);
  });

  test('walks somewhere when asked, and stops when told', async ({ page }) => {
    const start = await page.evaluate(() => window.__app?.kits[0]?.cell);
    await say(page, 'wander');
    await expect
      .poll(async () => page.evaluate(() => window.__app?.kits[0]?.cell.x ?? 0), {
        timeout: 10_000,
      })
      .not.toBe(start?.x);

    // The floating icon says what she is doing, and goes away when she stops.
    await expect
      .poll(async () => page.evaluate(() => window.__app?.activityIcon('luciana') ?? null))
      .toBe('wandering');

    await say(page, 'stop');
    await expect
      .poll(async () => page.evaluate(() => window.__app?.activityIcon('luciana') ?? null))
      .toBeNull();
    await page.waitForTimeout(500);
    const resting = await page.evaluate(() => window.__app?.kits[0]?.cell);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__app?.kits[0]?.cell)).toEqual(resting);
  });

  test('says it did not understand, and suggests something that works', async ({ page }) => {
    await say(page, 'tell me about the sea');
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(1);
    const said = await lines(page);
    const reply = said[said.length - 1] ?? '';
    expect(reply).toMatch(/try "/i);

    // The suggestion it offers must itself be a command it understands.
    const suggestion = /try "([^"]+)"/i.exec(reply)?.[1];
    expect(suggestion).toBeTruthy();
    const before = await lines(page);
    await say(page, suggestion ?? 'wander');
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(before.length + 1);
    const after = await lines(page);
    expect(after[after.length - 1]).not.toMatch(/over my head|did not quite follow/i);
  });

  test('keyboard alone can reach the command box and send', async ({ page }) => {
    await page.keyboard.press('Tab');
    for (let i = 0; i < 8; i++) {
      const focused = await page.evaluate(() => document.activeElement?.id ?? '');
      if (focused === 'command') break;
      await page.keyboard.press('Tab');
    }
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('command');
    await page.keyboard.type('wander');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(1);
  });

  test('announces what she is doing to a screen reader', async ({ page }) => {
    await say(page, 'wander');
    await expect
      .poll(async () => page.locator('[aria-live=polite]').textContent(), { timeout: 5000 })
      .not.toBe('');
  });
});
