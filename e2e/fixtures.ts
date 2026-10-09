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
export const test = base.extend<{
  consoleGuard: void;
  allowNetworkNoise: boolean;
  freshVisitor: boolean;
}>({
  /**
   * The welcome shows itself to a first-time visitor. Most tests are not
   * about the welcome, so they arrive as someone who has seen it.
   */
  freshVisitor: [false, { option: true }],

  /**
   * Tests that break the network on purpose set this. The browser logs a
   * failed request by itself, which is not our code misbehaving, and there is
   * no way to silence it from the page.
   */
  allowNetworkNoise: [false, { option: true }],

  consoleGuard: [
    async ({ page, allowNetworkNoise, freshVisitor }, use) => {
      if (!freshVisitor) {
        await page.addInitScript(() => {
          try {
            localStorage.setItem('daniblox:onboarded', '1');
          } catch {
            // Storage off: the welcome will show, and the test will say so.
          }
        });
      }
      const problems: string[] = [];
      const networkNoise = /Failed to load resource|net::ERR_|ERR_CONNECTION/i;
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (allowNetworkNoise && networkNoise.test(message.text())) return;
        problems.push(`console.error: ${message.text()}`);
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
