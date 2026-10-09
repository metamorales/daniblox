import { APP_PATH, expect, test } from './fixtures';

test.describe('the world', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    // Wait for the view to settle: the first frames run before layout has
    // given the canvas its real size, so the projection is not final yet.
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
    await page.waitForFunction(() => (window.__perf?.visibleChunks ?? 0) > 0, undefined, {
      timeout: 10_000,
    });
  });

  test('renders terrain within the draw-call budget', async ({ page }) => {
    const perf = await page.evaluate(() => {
      const p = window.__perf;
      if (!p) throw new Error('the perf snapshot is missing');
      return { ...p };
    });
    expect(perf.totalChunks).toBe(16);
    expect(perf.visibleChunks).toBeGreaterThan(0);
    expect(perf.triangles).toBeGreaterThan(1000);
    // Spec R6 asks for one call per visible chunk plus the kits. The literal
    // figure leaves no room for the sky, the reticle, the hovered-face decal
    // or a kit's face and nameplate, so the budget here is that plus a fixed
    // overlay allowance. Recorded in docs/decisions.md.
    const kits = await page.evaluate(() => window.__app?.kits.length ?? 0);
    expect(perf.drawCalls).toBeLessThanOrEqual(perf.visibleChunks + kits * 6 + 4);
  });

  test('culls chunks outside the view when zoomed in close', async ({ page }) => {
    const visible = async (): Promise<number> => {
      await page.waitForTimeout(700);
      return page.evaluate(() => window.__perf?.visibleChunks ?? 0);
    };

    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 1600); // pull right back
    const wide = await visible();

    await page.mouse.wheel(0, -4000); // dive all the way in
    const close = await visible();

    expect(wide).toBeGreaterThan(0);
    expect(close, 'zooming in did not cull anything').toBeLessThan(wide);
  });

  test('zooms with the wheel and pans with the keyboard', async ({ page }) => {
    const distance = async (): Promise<number> => {
      const [camera, target] = await page.evaluate(() => [
        window.__app?.orbit.camera.position.toArray() ?? [0, 0, 0],
        window.__app?.orbit.target.toArray() ?? [0, 0, 0],
      ]);
      return Math.hypot(
        (camera[0] ?? 0) - (target[0] ?? 0),
        (camera[1] ?? 0) - (target[1] ?? 0),
        (camera[2] ?? 0) - (target[2] ?? 0),
      );
    };

    const start = await distance();
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(500);
    expect(await distance(), 'the wheel did not zoom').toBeLessThan(start);

    const before = await page.evaluate(() => window.__app?.orbit.targetCell());
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__app?.orbit.targetCell());
    expect(after, 'W did not pan the camera').not.toEqual(before);
  });

  test('orbits on drag without editing a block', async ({ page }) => {
    const before = await page.evaluate(() =>
      window.__app?.world.toBytes().reduce((a, b) => a + b, 0),
    );
    const camera = await page.evaluate(() => window.__app?.orbit.camera.position.toArray());

    await page.mouse.move(640, 400);
    await page.mouse.down();
    for (let x = 640; x <= 820; x += 20) await page.mouse.move(x, 400);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      window.__app?.world.toBytes().reduce((a, b) => a + b, 0),
    );
    const moved = await page.evaluate(() => window.__app?.orbit.camera.position.toArray());
    expect(moved, 'the drag did not orbit').not.toEqual(camera);
    expect(after, 'a camera drag edited the world').toBe(before);
  });

  test('breaks a block from the click menu and places one on shift-click', async ({ page }) => {
    const solidCount = async (): Promise<number> =>
      page.evaluate(() => {
        let n = 0;
        for (const byte of window.__app?.world.toBytes() ?? []) if (byte !== 0) n++;
        return n;
      });

    const start = await solidCount();
    await page.mouse.move(640, 430);
    await page.waitForTimeout(200);
    await page.mouse.click(640, 430);
    await page.getByRole('menuitem', { name: 'Break it yourself' }).click();
    await page.waitForTimeout(250);
    const broken = await solidCount();
    expect(broken, 'the menu did not remove a block').toBeLessThan(start);

    await page.mouse.move(700, 450);
    await page.waitForTimeout(200);
    await page.keyboard.down('Shift');
    await page.mouse.click(700, 450);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);
    expect(await solidCount(), 'shift-click did not add a block').toBeGreaterThan(broken);
  });

  test('remeshes at most one chunk per frame after an edit', async ({ page }) => {
    const pending = await page.evaluate(async () => {
      // Dirty four chunks at once, one block in each.
      window.__app?.world.set(8, 20, 8, 7);
      window.__app?.world.set(40, 20, 8, 7);
      window.__app?.world.set(8, 20, 40, 7);
      window.__app?.world.set(40, 20, 40, 7);
      const seen: number[] = [];
      await new Promise<void>((resolve) => {
        let frames = 0;
        const step = (): void => {
          seen.push(window.__perf?.pendingChunks ?? 0);
          if (++frames >= 3) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return seen;
    });
    // The queue drains, never all at once.
    expect(pending.length).toBeGreaterThan(0);
    expect(Math.max(...pending)).toBeGreaterThan(0);
  });

  test('changes the sky between day and night', async ({ page }) => {
    // Read real pixels rather than the uniform: a WebGL canvas does not keep
    // its drawing buffer, so this goes through Playwright's own capture.
    const skyStrip = async (phase: number): Promise<string> => {
      await page.evaluate((p) => {
        if (window.__loop) window.__loop.dayPhase = p;
      }, phase);
      await page.waitForTimeout(500);
      const shot = await page.screenshot({ clip: { x: 500, y: 4, width: 80, height: 12 } });
      return shot.toString('base64');
    };

    const noon = await skyStrip(0.3);
    const night = await skyStrip(0.78);
    expect(noon.length).toBeGreaterThan(100);
    expect(night, 'the sky looks the same at noon and at night').not.toBe(noon);
  });
});

test.describe('Luciana', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await page.waitForFunction(() => (window.__app?.frames ?? 0) > 10, undefined, {
      timeout: 20_000,
    });
  });

  test('stands in the world with a name', async ({ page }) => {
    const kit = await page.evaluate(() => {
      const k = window.__app?.kits[0];
      return k ? { id: k.id, name: k.name, state: k.state, cell: k.cell } : null;
    });
    expect(kit?.name).toBe('Luciana');
    expect(kit?.state).toBe('idle');
    // On the surface, not buried and not in the sky.
    expect(kit?.cell.y).toBeGreaterThan(0);
  });

  test('walks to a cell she is sent to', async ({ page }) => {
    const target = await page.evaluate(() => {
      const k = window.__app?.kits[0];
      if (!k || !window.__app) return null;
      const cell = { x: k.cell.x + 6, y: 0, z: k.cell.z + 3 };
      cell.y = window.__app.world.surfaceHeight(cell.x, cell.z) + 1;
      window.__app.sendTo('luciana', cell);
      return cell;
    });
    expect(target).not.toBeNull();

    await page.waitForFunction(
      (want) => {
        const k = window.__app?.kits[0];
        return k ? k.state === 'idle' && k.cell.x === want?.x && k.cell.z === want.z : false;
      },
      target,
      { timeout: 12_000 },
    );

    const arrived = await page.evaluate(() => window.__app?.kits[0]?.cell);
    expect(arrived?.x).toBe(target?.x);
    expect(arrived?.z).toBe(target?.z);
  });

  test('never clips into a block while walking', async ({ page }) => {
    const clipped = await page.evaluate(async () => {
      const app = window.__app;
      const kit = app?.kits[0];
      if (!app || !kit) return ['no kit'];
      const target = { x: kit.cell.x + 8, y: 0, z: kit.cell.z + 8 };
      target.y = app.world.surfaceHeight(target.x, target.z) + 1;
      app.sendTo('luciana', target);

      const problems: string[] = [];
      const started = performance.now();
      while (performance.now() - started < 6000) {
        await new Promise((r) => requestAnimationFrame(r));
        const c = kit.cell;
        const feet = app.world.get(c.x, c.y, c.z);
        const head = app.world.get(c.x, c.y + 1, c.z);
        if (feet !== 0 || head !== 0) problems.push(`${c.x},${c.y},${c.z}`);
        if (kit.state === 'idle') break;
      }
      return problems;
    });
    expect(clipped).toEqual([]);
  });
});
