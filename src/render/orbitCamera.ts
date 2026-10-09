/**
 * The god-view orbit camera (spec R5, the subset M1 covers).
 *
 * Desktop: left-drag orbits, right-drag or Shift-drag pans, the wheel zooms,
 * WASD and the arrow keys pan, double-click re-centres. Trackpads send a pinch
 * as a wheel event with ctrlKey set, which is how it is told apart from a
 * two-finger scroll. Touch: one finger orbits, two fingers pan and pinch.
 *
 * The point it orbits is the anchor for "here" and "me" in later commands, so
 * it is deliberately a world position rather than a camera offset.
 */
import { PerspectiveCamera, Vector3 } from 'three';

export interface OrbitLimits {
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly minDistance: number;
  readonly maxDistance: number;
}

const DEFAULT_LIMITS: OrbitLimits = {
  minPitch: 0.12,
  maxPitch: Math.PI / 2 - 0.02,
  minDistance: 6,
  maxDistance: 120,
};

const BASE_FOV = 50;
const MAX_FOV = 82;
const ORBIT_SPEED = 0.007;
const PAN_SPEED = 0.0022;
const KEY_PAN_SPEED = 22;
const ZOOM_SPEED = 0.0016;
const DAMPING = 0.18;

export interface OrbitBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface Pointer {
  x: number;
  y: number;
}

export class OrbitCamera {
  readonly camera: PerspectiveCamera;
  /** The cell the camera orbits. "Here" and "me" resolve to this. */
  readonly target = new Vector3();

  private yaw = 0.9;
  private pitch = 0.62;
  private distance = 58;

  private desiredYaw = this.yaw;
  private desiredPitch = this.pitch;
  private desiredDistance = this.distance;
  private readonly desiredTarget = new Vector3();

