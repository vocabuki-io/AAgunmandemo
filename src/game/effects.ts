/**
 * Fixed-size particle pools. Allocation-free at runtime: every effect is a
 * slot that gets reused, so a heavy wave never triggers GC mid-fight.
 */
import { Color, Vector3 } from 'three'

export type Spark = {
  alive: boolean
  pos: Vector3
  vel: Vector3
  life: number
  maxLife: number
  size: number
  color: Color
  gravity: number
}

export type Ring = {
  alive: boolean
  pos: Vector3
  life: number
  maxLife: number
  to: number
  color: Color
  /** Flat on the ground (shock wave) or billboarded (air burst). */
  flat: boolean
}

export type Flash = {
  alive: boolean
  pos: Vector3
  life: number
  maxLife: number
  size: number
  color: Color
}

/** A visible discharge jumping from an impact to a conducting body. */
export type Arc = {
  alive: boolean
  from: Vector3
  to: Vector3
  life: number
  maxLife: number
  color: Color
  /** Fixed jitter seed so the bolt shape holds still while it fades. */
  seed: number
}

const mk = <T>(n: number, f: () => T) => Array.from({ length: n }, f)

export const sparks: Spark[] = mk(360, () => ({
  alive: false, pos: new Vector3(), vel: new Vector3(),
  life: 0, maxLife: 1, size: 0.1, color: new Color(), gravity: 14,
}))

export const rings: Ring[] = mk(48, () => ({
  alive: false, pos: new Vector3(), life: 0, maxLife: 1, to: 1, color: new Color(), flat: true,
}))

export const flashes: Flash[] = mk(48, () => ({
  alive: false, pos: new Vector3(), life: 0, maxLife: 1, size: 1, color: new Color(),
}))

export const arcs: Arc[] = mk(40, () => ({
  alive: false, from: new Vector3(), to: new Vector3(),
  life: 0, maxLife: 1, color: new Color(), seed: 0,
}))

let sparkCursor = 0
let arcCursor = 0
let ringCursor = 0
let flashCursor = 0

/** Round-robin so a burst never starves a later one. */
function take<T extends { alive: boolean }>(pool: T[], cursor: number): [T, number] {
  for (let i = 0; i < pool.length; i++) {
    const idx = (cursor + i) % pool.length
    if (!pool[idx].alive) return [pool[idx], (idx + 1) % pool.length]
  }
  const idx = cursor % pool.length
  return [pool[idx], (idx + 1) % pool.length]
}

export function spawnSparks(
  pos: Vector3, count: number, speed: number, color: Color | string,
  opts: { spread?: number; up?: number; life?: number; size?: number; gravity?: number } = {},
) {
  const spread = opts.spread ?? 1
  const up = opts.up ?? 0.5
  const life = opts.life ?? 0.5
  const size = opts.size ?? 0.09
  const gravity = opts.gravity ?? 14
  for (let i = 0; i < count; i++) {
    const [s, next] = take(sparks, sparkCursor)
    sparkCursor = next
    s.alive = true
    s.pos.copy(pos)
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(1 - 2 * Math.random())
    s.vel.set(
      Math.sin(ph) * Math.cos(th) * spread,
      Math.cos(ph) * spread + up,
      Math.sin(ph) * Math.sin(th) * spread,
    ).multiplyScalar(speed * (0.45 + Math.random() * 0.75))
    s.life = life * (0.65 + Math.random() * 0.7)
    s.maxLife = s.life
    s.size = size * (0.6 + Math.random() * 0.9)
    s.gravity = gravity
    s.color.set(color as string)
  }
}

export function spawnRing(pos: Vector3, to: number, color: Color | string, life = 0.42, flat = true) {
  const [r, next] = take(rings, ringCursor)
  ringCursor = next
  r.alive = true
  r.pos.copy(pos)
  r.life = life
  r.maxLife = life
  r.to = to
  r.flat = flat
  r.color.set(color as string)
}

export function spawnFlash(pos: Vector3, size: number, color: Color | string, life = 0.13) {
  const [f, next] = take(flashes, flashCursor)
  flashCursor = next
  f.alive = true
  f.pos.copy(pos)
  f.life = life
  f.maxLife = life
  f.size = size
  f.color.set(color as string)
}

export function spawnArc(from: Vector3, to: Vector3, color: Color | string, life = 0.24) {
  const [a, next] = take(arcs, arcCursor)
  arcCursor = next
  a.alive = true
  a.from.copy(from)
  a.to.copy(to)
  a.life = life
  a.maxLife = life
  a.seed = Math.random() * 1000
  a.color.set(color as string)
}

export function updateEffects(dt: number) {
  for (const a of arcs) {
    if (!a.alive) continue
    a.life -= dt
    if (a.life <= 0) a.alive = false
  }
  for (const s of sparks) {
    if (!s.alive) continue
    s.life -= dt
    if (s.life <= 0) { s.alive = false; continue }
    s.vel.y -= s.gravity * dt
    s.pos.addScaledVector(s.vel, dt)
    if (s.pos.y < 0.03) {
      s.pos.y = 0.03
      s.vel.y = Math.abs(s.vel.y) * 0.32
      s.vel.x *= 0.6
      s.vel.z *= 0.6
    }
  }
  for (const r of rings) {
    if (!r.alive) continue
    r.life -= dt
    if (r.life <= 0) r.alive = false
  }
  for (const f of flashes) {
    if (!f.alive) continue
    f.life -= dt
    if (f.life <= 0) f.alive = false
  }
}

export function clearEffects() {
  for (const a of arcs) a.alive = false
  for (const s of sparks) s.alive = false
  for (const r of rings) r.alive = false
  for (const f of flashes) f.alive = false
}
