import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * The scene's only two textures, drawn on small canvases (no image files). Created lazily in the
 * browser and shared by every mesh that uses them.
 */

let radial: CanvasTexture | null = null
let planks: CanvasTexture | null = null

/** White radial falloff with alpha: blob shadows and light glows (tinted by the material colour). */
export function radialTexture(): CanvasTexture {
  if (radial) return radial
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (g) {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.45, 'rgba(255,255,255,0.55)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, size, size)
  }
  radial = new CanvasTexture(c)
  return radial
}

/** Soft floor planks (greyscale, multiplied by the floor colour). */
export function plankTexture(): CanvasTexture {
  if (planks) return planks
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, size, size)
    const rows = 4
    const h = size / rows
    for (let r = 0; r < rows; r++) {
      // seams between planks
      g.fillStyle = 'rgba(120,90,60,0.16)'
      g.fillRect(0, r * h, size, 3)
      // staggered end joints
      const x = ((r * 97) % size) + (r % 2 ? size / 2 : 0)
      g.fillRect(x % size, r * h, 3, h)
      // faint grain
      g.fillStyle = 'rgba(120,90,60,0.05)'
      g.fillRect(0, r * h + h * 0.45, size, 2)
    }
  }
  planks = new CanvasTexture(c)
  planks.colorSpace = SRGBColorSpace
  planks.wrapS = planks.wrapT = RepeatWrapping
  planks.repeat.set(2.2, 2.6)
  planks.anisotropy = 4
  return planks
}
