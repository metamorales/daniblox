import { test as base, expect } from '@playwright/test';

/** Vite `base` from vite.config.ts; the deployed site lives at the same path. */
export const APP_PATH = '/daniblox/';

declare global {
  interface Window {
    __unhandled?: string[];
  }
}

/**
 * Every test fails if the page logged a console error, threw, or left an
 * unhandled promise rejection (spec R11.1).
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      await page.addInitScript(() => {
        window.__unhandled = [];
        window.addEventListener('unhandledrejection', (event) => {
          window.__unhandled?.push(String(event.reason));
        });
      });

      await use();

      const unhandled = await page.evaluate(() => window.__unhandled ?? []).catch(() => []);
      expect(problems, 'the page logged errors').toEqual([]);
      expect(unhandled, 'the page left unhandled promise rejections').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
