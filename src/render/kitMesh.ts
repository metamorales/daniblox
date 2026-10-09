/**
 * Luciana's body, built from primitives (spec: procedural bodies).
 *
 * An upright cat with a head nearly as big as her body, so she stays readable
 * when the camera is pulled right out. White coat with black over the crown,
 * ears, saddle and tail: the tuxedo pattern the owner asked for.
 *
 * She shares nothing with the boxy quadruped of the genre-defining block game.
 * She stands up, her head is oversized, her ears are tall triangles and her
 * face is drawn rather than wrapped onto a cube.
 *
 * Everything that animates together is baked into one geometry carrying its
 * colours on the vertices, so a whole kit costs six draw calls rather than the
 * twenty that a mesh per part would.
 */
import {
  BufferAttribute,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from '../folk/kit';
import { CreatureMaterial } from './creatureMaterial';

const BLINK_GAPS = [3.1, 4.7, 5.9];
const BLINK_LENGTH = 0.13;
const HOP_HZ = 2.2;

const INK = '#332a4a';
const NOSE = '#c4707f';
const BLUSH = '#f2a7b4';

interface Part {
  readonly geometry: BufferGeometry;
  readonly colour: string;
  readonly position?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

/** Bake parts into one geometry, carrying their colours on the vertices. */
function bake(parts: readonly Part[]): BufferGeometry {
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const euler = new Euler();

  const pieces = parts.map((part) => {
    const geometry = part.geometry.clone();
    position.set(...(part.position ?? [0, 0, 0]));
    euler.set(...(part.rotation ?? [0, 0, 0]));
    quaternion.setFromEuler(euler);
    scale.set(...(part.scale ?? [1, 1, 1]));
    geometry.applyMatrix4(matrix.compose(position, quaternion, scale));

    const count = geometry.getAttribute('position').count;
    const colour = new Color(part.colour);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
    }
    geometry.setAttribute('colour', new BufferAttribute(colours, 3));
    // Every piece must carry the same attributes for the merge to work.
    geometry.deleteAttribute('uv');
    return geometry;
  });

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Could not merge the kit geometry.');
  return merged;
}

function pixelTexture(draw: (c: CanvasRenderingContext2D) => void, size = 16): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the kit: no 2D canvas context.');
  context.clearRect(0, 0, size, size);
  draw(context);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function faceOpen(): CanvasTexture {
  return pixelTexture((c) => {
    for (const x of [2, 10]) {
      c.fillStyle = INK;
      c.fillRect(x, 4, 4, 5);
      c.fillStyle = '#ffffff';
      c.fillRect(x + 2, 5, 1, 2);
    }
    c.fillStyle = NOSE;
    c.fillRect(7, 10, 2, 2);
    c.fillStyle = INK;
    c.fillRect(6, 12, 1, 1);
    c.fillRect(9, 12, 1, 1);
    c.fillStyle = BLUSH;
    c.fillRect(1, 10, 2, 1);
    c.fillRect(13, 10, 2, 1);
  });
}

function faceShut(): CanvasTexture {
  return pixelTexture((c) => {
    c.fillStyle = INK;
    for (const x of [2, 10]) c.fillRect(x, 7, 4, 1);
    c.fillStyle = NOSE;
    c.fillRect(7, 10, 2, 2);
    c.fillStyle = BLUSH;
    c.fillRect(1, 10, 2, 1);
    c.fillRect(13, 10, 2, 1);
  });
}

function nameplateTexture(name: string): CanvasTexture {
  const width = 256;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Could not draw the nameplate: no 2D canvas context.');
  c.fillStyle = '#fdf3e2';
  c.fillRect(0, 0, width, height);
  c.strokeStyle = INK;
  c.lineWidth = 6;
  c.strokeRect(3, 3, width - 6, height - 6);
  c.fillStyle = INK;
  c.font = '28px "Pixelify Sans", monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name, width / 2, height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export class KitMesh {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly tail = new Group();
  private readonly shadow: Mesh;
  private readonly face: Mesh;
  private readonly plate: Mesh;
  private readonly material = new CreatureMaterial();
  private readonly openFace = faceOpen();
  private readonly shutFace = faceShut();
  private readonly geometries: BufferGeometry[] = [];
  private elapsed = 0;
  private blinkIndex = 0;
  private nextBlink = BLINK_GAPS[0] ?? 3;

  constructor(private readonly kit: Kit) {
    const coat = kit.appearance.coat;
    const patch = kit.appearance.patch;

    // Torso, arms and saddle.
    const torso = bake([
      { geometry: new CapsuleGeometry(0.23, 0.1, 4, 12), colour: coat, position: [0, 0.26, 0] },
      {
        geometry: new SphereGeometry(0.232, 14, 10),
        colour: patch,
        position: [0, 0.3, -0.08],
        scale: [0.95, 0.78, 0.7],
      },
      {
        geometry: new CapsuleGeometry(0.058, 0.07, 3, 8),
        colour: coat,
        position: [-0.225, 0.26, 0.03],
      },
      {
        geometry: new CapsuleGeometry(0.058, 0.07, 3, 8),
        colour: coat,
        position: [0.225, 0.26, 0.03],
      },
    ]);
    this.body.add(new Mesh(torso, this.material));

    // Head, crown, muzzle and ears.
    const headParts: Part[] = [
      { geometry: new SphereGeometry(0.27, 18, 14), colour: coat, scale: [1.08, 0.9, 0.94] },
      {
        geometry: new SphereGeometry(0.272, 18, 14),
        colour: patch,
        position: [0, 0.1, -0.09],
        scale: [1.07, 0.82, 0.84],
      },
      {
        geometry: new SphereGeometry(0.1, 12, 10),
        colour: coat,
        position: [0, -0.125, 0.19],
        scale: [1.3, 0.72, 0.7],
      },
    ];
    for (const side of [-1, 1]) {
      headParts.push({
        geometry: new ConeGeometry(0.105, 0.26, 10),
        colour: patch,
        position: [side * 0.165, 0.3, -0.02],
        rotation: [0, 0, side * 0.3],
      });
      headParts.push({
        // Recessed, or it breaks the ear's black silhouette from the side.
        geometry: new ConeGeometry(0.045, 0.12, 8),
        colour: coat,
        position: [side * 0.163, 0.275, 0.028],
        rotation: [0, 0, side * 0.3],
      });
    }
    const head = bake(headParts);
    this.head.add(new Mesh(head, this.material));

    this.face = new Mesh(
      new PlaneGeometry(0.42, 0.42),
      new MeshBasicMaterial({ transparent: true, side: DoubleSide, map: this.openFace }),
    );
    this.face.position.set(0, 0.03, 0.262);
    this.head.add(this.face);
    this.head.position.y = 0.6;
    this.body.add(this.head);

    // Tail, swung as one unit.
    const tailParts: Part[] = [];
    let radius = 0.062;
    let y = 0.14;
    let z = -0.22;
    for (let i = 0; i < 6; i++) {
      tailParts.push({
        geometry: new SphereGeometry(radius, 8, 6),
        colour: patch,
        position: [Math.sin(i * 0.5) * 0.09, y, z],
      });
      radius *= 0.9;
      y += 0.085 + i * 0.012;
      z -= 0.055 - i * 0.012;
    }
    const tail = bake(tailParts);
    this.tail.add(new Mesh(tail, this.material));
    this.body.add(this.tail);

    this.shadow = new Mesh(
      new CircleGeometry(0.3, 20),
      new MeshBasicMaterial({ color: new Color(INK), transparent: true, opacity: 0.22 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;

    this.plate = new Mesh(
      new PlaneGeometry(0.75, 0.19),
      new MeshBasicMaterial({ map: nameplateTexture(kit.name), transparent: true }),
    );
    this.plate.position.y = 1.32;

    this.group.add(this.body, this.shadow, this.plate);
    this.group.name = `kit-${kit.id}`;
    this.geometries.push(torso, head, tail);
  }

  setNightTint(tint: Color): void {
    this.material.setNightTint(tint);
  }

  setSkyColours(zenith: Color, horizon: Color): void {
    this.material.setSkyColours(zenith, horizon);
  }

  /**
   * Place and animate. `alpha` interpolates between the last simulation tick
   * and the next, so movement stays smooth above the 20 Hz step.
   */
  update(
    frameMs: number,
    alpha: number,
    camera: { x: number; z: number },
    reducedMotion: boolean,
  ): void {
    this.elapsed += frameMs / 1000;
    const kit = this.kit;

    const x = kit.previous.x + (kit.position.x - kit.previous.x) * alpha;
    const y = kit.previous.y + (kit.position.y - kit.previous.y) * alpha;
    const z = kit.previous.z + (kit.position.z - kit.previous.z) * alpha;
    this.group.position.set(x, y, z);
    this.group.rotation.y = kit.facing;

    const walking = kit.state === 'walking';
    const falling = kit.state === 'falling';

    if (reducedMotion) {
      this.body.position.y = 0;
      this.body.rotation.x = 0;
      this.body.scale.y = 1;
      this.shadow.scale.setScalar(1);
    } else if (walking) {
      // A bouncy two-step waddle rather than a leg cycle. The shadow squashing
      // on each landing is what stops the walk reading as a glide.
      const phase = this.elapsed * HOP_HZ * Math.PI * 2;
      const hop = Math.abs(Math.sin(phase));
      this.body.position.y = hop * 0.12;
      this.body.rotation.x = -0.09;
      this.body.scale.y = 1;
      this.shadow.scale.setScalar(1 - hop * 0.18);
    } else if (falling) {
      this.body.position.y = 0;
      this.body.rotation.x = 0.2;
      this.body.scale.y = 1;
      this.shadow.scale.setScalar(0.7);
    } else {
      const breath = Math.sin(this.elapsed * 1.7) * 0.012;
      this.body.position.y = breath;
      this.body.rotation.x = 0;
      this.body.scale.y = 1 + breath * 0.5;
      this.shadow.scale.setScalar(1);
    }

    this.tail.rotation.z = reducedMotion
      ? 0
      : Math.sin(this.elapsed * (walking ? 4.2 : 1.4)) * 0.22;
    this.head.rotation.y = reducedMotion ? 0 : Math.sin(this.elapsed * 0.9) * 0.08;

    if (!reducedMotion && this.elapsed > this.nextBlink) {
      const shut = this.elapsed < this.nextBlink + BLINK_LENGTH;
      (this.face.material as MeshBasicMaterial).map = shut ? this.shutFace : this.openFace;
      if (!shut) {
        this.blinkIndex = (this.blinkIndex + 1) % BLINK_GAPS.length;
        this.nextBlink = this.elapsed + (BLINK_GAPS[this.blinkIndex] ?? 4);
      }
    }

    // The nameplate turns to the camera whichever way she faces, so her name
    // is readable from any angle.
    this.plate.rotation.y = Math.atan2(camera.x - x, camera.z - z) - kit.facing;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as MeshBasicMaterial).dispose();
    this.face.geometry.dispose();
    (this.face.material as MeshBasicMaterial).dispose();
    this.plate.geometry.dispose();
    (this.plate.material as MeshBasicMaterial).dispose();
    this.material.dispose();
    this.openFace.dispose();
    this.shutFace.dispose();
  }
}
