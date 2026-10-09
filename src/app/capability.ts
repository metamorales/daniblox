/**
 * WebGL2 capability probe.
 *
 * Runs on a throwaway canvas before Three.js is imported, so a browser without
 * WebGL2 never downloads the renderer chunk. The probe context is released
 * immediately so it does not count against the browser's context limit.
 */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
