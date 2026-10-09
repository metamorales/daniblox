/**
 * The `?bench=1` scenario (spec R6, plan M8): Luciana wandering, the camera
 * orbiting, for a fixed number of seconds, then a summary on `window.__bench`
 * and in the console as one JSON line. Nothing here runs unless asked for.
 */

import type { WorldView } from '../render/scene';
import type { Game } from './game';

/** Shader compilation and the first mesh upload land in the first frames; they are start-up, not play. */
export const WARM_UP_MS = 2000;

export interface BenchResult {
  readonly seconds: number;
  readonly frames: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  /** Seconds into the run when the worst frame happened. */
  readonly maxAt: number;
  /** The worst frame seen during warm-up, reported separately. */
  readonly warmUpMax: number;
  readonly drawCallsMean: number;
  readonly drawCallsMax: number;
  readonly visibleChunksMean: number;
  readonly pathNodesPerFrame: number;
  /** Spec R6 on the reference laptop: p95 at or under 16.7 ms, worst under 33 ms. */
  readonly pass: boolean;
}

declare global {
  interface Window {
    __bench?: BenchResult | 'running';
  }
}

export function startBench(view: WorldView, game: Game, seconds: number): void {
  window.__bench = 'running';
  const frameTimes: number[] = [];
  let warmUpMax = 0;
  let worst = 0;
  let worstAt = 0;
  let drawCalls = 0;
  let drawCallsMax = 0;
  let visible = 0;
  const nodesAtStart = view.kits.reduce((sum, kit) => sum + kit.pathNodes, 0);
  const started = performance.now();
  let lastOrder = 0;

  const step = (): void => {
    const now = performance.now();
    const frameMs = view.perf.frameMs;
    if (now - started < WARM_UP_MS) {
      warmUpMax = Math.max(warmUpMax, frameMs);
    } else {
      frameTimes.push(frameMs);
      if (frameMs > worst) {
        worst = frameMs;
        worstAt = (now - started) / 1000;
      }
      drawCalls += view.perf.drawCalls;
      drawCallsMax = Math.max(drawCallsMax, view.perf.drawCalls);
      visible += view.perf.visibleChunks;
    }
    view.orbit.nudge(0.004, 0);

    // Keep her busy: a fresh wander every few seconds, with the odd dig.
    if (now - lastOrder > 4000) {
      lastOrder = now;
      game.send(frameTimes.length % 3 === 0 ? 'gather two clover' : 'wander');
    }

    if (now - started < seconds * 1000) {
      requestAnimationFrame(step);
      return;
    }

    const sorted = [...frameTimes].sort((a, b) => a - b);
    const at = (q: number): number =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    const frames = frameTimes.length;
    const nodes = view.kits.reduce((sum, kit) => sum + kit.pathNodes, 0) - nodesAtStart;
    const result: BenchResult = {
      seconds,
      frames,
      p50: round(at(0.5)),
      p95: round(at(0.95)),
      max: round(sorted[sorted.length - 1] ?? 0),
      maxAt: round(worstAt),
      warmUpMax: round(warmUpMax),
      drawCallsMean: round(drawCalls / Math.max(1, frames)),
      drawCallsMax,
      visibleChunksMean: round(visible / Math.max(1, frames)),
      pathNodesPerFrame: round(nodes / Math.max(1, frames)),
      pass: at(0.95) <= 16.7 && (sorted[sorted.length - 1] ?? 0) <= 33,
    };
    window.__bench = result;
    console.log(`[bench] ${JSON.stringify(result)}`);
  };
  requestAnimationFrame(step);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
