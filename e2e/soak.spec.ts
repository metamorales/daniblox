import { APP_PATH, expect, test } from './fixtures';

/**
 * A long run of everything at once (plan M8): Luciana cycling through every
 * kind of job, a block pulled out from under her mid-walk, the camera
 * orbiting. She must never clip into a block, never move faster than she
 * can walk, and the draw-call budget must hold on every sample. Length comes
 * from SOAK_SECONDS; CI runs a short one and the recorded run is longer.
 */

const SECONDS = Number(process.env.SOAK_SECONDS ?? 30);

const ORDERS = [
  'wander',
  'gather three clover',
  'raise a hill here',
  'go here',
  'follow me',
  'plant a forest here',
  'scatter gems here',
  'flatten this',
  'make it night',
  'gather two bark',
  'make it day',
  'stop',
];

test('runs every job for a while without clipping, teleporting or overspending', async ({
  page,
}) => {
  test.setTimeout((SECONDS + 60) * 1000);
  await page.goto(APP_PATH);
  await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
    timeout: 20_000,
  });

  const report = await page.evaluate(
    async ({ seconds, orders }) => {
      const app = window.__app;
      const game = window.__game;
      const loop = window.__loop;
      const kit = app?.kits[0];
      if (!app || !game || !loop || !kit) return { problems: ['no app'], samples: 0 };

      const problems: string[] = [];
      const started = performance.now();
      let lastOrder = -Infinity;
      let order = 0;
      let pulled = false;
      let last = { x: kit.position.x, z: kit.position.z, ticks: loop.ticks };
      let samples = 0;

      while (performance.now() - started < seconds * 1000) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        samples++;
        app.orbit.nudge(0.003, 0);

        if (now - lastOrder > 3500) {
          lastOrder = now;
          game.send(orders[order % orders.length] ?? 'wander');
          order++;
        }
        // Once, mid-walk, take the ground away.
        if (!pulled && kit.state === 'walking' && now - started > 5000) {
          pulled = true;
          const c = kit.cell;
          app.world.set(c.x, c.y - 1, c.z, 0);
        }

        const c = kit.cell;
        const feet = app.world.get(c.x, c.y, c.z);
        const head = app.world.get(c.x, c.y + 1, c.z);
        if (feet !== 0 || head !== 0) problems.push(`clipped at ${c.x},${c.y},${c.z}`);

        // Speed against the simulation's own clock: frames bunch up on a
        // loaded machine, but she may never cover more than three blocks a
        // second of simulated time.
        const ticks = loop.ticks - last.ticks;
        const moved = Math.hypot(kit.position.x - last.x, kit.position.z - last.z);
        if (ticks > 0 && moved / (ticks * 0.05) > 3.6) {
          problems.push(`teleported ${moved.toFixed(2)} blocks in ${String(ticks)} ticks`);
        } else if (ticks === 0 && moved > 0.001) {
          problems.push(`moved ${moved.toFixed(2)} blocks between ticks`);
        }
        last = { x: kit.position.x, z: kit.position.z, ticks: loop.ticks };

        const perf = window.__perf;
        if (perf && perf.drawCalls > perf.visibleChunks + app.kits.length * 7 + 4) {
          problems.push(`${perf.drawCalls} draw calls for ${perf.visibleChunks} chunks`);
        }
      }
      return { problems: [...new Set(problems)].slice(0, 10), samples, pulled };
    },
    { seconds: SECONDS, orders: ORDERS },
  );

  expect(report.samples).toBeGreaterThan(SECONDS * 5);
  expect(report.problems).toEqual([]);
});
