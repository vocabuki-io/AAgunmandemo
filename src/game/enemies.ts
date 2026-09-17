/**
 * Enemies are plain data, not physics bodies.
 *
 * Rapier drives the player and the arena only. Twenty-odd melee bodies shoving
 * each other produces far more jank than it is worth, and bolts need exact
 * pierce ordering that a contact-event model does not give. Steering plus a
 * segment/sphere test is both cheaper and more controllable.
 */
import { Vector3 } from 'three'
import { ARENA, ENEMIES, PLAYER, type EnemyKind } from '../config'
import { pillars } from './arenaLayout'
import { playerState, stats } from './runtime'

export type Enemy = {
  id: number
  alive: boolean
  kind: EnemyKind
  pos: Vector3
  vel: Vector3
  hp: number
  maxHp: number
  /** Seconds left of electrical paralysis. */
  stun: number
  attackCd: number
  hitFlash: number
  yaw: number
  phase: number
  /** Rises out of the sand on spawn, 0..1. */
  emerge: number
}

let nextId = 1

export const enemies: Enemy[] = Array.from({ length: 64 }, () => ({
  id: 0,
  alive: false,
  kind: 'swarm' as EnemyKind,
  pos: new Vector3(),
  vel: new Vector3(),
  hp: 0,
  maxHp: 1,
  stun: 0,
  attackCd: 0,
  hitFlash: 0,
  yaw: 0,
  phase: 0,
  emerge: 0,
}))

export const aliveCount = () => enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)

export function spawnEnemy(kind: EnemyKind, x: number, z: number) {
  const slot = enemies.find((e) => !e.alive)
  if (!slot) return null
  const cfg = ENEMIES[kind]
  slot.id = nextId++
  slot.alive = true
  slot.kind = kind
  slot.pos.set(x, 0, z)
  slot.vel.set(0, 0, 0)
  slot.hp = cfg.hp
  slot.maxHp = cfg.hp
  slot.stun = 0
  slot.attackCd = 0.4
  slot.hitFlash = 0
  slot.yaw = 0
  slot.phase = Math.random() * Math.PI * 2
  slot.emerge = 0
  return slot
}

export function clearEnemies() {
  for (const e of enemies) e.alive = false
}

const toPlayer = new Vector3()
const push = new Vector3()

/**
 * Steering: run at the player, keep out of each other, keep out of girders.
 * No search, no vision cone, no alert states -- by design.
 */
export function updateEnemies(dt: number, onAttack: (e: Enemy, dmg: number) => void) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]
    if (!e.alive) continue
    const cfg = ENEMIES[e.kind]

    e.phase += dt
    e.hitFlash = Math.max(0, e.hitFlash - dt * 3.4)
    e.emerge = Math.min(1, e.emerge + dt * 2.2)
    e.attackCd = Math.max(0, e.attackCd - dt)

    if (e.stun > 0) {
      e.stun -= dt
      e.vel.multiplyScalar(Math.max(0, 1 - dt * 6))
      e.pos.addScaledVector(e.vel, dt)
      continue
    }

    toPlayer.set(playerState.pos.x - e.pos.x, 0, playerState.pos.z - e.pos.z)
    const dist = toPlayer.length()
    if (dist > 0.001) toPlayer.multiplyScalar(1 / dist)
    e.yaw = Math.atan2(toPlayer.x, toPlayer.z)

    push.set(0, 0, 0)

    // Separation from other enemies.
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue
      const o = enemies[j]
      if (!o.alive) continue
      const dx = e.pos.x - o.pos.x
      const dz = e.pos.z - o.pos.z
      const d2 = dx * dx + dz * dz
      const want = cfg.radius + ENEMIES[o.kind].radius
      if (d2 < want * want && d2 > 1e-6) {
        const d = Math.sqrt(d2)
        const k = (want - d) / want
        push.x += (dx / d) * k * 2.4
        push.z += (dz / d) * k * 2.4
      }
    }

    // Girders: slide around rather than grind into them.
    for (const p of pillars) {
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      const want = p.r + cfg.radius + 0.25
      const d2 = dx * dx + dz * dz
      if (d2 < want * want && d2 > 1e-6) {
        const d = Math.sqrt(d2)
        const k = (want - d) / want
        push.x += (dx / d) * k * 3.4
        push.z += (dz / d) * k * 3.4
      }
    }

    const stopAt = cfg.attackRange + PLAYER.radius * 0.5
    const closing = dist > stopAt ? 1 : 0
    const vx = toPlayer.x * cfg.speed * closing + push.x * cfg.speed
    const vz = toPlayer.z * cfg.speed * closing + push.z * cfg.speed

    // Snappy but not instant, so knockback still reads.
    const k = 1 - Math.exp(-9 * dt)
    e.vel.x += (vx - e.vel.x) * k
    e.vel.z += (vz - e.vel.z) * k
    e.pos.x += e.vel.x * dt
    e.pos.z += e.vel.z * dt

    // Stay inside the fence.
    const r = Math.hypot(e.pos.x, e.pos.z)
    const lim = ARENA.radius - cfg.radius - 0.8
    if (r > lim) {
      e.pos.x = (e.pos.x / r) * lim
      e.pos.z = (e.pos.z / r) * lim
    }

    if (dist <= cfg.attackRange + PLAYER.radius && e.attackCd <= 0) {
      e.attackCd = cfg.attackInterval
      onAttack(e, cfg.damage)
    }
  }
}

/** Centre of mass, used for hit tests and effect placement. */
export function enemyCenter(e: Enemy, out: Vector3) {
  return out.set(e.pos.x, e.pos.y + ENEMIES[e.kind].height * 0.5, e.pos.z)
}

export function killEnemy(e: Enemy) {
  e.alive = false
  stats.enemyKills++
}
