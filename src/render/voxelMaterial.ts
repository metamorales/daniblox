/**
 * The material every chunk is drawn with.
 *
 * A small hand-written shader rather than one of Three.js's stock materials,
 * for three reasons: it needs a sampler2DArray, which the stock materials do
 * not expose; the lighting model is deliberately tiny (one key light, a
 * hemisphere fill, and vertex ambient occlusion) so there is nothing to gain
 * from the full pipeline; and night is a single tint multiply rather than a
 * change in light intensity, which keeps the unlit branch honest.
 */
import { Color, DoubleSide, FrontSide, GLSL3, ShaderMaterial, Vector3 } from 'three';
import type { DataArrayTexture } from 'three';

export interface VoxelMaterialOptions {
  readonly tiles: DataArrayTexture;
  /** Atlas layer that renders unlit, so it stays bright after dark. */
  readonly unlitLayer: number;
}

const vertexShader = /* glsl */ `
  in float aLayer;
  in float aAo;

  out vec2 vSurface;
  out float vLayer;
  out float vAo;
  out vec3 vNormal;
  out float vViewDepth;

  void main() {
    vSurface = uv;
    vLayer = aLayer;
    vAo = aAo;
    // Chunk meshes are only ever translated, so the object normal is already
    // the world normal and no normal matrix is needed.
    vNormal = normal;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;

  // A GLSL3 shader declares its own output; Three.js does not alias
  // gl_FragColor on this path, and the stock colour-space include is written
  // against that alias, so the encode below is done by hand.
  layout(location = 0) out vec4 fragColor;

  uniform sampler2DArray uTiles;
  uniform float uUnlitLayer;

  uniform vec3 uKeyColour;
  uniform vec3 uKeyDirection;
  uniform float uKeyIntensity;
  uniform vec3 uSkyColour;
  uniform vec3 uGroundColour;
  uniform float uHemiIntensity;

  uniform vec3 uNightTint;
  uniform float uAoStrength;

  uniform vec3 uFogColour;
  uniform float uFogNear;
  uniform float uFogFar;

  in vec2 vSurface;
  in float vLayer;
  in float vAo;
  in vec3 vNormal;
  in float vViewDepth;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }

  vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    vec4 texel = texture(uTiles, vec3(vSurface, vLayer));
    vec3 base = srgbToLinear(texel.rgb);
    vec3 colour;

    if (abs(vLayer - uUnlitLayer) < 0.5) {
      // The crystal ignores the sun, the shadows and the night tint. That is
      // the whole point of it: after dark it is the brightest thing around.
      colour = base;
    } else {
      vec3 n = normalize(vNormal);

      // Ambient occlusion arrives as 0..3 per vertex and is eased, because a
      // linear ramp makes the darkest corner look like a smudge.
      float openness = smoothstep(0.0, 1.0, clamp(vAo / 3.0, 0.0, 1.0));
      float occlusion = mix(1.0 - uAoStrength, 1.0, openness);

      float key = max(dot(n, normalize(uKeyDirection)), 0.0);
      vec3 hemisphere = mix(uGroundColour, uSkyColour, n.y * 0.5 + 0.5) * uHemiIntensity;
      vec3 light = uKeyColour * uKeyIntensity * key + hemisphere;

      colour = base * light * occlusion * uNightTint;
    }

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, srgbToLinear(uFogColour), fog);

    fragColor = vec4(linearToSrgb(colour), 1.0);
  }
`;

export class VoxelMaterial extends ShaderMaterial {
  constructor({ tiles, unlitLayer }: VoxelMaterialOptions) {
    super({
      glslVersion: GLSL3,
      side: FrontSide,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTiles: { value: tiles },
        uUnlitLayer: { value: unlitLayer },

        uKeyColour: { value: new Color('#fff1dc') },
        uKeyDirection: { value: new Vector3(0.45, 0.82, 0.35).normalize() },
        uKeyIntensity: { value: 0.82 },
        uSkyColour: { value: new Color('#8fd6f0') },
        uGroundColour: { value: new Color('#e6a0a4') },
        uHemiIntensity: { value: 0.46 },

        uNightTint: { value: new Color('#ffffff') },
        uAoStrength: { value: 0.6 },

        uFogColour: { value: new Color('#fdf3e2') },
        uFogNear: { value: 95 },
        uFogFar: { value: 210 },
      },
    });
  }

  /** Day and night is one tint multiply; light intensities never change. */
  /** Where fog starts and where it is total, in blocks from the camera. */
  setFog(near: number, far: number): void {
    const start = this.uniforms.uFogNear;
    const end = this.uniforms.uFogFar;
    if (start) start.value = near;
    if (end) end.value = far;
  }

  setNightTint(colour: Color): void {
    (this.uniforms.uNightTint?.value as Color | undefined)?.copy(colour);
  }

  setSkyColours(zenith: Color, horizon: Color): void {
    (this.uniforms.uSkyColour?.value as Color | undefined)?.copy(zenith);
    (this.uniforms.uFogColour?.value as Color | undefined)?.copy(horizon);
  }

  /** Used only by the double-sided debug view; normal rendering culls backfaces. */
  setDoubleSided(on: boolean): void {
    this.side = on ? DoubleSide : FrontSide;
    this.needsUpdate = true;
  }
}