  private readonly pointers = new Map<number, Pointer>();
  private mode: 'none' | 'orbit' | 'pan' = 'none';
  private lastPinch = 0;
  private readonly keys = new Set<string>();
  private readonly cleanups: (() => void)[] = [];
  private reducedMotion = false;
  /** The settings panel can turn easing off regardless of the system. */
  private forcedReducedMotion = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bounds: OrbitBounds,
    private readonly limits: OrbitLimits = DEFAULT_LIMITS,
  ) {
    this.camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 2000);
    this.target.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    this.desiredTarget.copy(this.target);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = motion.matches;
    const onMotion = (): void => {
      this.reducedMotion = motion.matches;
    };
    motion.addEventListener('change', onMotion);
    this.cleanups.push(() => {
      motion.removeEventListener('change', onMotion);
    });

    this.bindPointer();
    this.bindWheel();
    this.bindKeys();
    this.apply(1);
  }

  /** Where the camera is looking, snapped to a block cell. */
  targetCell(): { x: number; y: number; z: number } {
    return {
      x: Math.floor(this.target.x),
      // Never below the world: the reticle rests on the ground and the brain
      // schema rejects a negative coordinate.
      y: Math.max(0, Math.floor(this.target.y)),
      z: Math.floor(this.target.z),
    };
  }

  setReducedMotion(force: boolean): void {
    this.forcedReducedMotion = force;
  }

  setTarget(x: number, y: number, z: number): void {
    this.desiredTarget.set(x, y, z);
    this.clampTarget(this.desiredTarget);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // A phone held upright would otherwise crop the scene badly.
    this.camera.fov =
      aspect >= 1
        ? BASE_FOV
        : Math.min(
            MAX_FOV,
            (180 / Math.PI) * 2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / aspect),
          );
    this.camera.updateProjectionMatrix();
  }

  /** Advance easing and keyboard panning. `frameMs` keeps it frame-rate free. */
  update(frameMs: number): void {
    this.applyKeyboardPan(frameMs);
    const calm = this.reducedMotion || this.forcedReducedMotion;
    const smoothing = calm ? 1 : 1 - Math.pow(1 - DAMPING, frameMs / 16.67);
    // A negative or absurd frame time must never ease the camera backwards.
    this.apply(Math.min(1, Math.max(0, smoothing)));
  }

  private apply(smoothing: number): void {
    this.yaw += (this.desiredYaw - this.yaw) * smoothing;
    this.pitch += (this.desiredPitch - this.pitch) * smoothing;
    this.distance += (this.desiredDistance - this.distance) * smoothing;
    this.target.lerp(this.desiredTarget, smoothing);

    const { x, y, z } = this.target;
    this.camera.position.set(
      x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      y + this.distance * Math.sin(this.pitch),
      z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target);
  }

  private clampTarget(v: Vector3): void {
    v.x = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, v.x));
    v.z = Math.min(this.bounds.maxZ, Math.max(this.bounds.minZ, v.z));
  }

  private orbitBy(dx: number, dy: number): void {
    this.desiredYaw -= dx * ORBIT_SPEED;
    this.desiredPitch = Math.min(
      this.limits.maxPitch,
      Math.max(this.limits.minPitch, this.desiredPitch + dy * ORBIT_SPEED * 0.8),
    );
  }

  private panBy(dx: number, dy: number): void {
    // Pan along the ground plane, scaled by how far out the camera is so the
    // world moves the same amount under the cursor at any zoom.
    const scale = this.distance * PAN_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.desiredTarget.x -= (dx * cos - dy * sin) * scale;
    this.desiredTarget.z += (dx * sin + dy * cos) * scale;
    this.clampTarget(this.desiredTarget);
  }

  private zoomBy(amount: number): void {
    this.desiredDistance = Math.min(
      this.limits.maxDistance,
      Math.max(this.limits.minDistance, this.desiredDistance * (1 + amount)),
    );
  }

  private applyKeyboardPan(frameMs: number): void {
    if (this.keys.size === 0) return;
    const step = (KEY_PAN_SPEED * frameMs) / 1000;
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (forward === 0 && strafe === 0) return;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.desiredTarget.x += (strafe * cos - forward * sin) * step;
    this.desiredTarget.z += (-strafe * sin - forward * cos) * step;
    this.clampTarget(this.desiredTarget);
  }

  private bindPointer(): void {
    const onDown = (event: PointerEvent): void => {
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        this.mode = 'pan';
        this.lastPinch = this.pinchDistance();
      } else {
        this.mode = event.button === 2 || event.shiftKey ? 'pan' : 'orbit';
      }
    };

    const onMove = (event: PointerEvent): void => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;

      if (this.pointers.size >= 2) {
        const pinch = this.pinchDistance();
        if (this.lastPinch > 0 && pinch > 0) this.zoomBy((this.lastPinch - pinch) / this.lastPinch);
        this.lastPinch = pinch;
        this.panBy(dx / 2, dy / 2);
        return;
      }
      if (this.mode === 'orbit') this.orbitBy(dx, dy);
      else if (this.mode === 'pan') this.panBy(dx, dy);
    };

    const onUp = (event: PointerEvent): void => {
      this.pointers.delete(event.pointerId);
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      if (this.pointers.size < 2) this.lastPinch = 0;
      if (this.pointers.size === 0) this.mode = 'none';
    };

    const onContextMenu = (event: Event): void => {
      event.preventDefault();
    };

    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
    this.canvas.addEventListener('contextmenu', onContextMenu);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerup', onUp);
      this.canvas.removeEventListener('pointercancel', onUp);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
    });
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private bindWheel(): void {
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      // A trackpad pinch arrives as a wheel event with ctrlKey set; a
      // two-finger scroll does not. Both zoom, the pinch more sharply.
      const scale = event.ctrlKey ? 4 : 1;
      this.zoomBy(event.deltaY * ZOOM_SPEED * scale);
    };
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanups.push(() => {
      this.canvas.removeEventListener('wheel', onWheel);
    });
  }

  private bindKeys(): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      // Never steal keys from a text field.
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]')) {
        return;
      }
      if (PAN_KEYS.has(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keys.delete(event.code);
    };
    const onBlur = (): void => this.keys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  dispose(): void {
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
  }
}

const PAN_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
