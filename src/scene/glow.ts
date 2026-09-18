import { BufferAttribute, BufferGeometry } from 'three'

/**
 * A radial-falloff disc built from vertex colours: white at the centre, black
 * at the rim. Drawn additively, black is invisible, so this is a soft glow
 * sprite with no texture and no alpha sorting. Instance colour multiplies on
 * top, which is also how each particle fades out.
 */
export function makeGlowDisc(segments = 20) {
  const positions: number[] = [0, 0, 0]
  const colors: number[] = [1, 1, 1]
  const index: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    positions.push(Math.cos(a), Math.sin(a), 0)
    colors.push(0, 0, 0)
    if (i > 0) index.push(0, i, i + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  g.setIndex(index)
  return g
}

/** A flat ring whose inner and outer edges fade to black. */
export function makeGlowRing(segments = 40, inner = 0.74) {
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    positions.push(c * inner, s * inner, 0, c, s, 0, c * ((1 + inner) / 2), s * ((1 + inner) / 2), 0)
    colors.push(0, 0, 0, 0, 0, 0, 1, 1, 1)
    if (i > 0) {
      const p = (i - 1) * 3
      const q = i * 3
      index.push(p, p + 2, q + 2, p, q + 2, q)
      index.push(p + 2, p + 1, q + 1, p + 2, q + 1, q + 2)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  g.setIndex(index)
  return g
}
