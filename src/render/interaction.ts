/**
 * Pointer interaction: the ground reticle, the hovered-face decal, and the
 * player's own place and break.
 *
 * The selection cue is deliberately a flat dashed border on the single face
 * under the pointer, drawn coplanar with it. It is never a wireframe box
 * around the whole block and there is never a crosshair, because both are the
 * most recognisable cues of the genre-defining block game.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { AIR, blockById, blockByName } from '../world/blocks';
import { World } from '../world/chunks';

export interface HoveredBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly normal: Vector3;
}

export interface BlockChange {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly from: number;
  readonly to: number;
}

/** A block the player clicked or pressed, offered to the app for a menu. */
export interface BlockPick {
  readonly cell: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly block: number;
  /** Where on the page it happened, so a menu can sit beside the pointer. */
  readonly screen: { readonly x: number; readonly y: number };
}

export interface InteractionEvents {
  /** Fired after the player changes a block, so the caller can save or announce. */
  onEdit?(change: BlockChange): void;
  /** Fired on a click or a long press over a block. */
  onPick?(pick: BlockPick): void;
}

const LONG_PRESS_MS = 550;
/** Movement past this is a drag, which belongs to the camera. */
const DRAG_PX = 6;

const DASH_SPEED = 1.6;

function decalMaterial(colour: string, dashed: boolean, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: {
      uColour: { value: new Color(colour) },
      uTime: { value: 0 },
      uDashed: { value: dashed ? 1 : 0 },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uTime;
      uniform float uDashed;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        // Distance to the nearest edge, in face-local units.
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        // A one-sixteenth inset band: the same unit as a texture pixel, so the
        // border lines up with the art rather than floating over it.
        float band = step(0.0625, edge) * step(edge, 0.125);
        if (band < 0.5) discard;

        float alpha = uOpacity;
        if (uDashed > 0.5) {
          float march = fract((vUv.x + vUv.y) * 6.0 - uTime);
          alpha *= step(0.45, march);
        }
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(uColour, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

export class Interaction {
  readonly reticle: Mesh;
  readonly decal: Mesh;
  private readonly effects: { mesh: Mesh; born: number; life: number; grow: boolean }[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly cleanups: (() => void)[] = [];
  private pointerInside = false;
  private dragged = 0;
  private hovered: HoveredBlock | null = null;
  private elapsed = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly camera: PerspectiveCamera,
    private readonly pickRoot: Object3D,
    private readonly effectRoot: Object3D,
    private readonly events: InteractionEvents = {},
  ) {
    this.reticle = new Mesh(new PlaneGeometry(1, 1), decalMaterial('#fdf3e2', false, 0.5));
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.renderOrder = 2;
    this.reticle.frustumCulled = false;

    this.decal = new Mesh(new PlaneGeometry(1, 1), decalMaterial('#ff5fa2', true, 0.95));
    this.decal.visible = false;
    this.decal.renderOrder = 3;
    this.decal.frustumCulled = false;

    this.bind();
  }

  /** The block under the pointer, or null when the pointer is over the sky. */
  get target(): HoveredBlock | null {
    return this.hovered;
  }

  /** Put the ground reticle on a cell, which is what "here" will mean. */
  placeReticle(x: number, z: number, y: number): void {
    this.reticle.position.set(x + 0.5, y + 1.002, z + 0.5);
  }

  /**
   * The player's own edit at a cell, with the squash effect. Returns false
   * when nothing changed, which is also what callers get for a cell outside
   * the world.
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    const from = this.world.get(x, y, z);
    if (from === id) return false;
    if (!this.world.set(x, y, z, id)) return false;

    if (id === AIR) this.spawnEffect(x, y, z, blockById(from)?.colour ?? '#fdf3e2', false);
    else this.spawnEffect(x, y, z, '#fdf3e2', true);
    this.events.onEdit?.({ x, y, z, from, to: id });
    return true;
  }

  update(frameMs: number): void {
    this.elapsed += frameMs / 1000;
    const reticleMaterial = this.reticle.material as ShaderMaterial;
    const decalMat = this.decal.material as ShaderMaterial;
    if (reticleMaterial.uniforms.uTime) reticleMaterial.uniforms.uTime.value = this.elapsed;
    if (decalMat.uniforms.uTime) decalMat.uniforms.uTime.value = this.elapsed * DASH_SPEED;

    if (this.pointerInside) this.pick();
    else this.setHovered(null);

    this.stepEffects();
  }

  private stepEffects(): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      if (!effect) continue;
      const t = (this.elapsed - effect.born) / effect.life;
      if (t >= 1) {
        this.effectRoot.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        (effect.mesh.material as MeshBasicMaterial).dispose();
        this.effects.splice(i, 1);
        continue;
      }
      // Breaking squashes the block out of existence; placing is the reverse.
      const scale = effect.grow ? t : 1 - t;
      effect.mesh.scale.set(1, Math.max(scale, 0.001), 1);
      (effect.mesh.material as MeshBasicMaterial).opacity = effect.grow ? t : 1 - t;
    }
  }

  private pick(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.pickRoot, true);
    const hit = hits[0];
    if (!hit?.face) {
      this.setHovered(null);
      return;
    }

    // Chunk meshes are only translated, so the object-space face normal is
    // already the world normal.
    const normal = hit.face.normal;
    const point = hit.point;
    const x = Math.floor(point.x - normal.x * 0.5);
    const y = Math.floor(point.y - normal.y * 0.5);
    const z = Math.floor(point.z - normal.z * 0.5);

    if (this.world.get(x, y, z) === AIR) {
      this.setHovered(null);
      return;
    }
    this.setHovered({ x, y, z, normal: normal.clone() });
  }

  private setHovered(next: HoveredBlock | null): void {
    this.hovered = next;
    if (!next) {
      this.decal.visible = false;
      return;
    }

    const { x, y, z, normal } = next;
    this.decal.visible = true;
    // Sit just proud of the face so it never fights the surface for depth.
    this.decal.position.set(
      x + 0.5 + normal.x * 0.502,
      y + 0.5 + normal.y * 0.502,
      z + 0.5 + normal.z * 0.502,
    );
    this.decal.lookAt(
      this.decal.position.x + normal.x,
      this.decal.position.y + normal.y,
      this.decal.position.z + normal.z,
    );
  }

  private spawnEffect(x: number, y: number, z: number, colour: string, grow: boolean): void {
    const mesh = new Mesh(
      new BoxGeometry(1.02, 1.02, 1.02),
      new MeshBasicMaterial({
        color: new Color(colour),
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.effectRoot.add(mesh);
    this.effects.push({ mesh, born: this.elapsed, life: 0.12, grow });
  }

  private break(): void {
    const target = this.hovered;
    if (!target) return;
    this.setBlock(target.x, target.y, target.z, AIR);
  }

  private place(id: number): void {
    const target = this.hovered;
    if (!target) return;
    const x = target.x + target.normal.x;
    const y = target.y + target.normal.y;
    const z = target.z + target.normal.z;
    if (this.world.get(x, y, z) !== AIR) return;
    this.setBlock(x, y, z, id);
  }

  /** Hand the hovered block to the app, which decides what to offer. */
  private offer(screenX: number, screenY: number): void {
    const target = this.hovered;
    if (!target) return;
    this.events.onPick?.({
      cell: { x: target.x, y: target.y, z: target.z },
      normal: { x: target.normal.x, y: target.normal.y, z: target.normal.z },
      block: this.world.get(target.x, target.y, target.z),
      screen: { x: screenX, y: screenY },
    });
  }

  private bind(): void {
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressedAt: { x: number; y: number } | null = null;
    // Set when a long press already opened the menu, so the release does not.
    let consumed = false;

    const track = (event: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerInside = true;
    };
    const cancelPress = (): void => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = undefined;
    };

    const onMove = (event: PointerEvent): void => {
      track(event);
      if (event.buttons !== 0) this.dragged++;
      if (
        pressedAt &&
        Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > DRAG_PX
      ) {
        cancelPress();
      }
    };
    const onDown = (event: PointerEvent): void => {
      this.dragged = 0;
      consumed = false;
      pressedAt = { x: event.clientX, y: event.clientY };
      // A finger gives no hover first, so the pick happens on the press.
      track(event);
      this.pick();
      cancelPress();
      if (event.button !== 0) return;
      // A long press is the touch equivalent of a click, and harmless with a
      // mouse: it only fires when the pointer has not moved.
      const { clientX, clientY } = event;
      pressTimer = setTimeout(() => {
        pressTimer = undefined;
        if (this.dragged > 3) return;
        consumed = true;
        this.offer(clientX, clientY);
      }, LONG_PRESS_MS);
    };
    const onLeave = (): void => {
      this.pointerInside = false;
      cancelPress();
    };
    const onUp = (event: PointerEvent): void => {
      cancelPress();
      pressedAt = null;
      if (consumed) return;
      // A drag was a camera move, not a click on a block.
      if (this.dragged > 3 || event.button !== 0) return;
      // Shift stacks a tile onto the face and Alt takes the block away, as
      // quick hands for the player's own edits. A plain click offers the menu.
      if (event.shiftKey) this.place(blockByName('tile')?.id ?? 7);
      else if (event.altKey) this.break();
      else this.offer(event.clientX, event.clientY);
    };

    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointerleave', onLeave);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointerup', onUp);
      this.canvas.removeEventListener('pointerleave', onLeave);
    });
  }

  dispose(): void {
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
    this.reticle.geometry.dispose();
    (this.reticle.material as ShaderMaterial).dispose();
    this.decal.geometry.dispose();
    (this.decal.material as ShaderMaterial).dispose();
  }
}
