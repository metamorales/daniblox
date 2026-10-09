import { render } from 'preact';
import { createWorldView, type WorldView } from '../render/scene';
import { Shell } from '../ui/Shell';
import { FixedLoop } from './loop';

declare global {
  interface Window {
    /** Read by the e2e suite to confirm the render loop produced frames. */
    __app?: WorldView;
    /** Frame time, draw calls and chunk counts, for the e2e suite and M6's panel. */
    __perf?: WorldView['perf'];
    /** The simulation clock, so tests and the settings panel can move the day. */
    __loop?: FixedLoop;
  }
}

const CANVAS_LABEL =
  'Daniblox world view. Drag to orbit the camera, scroll to zoom, and use W, A, S and D to pan. ' +
  'Every action is also available from the sidebar and the command palette.';

const ATLAS_URL = new URL('atlas/atlas.png', document.baseURI).href;

function pickSeed(): number {
  const fromHash = /[#&]s=(\d+)/.exec(window.location.hash);
  if (fromHash?.[1]) return Number.parseInt(fromHash[1], 10) >>> 0;
  return 20_260_409;
}

export async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Daniblox could not start: #app is missing from the page.');

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', CANVAS_LABEL);
  canvas.tabIndex = 0;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  root.style.width = '100%';
  root.style.height = '100%';
  root.appendChild(canvas);

  const overlay = document.createElement('div');
  root.appendChild(overlay);
  render(<Shell />, overlay);

  const view = await createWorldView(canvas, ATLAS_URL, pickSeed());
  window.__app = view;
  window.__perf = view.perf;

  const loop = new FixedLoop({
    // The world clock starts mid-morning, so the first frame is daylight.
    startPhase: 0.22,
    tick: () => {
      // Kits and their action queues arrive in M2 and M3.
    },
    render: (_alpha, frameMs) => {
      view.render(loop.dayPhase, frameMs);
    },
  });
  window.__loop = loop;
  loop.bindVisibility();
  loop.run();
}
