import { render } from 'preact';
import { createScene, type SceneHandle } from '../render/scene';
import { Shell } from '../ui/Shell';

declare global {
  interface Window {
    /** Read by the e2e suite to confirm the render loop produced frames. */
    __app?: SceneHandle;
  }
}

const CANVAS_LABEL =
  'Daniblox world view. Drag to orbit the camera and scroll to zoom. ' +
  'Every action is also available from the sidebar and the command palette.';

export function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Daniblox could not start: #app is missing from the page.');

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', CANVAS_LABEL);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  root.style.width = '100%';
  root.style.height = '100%';
  root.appendChild(canvas);

  const overlay = document.createElement('div');
  root.appendChild(overlay);
  render(<Shell />, overlay);

  window.__app = createScene(canvas);
}
