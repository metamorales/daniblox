#!/usr/bin/env node
/**
 * The hero GIF (spec P5): ten seconds of play recorded by Playwright in a
 * headed Chromium, then turned into a GIF by ffmpeg.
 *
 *   npm run preview -- --port 4174   # in one terminal
 *   node tools/hero.mjs              # writes docs/hero.gif
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';

const PAGE = process.env.HERO_URL ?? 'http://localhost:4174/daniblox/';
const WORK = new URL('../.scratch/hero', import.meta.url).pathname;
const OUT = new URL('../docs/hero.gif', import.meta.url).pathname;
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: WORK, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('daniblox:onboarded', '1'));
await page.goto(PAGE);
await page.waitForFunction(() => (window.__app?.frames ?? 0) > 30, undefined, { timeout: 30000 });

// Settle, then a slow orbit with three orders in a row.
await page.evaluate(() => {
  const app = window.__app;
  app.orbit.setTarget(32, 13, 32);
});
await page.waitForTimeout(800);
const say = async (text) => {
  await page.fill('#command', text);
  await page.click('button[type=submit]');
};
const orbitFor = async (ms) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await page.evaluate(() => window.__app?.orbit.nudge(0.006, 0));
    await page.waitForTimeout(33);
  }
};
await say('raise a hill here');
await orbitFor(3200);
await say('plant a forest here');
await orbitFor(3200);
await say('make it night');
await orbitFor(3400);
await context.close();
await browser.close();

const webm = readdirSync(WORK).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video was recorded');
renameSync(`${WORK}/${webm}`, `${WORK}/hero.webm`);

// Two passes through ffmpeg: a palette from the clip, then the GIF with it.
// The first second is the page settling, so it is trimmed.
const filters = 'fps=8,scale=640:-1:flags=lanczos';
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-ss',
    '1',
    '-t',
    '10.5',
    '-i',
    `${WORK}/hero.webm`,
    '-vf',
    `${filters},palettegen=max_colors=96:stats_mode=diff`,
    `${WORK}/palette.png`,
  ],
  { stdio: 'ignore' },
);
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-ss',
    '1',
    '-t',
    '10.5',
    '-i',
    `${WORK}/hero.webm`,
    '-i',
    `${WORK}/palette.png`,
    '-lavfi',
    `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    OUT,
  ],
  { stdio: 'ignore' },
);
console.log(`wrote ${OUT}`);
