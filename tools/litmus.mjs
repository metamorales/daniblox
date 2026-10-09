#!/usr/bin/env node
/**
 * Four cropped frames for the look test (docs/plan.md section 3.8 rule 8),
 * with the whole interface hidden so no wordmark gives the game away.
 *
 *   npm run preview -- --port 4174   # in one terminal
 *   node tools/litmus.mjs            # writes docs/litmus/*.png
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const PAGE = process.env.LITMUS_URL ?? 'http://localhost:4174/daniblox/';
const OUT = new URL('../docs/litmus', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
await page.goto(PAGE);
await page.waitForFunction(() => (window.__app?.frames ?? 0) > 20, undefined, { timeout: 30000 });
await page.addStyleTag({ content: '#app > div:last-child { visibility: hidden !important; }' });

const settle = (ms = 900) => page.waitForTimeout(ms);
const shot = (name) =>
  page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 40, y: 40, width: 1200, height: 640 } });

// A: sunlit meadow at distance.
await page.evaluate(() => {
  window.__loop.dayPhase = 0.3;
});
await settle();
await shot('a-meadow');

// B: a shaded slope up close. Find the steepest nearby column edge and aim at it.
await page.evaluate(() => {
  const app = window.__app;
  let best = { x: 32, z: 32, drop: 0 };
  for (let x = 8; x < 56; x++)
    for (let z = 8; z < 56; z++) {
      const h = app.world.surfaceHeight(x, z);
      const drop = Math.max(
        Math.abs(h - app.world.surfaceHeight(x + 1, z)),
        Math.abs(h - app.world.surfaceHeight(x, z + 1)),
      );
      if (drop > best.drop) best = { x, z, drop };
    }
  app.orbit.setTarget(best.x + 0.5, app.world.surfaceHeight(best.x, best.z) + 1, best.z + 0.5);
  window.__loop.dayPhase = 0.52; // late afternoon, long shadows in the tint
});
await page.mouse.move(640, 360);
await page.mouse.wheel(0, -2200);
await settle(1200);
await shot('b-cliff');

// C: night.
await page.evaluate(() => {
  window.__loop.dayPhase = 0.78;
});
await page.mouse.wheel(0, 1200);
await settle(1200);
await shot('c-night');

// D: mid-action: Luciana digging, caught while the job is running.
await page.evaluate(() => {
  const app = window.__app;
  const k = app.kits[0];
  window.__loop.dayPhase = 0.3;
  app.orbit.setTarget(k.position.x, k.position.y, k.position.z);
  window.__game.send('gather three bark');
});
await page.mouse.wheel(0, -600);
await page
  .waitForFunction(() => window.__app?.kits[0]?.activity === 'mining', undefined, {
    timeout: 15000,
  })
  .catch(() => {});
await settle(400);
await shot('d-action');

await browser.close();
console.log('litmus frames written');
