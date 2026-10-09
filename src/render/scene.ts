/**
 * M0 placeholder scene: the sky gradient, one lit cube, and an orbit camera.
 *
 * The sky shader and the orbit maths are written to survive into M1, where
 * terrain, the ground reticle and the full control set from spec R5 arrive.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  WebGLRenderer,
} from 'three';

const SKY_ZENITH = '#8fd6f0';
const SKY_HORIZON = '#fdf3e2';
const SKY_GROUND = '#e8c9a8';
const CUBE_COLOUR = '#4f8fd8';
const KEY_LIGHT = '#fff1dc';
const GROUND_BOUNCE = '#e6a0a4';

const MIN_PITCH = 0.12;
const MAX_PITCH = Math.PI / 2 - 0.02;
const BASE_FOV = 50;
const MAX_FOV = 82;
const MIN_RADIUS = 2.5;
const MAX_RADIUS = 20;

export interface SceneHandle {
  /** Frames drawn since start. The e2e suite reads this to prove the loop runs. */
  readonly frames: number;
  dispose(): void;
}

interface Orbit {
  yaw: number;
  pitch: number;
  radius: number;
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new Color(SKY_ZENITH) },
      horizon: { value: new Color(SKY_HORIZON) },
      ground: { value: new Color(SKY_GROUND) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 ground;
      varying vec3 vLocal;
      void main() {
        // A god-view camera spends most of its time looking below the horizon,
        // so the band under it carries its own stop instead of being flat.
        float h = normalize(vLocal).y * 0.5 + 0.5;
        vec3 sky = h < 0.5
          ? mix(ground, horizon, smoothstep(0.30, 0.50, h))
          : mix(horizon, zenith, smoothstep(0.50, 0.66, h));
        gl_FragColor = vec4(sky, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

function applyCamera(camera: PerspectiveCamera, orbit: Orbit): void {
  const { yaw, pitch, radius } = orbit;
  camera.position.set(
    radius * Math.cos(pitch) * Math.sin(yaw),
    radius * Math.sin(pitch),
    radius * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(0, 0, 0);
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  const orbit: Orbit = { yaw: 0.9, pitch: 0.3, radius: 6.5 };

  const sky = new Mesh(new SphereGeometry(400, 24, 16), skyMaterial());
  sky.frustumCulled = false;
  scene.add(sky);

  const cube = new Mesh(
    new BoxGeometry(2, 2, 2),
    new MeshLambertMaterial({ color: new Color(CUBE_COLOUR) }),
  );
  scene.add(cube);

  const key = new DirectionalLight(new Color(KEY_LIGHT), 2.4);
  key.position.set(4, 7, 3);
  scene.add(key);
  scene.add(new HemisphereLight(new Color(SKY_ZENITH), new Color(GROUND_BOUNCE), 1.4));

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);

    const aspect = width / Math.max(height, 1);
    camera.aspect = aspect;
    // A fixed vertical field of view crops the scene badly on a phone held
    // upright, so portrait viewports widen it to keep the same horizontal view.
    camera.fov =
      aspect >= 1
        ? BASE_FOV
        : Math.min(
            MAX_FOV,
            (180 / Math.PI) * 2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / aspect),
          );
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --- orbit input (the M1 controller grows from here) ---
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(event: PointerEvent): void {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    orbit.yaw -= (event.clientX - lastX) * 0.008;
    orbit.pitch = Math.min(
      MAX_PITCH,
      Math.max(MIN_PITCH, orbit.pitch + (event.clientY - lastY) * 0.006),
    );
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onPointerUp(event: PointerEvent): void {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    orbit.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, orbit.radius + event.deltaY * 0.01));
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const stillness = window.matchMedia('(prefers-reduced-motion: reduce)');

  let frames = 0;
  let raf = 0;
  let last = performance.now();

  function frame(now: number): void {
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!stillness.matches) cube.rotation.y += delta * 0.35;
    applyCamera(camera, orbit);
    renderer.render(scene, camera);
    frames++;
    handle.frames = frames;
    raf = requestAnimationFrame(frame);
  }

  const handle = {
    frames: 0,
    dispose(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
    },
  };

  raf = requestAnimationFrame(frame);
  return handle;
}
