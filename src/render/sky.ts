/**
 * Sky gradient and the day/night palette (docs/plan.md section 3.8 rule 4).
 *
 * The gradient is deliberately compressed around the horizon: a god-view
 * camera spends most of its time angled downward, and a physically even
 * gradient puts all of its blue off the top of the screen.
 *
 * Night is a single tint multiplied over the world. Light intensities never
 * change, which is what lets the crystal keep its unlit branch and stay the
 * brightest thing after dark.
 */
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

export interface SkyPalette {
  readonly zenith: Color;
  readonly horizon: Color;
  readonly ground: Color;
  /** Multiplied over every lit surface. White by day. */
  readonly tint: Color;
}

interface Keyframe {
  readonly at: number;
  readonly zenith: string;
  readonly horizon: string;
  readonly ground: string;
  readonly tint: string;
}

/** Phase 0 is dawn. Values between keyframes are mixed. */
const KEYFRAMES: readonly Keyframe[] = [
  { at: 0.0, zenith: '#7fb7d8', horizon: '#f3a97e', ground: '#e0b394', tint: '#f0d8cf' },
  { at: 0.14, zenith: '#8fd6f0', horizon: '#fdf3e2', ground: '#e8c9a8', tint: '#ffffff' },
  { at: 0.46, zenith: '#8fd6f0', horizon: '#fdf3e2', ground: '#e8c9a8', tint: '#ffffff' },
  { at: 0.56, zenith: '#6f7fa8', horizon: '#f3a97e', ground: '#c99a86', tint: '#edc6bb' },
  { at: 0.66, zenith: '#221d33', horizon: '#3a2f58', ground: '#2a2340', tint: '#8f97c4' },
  { at: 0.9, zenith: '#221d33', horizon: '#3a2f58', ground: '#2a2340', tint: '#8f97c4' },
  { at: 1.0, zenith: '#7fb7d8', horizon: '#f3a97e', ground: '#e0b394', tint: '#f0d8cf' },
];

const scratch = {
  zenith: new Color(),
  horizon: new Color(),
  ground: new Color(),
  tint: new Color(),
  from: new Color(),
  to: new Color(),
};

/** Palette for a point in the day. The returned colours are reused each call. */
export function skyAt(phase: number): SkyPalette {
  const p = ((phase % 1) + 1) % 1;

  let before = KEYFRAMES[0];
  let after = KEYFRAMES[KEYFRAMES.length - 1];
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (a && b && p >= a.at && p <= b.at) {
      before = a;
      after = b;
      break;
    }
  }
  if (!before || !after) throw new Error('Sky keyframes are malformed');

  const span = after.at - before.at;
  const t = span <= 0 ? 0 : (p - before.at) / span;
  // Ease so dawn and dusk arrive as a glow rather than a wipe.
  const eased = t * t * (3 - 2 * t);

  const blend = (key: 'zenith' | 'horizon' | 'ground' | 'tint'): Color => {
    scratch.from.setStyle(before[key]);
    scratch.to.setStyle(after[key]);
    return scratch[key].copy(scratch.from).lerp(scratch.to, eased);
  };

  return {
    zenith: blend('zenith'),
    horizon: blend('horizon'),
    ground: blend('ground'),
    tint: blend('tint'),
  };
}

export class Sky {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(radius = 600) {
    this.material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new Color('#8fd6f0') },
        uHorizon: { value: new Color('#fdf3e2') },
        uGround: { value: new Color('#e8c9a8') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uGround;
        varying vec3 vLocal;
        void main() {
          float h = normalize(vLocal).y * 0.5 + 0.5;
          vec3 sky = h < 0.5
            ? mix(uGround, uHorizon, smoothstep(0.30, 0.50, h))
            : mix(uHorizon, uZenith, smoothstep(0.50, 0.66, h));
          gl_FragColor = vec4(sky, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new Mesh(new SphereGeometry(radius, 24, 16), this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  apply(palette: SkyPalette): void {
    (this.material.uniforms.uZenith?.value as Color | undefined)?.copy(palette.zenith);
    (this.material.uniforms.uHorizon?.value as Color | undefined)?.copy(palette.horizon);
    (this.material.uniforms.uGround?.value as Color | undefined)?.copy(palette.ground);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
