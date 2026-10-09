import { APP_PATH, expect, test } from './fixtures';

test.describe('focus and motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
  });

  test('every element reached by Tab shows a visible focus ring', async ({ page }) => {
    await page.click('summary:has-text("Settings")');
    const seen = new Set<string>();
    const missing: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        // Identity by position in the document, so two look-alike inputs
        // are not mistaken for a wrap-around.
        const key = `${String([...document.querySelectorAll('*')].indexOf(el))}:${el.tagName}#${el.id}`;
        return {
          key,
          ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        };
      });
      if (!info) continue;
      if (seen.has(info.key)) break;
      seen.add(info.key);
      if (!info.ring) missing.push(info.key);
    }
    expect(seen.size).toBeGreaterThan(8);
    expect(missing, 'focused without a visible ring').toEqual([]);
  });

  test('the canvas is labelled and the live region exists', async ({ page }) => {
    await expect(page.locator('#app canvas')).toHaveAttribute('aria-label', /Daniblox world view/);
    await expect(page.locator('[aria-live=polite]')).toHaveCount(1);
  });
});

test.describe('when the system asks for reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the camera stops easing', async ({ page }) => {
    await page.goto(APP_PATH);
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
    const landed = await page.evaluate(async () => {
      window.__app?.orbit.setTarget(12, 12, 12);
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      return window.__app?.orbit.target.x ?? 0;
    });
    expect(landed).toBe(12);
  });
});
