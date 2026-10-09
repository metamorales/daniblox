/**
 * Flat-shaded material for the kits, lit exactly like the terrain.
 *
 * The voxel shader does its own lighting, so the scene carries no Three.js
 * lights at all. A kit drawn with a stock material would be lit by nothing and
 * read as a cut-out, so it gets the same key light, hemisphere fill and night
 * tint, minus the texture and the ambient occlusion.
 */
import { Color, GLSL3, ShaderMaterial, Vector3 } from 'three';

const vertexShader = /* glsl */ `
  // Colour rides on the vertices, so every part of a kit that shares an
  // animation can share one draw call regardless of its markings.
  in vec3 colour;

  out vec3 vNormal;
  out vec3 vColour;
  out float vViewDepth;

  void main() {
    vColour = colour;
    // World-space normal, so the key light matches the terrain's exactly even
    // though a kit turns and a chunk never does.
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  layout(location = 0) out vec4 fragColour;

  uniform vec3 uKeyColour;
  uniform vec3 uKeyDirection;
  uniform float uKeyIntensity;
  uniform vec3 uSkyColour;
  uniform vec3 uGroundColour;
  uniform float uHemiIntensity;
  uniform vec3 uNightTint;
  uniform vec3 uFogColour;
  uniform float uFogNear;
  uniform float uFogFar;

  in vec3 vNormal;
  in vec3 vColour;
  in float vViewDepth;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    vec3 base = srgbToLinear(vColour);
    vec3 n = normalize(vNormal);
    float key = max(dot(n, normalize(uKeyDirection)), 0.0);
    vec3 hemisphere = mix(uGroundColour, uSkyColour, n.y * 0.5 + 0.5) * uHemiIntensity;
    vec3 colour = base * (uKeyColour * uKeyIntensity * key + hemisphere) * uNightTint;

    float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
    colour = mix(colour, srgbToLinear(uFogColour), fog);
    fragColour = vec4(linearToSrgb(colour), 1.0);
  }
`;

export class CreatureMaterial extends ShaderMaterial {
  constructor() {
    super({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uKeyColour: { value: new Color('#fff1dc') },
        uKeyDirection: { value: new Vector3(0.45, 0.82, 0.35).normalize() },
        uKeyIntensity: { value: 0.82 },
        uSkyColour: { value: new Color('#8fd6f0') },
        // Neutral bounce rather than the terrain's rose, or a white cat
        // picks up the ground colour and reads as skin.
        uGroundColour: { value: new Color('#cfd4dd') },
        uHemiIntensity: { value: 0.6 },
        uNightTint: { value: new Color('#ffffff') },
        uFogColour: { value: new Color('#fdf3e2') },
        uFogNear: { value: 95 },
        uFogFar: { value: 210 },
      },
    });
  }

  setNightTint(tint: Color): void {
    (this.uniforms.uNightTint?.value as Color | undefined)?.copy(tint);
  }

  setSkyColours(zenith: Color, horizon: Color): void {
    (this.uniforms.uSkyColour?.value as Color | undefined)?.copy(zenith);
    (this.uniforms.uFogColour?.value as Color | undefined)?.copy(horizon);
  }
}
