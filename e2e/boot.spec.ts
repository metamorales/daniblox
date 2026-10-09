import { APP_PATH, expect, test } from './fixtures';

test.describe('boot with WebGL2', () => {
  test('renders frames, shows the wordmark, and never shows the fallback', async ({ page }) => {
    await page.goto(APP_PATH);

    await expect(page.getByTestId('webgl-fallback')).toBeHidden();
    await expect(page.getByRole('img', { name: 'Daniblox' })).toBeVisible();

    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 0, undefined, {
      timeout: 15_000,
    });
    const frames = await page.evaluate(() => window.__app?.frames ?? 0);
    expect(frames).toBeGreaterThan(0);

    const canvas = page.locator('#app canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('aria-label', /Daniblox world view/);
  });

  test('loads both self-hosted fonts', async ({ page }) => {
    await page.goto(APP_PATH);
    await page.evaluate(() => document.fonts.ready);

    // Poll rather than sampling once: a font only starts loading when something
    // on the page actually uses it, so a single check can run too early.
    await page
      .waitForFunction(
        () =>
          document.fonts.check('16px "Pixelify Sans"') &&
          document.fonts.check('16px "Press Start 2P"'),
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => {
        throw new Error('self-hosted fonts never became usable');
      });

    const served = await page.evaluate(async () => {
      const paths = ['fonts/pixelify-sans-latin.woff2', 'fonts/press-start-2p-latin.woff2'];
      const results = await Promise.all(
        paths.map(async (p) => (await fetch(new URL(p, document.baseURI))).status),
      );
      return results;
    });
    expect(served, 'both woff2 files must be served from this origin').toEqual([200, 200]);
  });
});
