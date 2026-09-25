/** three.js dropped WebGL1 (r163), so the 3D scene needs a WebGL2 context. */
export function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    // Free the probe context right away (browsers cap the number of live contexts).
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
