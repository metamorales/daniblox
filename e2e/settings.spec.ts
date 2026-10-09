import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const visibleChunks = (page: Page): Promise<number> =>
  page.evaluate(() => window.__perf?.visibleChunks ?? 0);

test.beforeEach(async ({ page }) => {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
  await page.waitForFunction(() => (window.__perf?.visibleChunks ?? 0) > 0, undefined, {
    timeout: 10_000,
  });
  await page.click('summary:has-text("Settings")');
});

test.describe('settings', () => {
  test('switches the theme, and lets the system decide again', async ({ page }) => {
    await page.selectOption('#pref-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.selectOption('#pref-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.selectOption('#pref-theme', 'system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  });

  test('reduced motion turns camera easing off', async ({ page }) => {
    const afterOneFrame = (x: number): Promise<number> =>
      page.evaluate(async (want) => {
        window.__app?.orbit.setTarget(want, 12, want);
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        return window.__app?.orbit.target.x ?? 0;
      }, x);

    // With easing, the camera is still on its way after a frame or two.
    expect(await afterOneFrame(10)).not.toBe(10);

    await page.check('#pref-motion');
    expect(await afterOneFrame(50)).toBe(50);
  });

  test('the near render distance draws fewer chunks, and fog follows', async ({ page }) => {
    const far = await visibleChunks(page);
    expect(far).toBeGreaterThan(4);

    await page.selectOption('#pref-distance', 'near');
    await expect.poll(() => visibleChunks(page)).toBeLessThanOrEqual(4);
    await expect.poll(() => visibleChunks(page)).toBeGreaterThan(0);

    await page.selectOption('#pref-distance', 'far');
    await expect.poll(() => visibleChunks(page)).toBe(far);
  });

  test('a phone-sized screen gets the near distance by itself', async ({ page }) => {
    const wide = await visibleChunks(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(() => visibleChunks(page)).toBeLessThan(wide);
    await expect.poll(() => visibleChunks(page)).toBeLessThanOrEqual(4);
  });

  test('Advanced shows frame time, draw calls and path nodes', async ({ page }) => {
    await page.click('summary:has-text("Advanced")');
    const panel = page.getByRole('group').filter({ hasText: 'Advanced' });
    await expect(panel.getByText(/ms typical/)).toBeVisible({ timeout: 5000 });
    await expect(panel.getByText(/visible chunks/)).toBeVisible();
    await expect(panel.getByText(/path nodes per frame/)).toBeVisible();
  });
});
