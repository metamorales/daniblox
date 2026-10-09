#!/usr/bin/env node
/**
 * The R6 numbers (plan M8), against `vite preview` in a headed Chromium so
 * the real GPU is used: the sixty-second bench, a phone-sized run under a
 * four-times CPU throttle, and time to interactive on a Fast 4G line.
 *
 *   npm run preview -- --port 4174   # in one terminal
 *   node tools/measure.mjs           # prints one JSON block
 */
import { chromium } from '@playwright/test';

const PAGE = process.env.MEASURE_URL ?? 'http://localhost:4174/daniblox/';
const SECONDS = Number(process.env.BENCH_SECONDS ?? 60);

const browser = await chromium.launch({ headless: false });

async function bench(context, query, waitSeconds) {
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
  await page.goto(`${PAGE}?bench=1&seconds=${String(waitSeconds)}${query}`);
  await page.waitForFunction(() => typeof window.__bench === 'object', undefined, {
    timeout: (waitSeconds + 30) * 1000,
  });
  const result = await page.evaluate(() => window.__bench);
  await page.close();
  return result;
}

// 1. The laptop bench: full world, default view, real GPU.
const laptop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const laptopResult = await bench(laptop, '', SECONDS);
await laptop.close();

// 2. A phone-sized run with the CPU slowed four times, as DevTools does.
const phone = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phone.newPage();
const cdp = await phone.newCDPSession(phonePage);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await phonePage.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
await phonePage.goto(`${PAGE}?bench=1&seconds=30`);
await phonePage.waitForFunction(() => typeof window.__bench === 'object', undefined, {
  timeout: 90_000,
});
const phoneResult = await phonePage.evaluate(() => window.__bench);
await phone.close();

// 3. Time to interactive on a Fast 4G line, cold cache.
const slow = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const slowPage = await slow.newPage();
const net = await slow.newCDPSession(slowPage);
await net.send('Network.enable');
await net.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 20,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
});
await slowPage.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
await slowPage.goto(PAGE);
await slowPage.waitForFunction(
  () => performance.getEntriesByName('interactive').length > 0,
  undefined,
  {
    timeout: 30_000,
  },
);
const tti = await slowPage.evaluate(() => {
  const mark = performance.getEntriesByName('interactive')[0];
  return Math.round(mark?.startTime ?? -1);
});
await slow.close();
await browser.close();

console.log(
  JSON.stringify({ laptop: laptopResult, phoneEmulated4x: phoneResult, ttiMsFast4G: tti }, null, 2),
);
