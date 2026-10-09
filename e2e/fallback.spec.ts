import { APP_PATH, expect, test } from './fixtures';

test.describe('boot without WebGL2', () => {
  test('shows the static fallback and never fetches the renderer chunk', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.goto(APP_PATH);

    const fallback = page.getByTestId('webgl-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText('This browser cannot run the game.');
    await expect(page.locator('#app')).toBeHidden();

    const rendererChunk = requested.filter((url) => /\/three-[\w-]*\.js/.test(url));
    expect(rendererChunk, 'the Three.js chunk must not be downloaded').toEqual([]);
  });
});
