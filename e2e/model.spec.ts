import { APP_PATH, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The model path, driven against intercepted responses so it runs anywhere,
 * with no model and no key. The live check against a real endpoint is a
 * separate, manual step recorded in docs/plan.md.
 */

const ENDPOINT = '**/chat/completions';

const GOOD = JSON.stringify({
  say: 'Hold on to something.',
  actions: [{ type: 'sculpt', shape: 'raise', at: { x: 32, y: 14, z: 32 }, radius: 6, amount: 3 }],
});

function openAi(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

async function switchToModel(page: Page): Promise<void> {
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });
  await page.click('summary');
  await page.click('button:has-text("Use this model")');
  await page.waitForTimeout(200);
}

const lines = (page: Page): Promise<string[]> =>
  page.$$eval('aside li[data-line]', (els) => els.map((e) => e.textContent ?? ''));

async function say(page: Page, text: string): Promise<string[]> {
  const before = (await lines(page)).length;
  await page.fill('#command', text);
  await page.click('button[type=submit]');
  await page
    .waitForFunction(
      (n) => document.querySelectorAll('aside li[data-line]').length > n,
      before + 1,
      {
        timeout: 20_000,
      },
    )
    .catch(() => undefined);
  return (await lines(page)).slice(before + 1);
}

test.describe('with a model behind her', () => {
  test('uses what the model said, and does what it asked for', async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: openAi(GOOD) }),
    );
    await switchToModel(page);

    const before = await page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0);
    const reply = await say(page, 'do something about this flat patch');
    expect(reply.join(' ')).toContain('Hold on to something.');
    await expect
      .poll(async () => page.evaluate(() => window.__app?.world.surfaceHeight(32, 32) ?? 0), {
        timeout: 8000,
      })
      .toBeGreaterThan(before);
    expect(await page.textContent('summary span')).toBe('model');
  });

  test('asks again once when the first reply is malformed', async ({ page }) => {
    let calls = 0;
    await page.route(ENDPOINT, (route) => {
      calls++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: openAi(calls === 1 ? '{"say":"hi","actions":[{"type":"explode"}]}' : GOOD),
      });
    });
    await switchToModel(page);

    const reply = await say(page, 'raise a hill');
    expect(calls).toBe(2);
    expect(reply.join(' ')).toContain('Hold on to something.');
    expect(await page.textContent('summary span')).toBe('model');
  });

  test('falls back to her own words after two bad replies, and shows the badge', async ({
    page,
  }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: openAi('{"say":"Resetting.","actions":[{"type":"exec","code":"oops"}]}'),
      }),
    );
    await switchToModel(page);

    const reply = await say(page, 'wander');
    expect(reply[0]?.length ?? 0).toBeGreaterThan(0);
    expect(await page.textContent('summary span')).toBe('scripted');
    // She still obeyed the command, through the scripted brain.
    await expect
      .poll(async () => page.evaluate(() => window.__app?.kits[0]?.state ?? ''), { timeout: 8000 })
      .not.toBe('idle');
  });

  test.describe('when the endpoint fails', () => {
    test.use({ allowNetworkNoise: true });

    test('explains an address it cannot reach, and keeps playing', async ({ page }) => {
      await page.route(ENDPOINT, (route) => route.abort('connectionrefused'));
      await switchToModel(page);

      const reply = await say(page, 'wander');
      expect(reply[0]?.length ?? 0).toBeGreaterThan(0);
      await expect(page.locator('[class*=error]')).toContainText(/could not reach/i);
      expect(await page.textContent('summary span')).toBe('scripted');
    });

    test('explains a refused key', async ({ page }) => {
      await page.route(ENDPOINT, (route) => route.fulfill({ status: 401, body: 'nope' }));
      await switchToModel(page);
      await say(page, 'wander');
      await expect(page.locator('[class*=error]')).toContainText(/key was refused/i);
    });
  });

  test('gives up on a model that never answers, rather than hanging', async ({ page }) => {
    await page.route(ENDPOINT, () => {
      // Never fulfilled: the client's own ten-second limit has to end it.
      return undefined;
    });
    await switchToModel(page);

    const started = Date.now();
    const reply = await say(page, 'wander');
    const waited = Date.now() - started;
    expect(reply[0]?.length ?? 0).toBeGreaterThan(0);
    expect(waited).toBeLessThan(19_000);
    expect(await page.textContent('summary span')).toBe('scripted');
  });

  test('asks for a breather at the eleventh message in a minute', async ({ page }) => {
    // A reply with no actions, so no job reports interleave with her speech
    // and the transcript stays easy to read.
    const chat = JSON.stringify({ say: 'Mm, quite.', actions: [] });
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: openAi(chat) }),
    );
    await switchToModel(page);

    for (let i = 0; i < 10; i++) await say(page, `question ${String(i)}`);
    const capped = await say(page, 'one more');
    expect(capped.join(' ')).toMatch(/out of breath/i);
  });

  test('never writes the key to durable storage', async ({ page }) => {
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: openAi(GOOD) }),
    );
    await page.goto(APP_PATH);
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
    await page.click('summary');
    await page.fill('input[type=password]', 'sk-canary-abc123');
    await page.check('input[type=checkbox]');
    await page.click('button:has-text("Use this model")');
    await say(page, 'wander');

    const stored = await page.evaluate(() => ({
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      hash: window.location.hash,
    }));
    expect(stored.local, 'the key reached localStorage').not.toContain('sk-canary-abc123');
    expect(stored.hash, 'the key reached the share link').not.toContain('sk-canary-abc123');
    // Remembering for the tab is the one place it is allowed.
    expect(stored.session).toContain('sk-canary-abc123');
  });
});
