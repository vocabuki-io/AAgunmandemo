/**
 * Wave director: intermission -> trickle in -> fight -> cleared.
 *
 * Bodies arrive a few at a time rather than all at once, so a wave is a
 * sustained decision about what to spend rather than one alpha strike.
 */
import { ARENA, SPAWN, WAVES, type EnemyKind } from '../config'
import { aliveCount, spawnEnemy } from './enemies'
import { pillars } from './arenaLayout'
import { playerState } from './runtime'

export type DirectorPhase = 'intermission' | 'engaging' | 'cleared'

export const director = {
  phase: 'intermission' as DirectorPhase,
  waveIndex: 0,
  /** Kinds still owed to the arena this wave. */
  queue: [] as EnemyKind[],
  timer: 0,
}

/** Seconds of breathing room before the first wave and between waves. */
const FIRST_DELAY = 3.4
const BETWEEN_DELAY = 5.0

export function resetDirector() {
  director.phase = 'intermission'
  director.waveIndex = 0
  director.queue = []
  director.timer = FIRST_DELAY
}

/** Interleaved so a wave never opens with its whole armour contingent. */
function buildQueue(i: number): EnemyKind[] {
  const w = WAVES[Math.min(i, WAVES.length - 1)]
  const parts: EnemyKind[][] = [
    Array.from({ length: w.swarm }, () => 'swarm' as EnemyKind),
    Array.from({ length: w.runner }, () => 'runner' as EnemyKind),
    Array.from({ length: w.armored }, () => 'armored' as EnemyKind),
  ]
  const out: EnemyKind[] = []
  const total = parts.reduce((n, p) => n + p.length, 0)
  // Round-robin by proportion, so the mix stays even from the first body on.
  const cursors = [0, 0, 0]
  while (out.length < total) {
    let bestIdx = -1
    let bestGap = -1
    for (let k = 0; k < parts.length; k++) {
      const remaining = parts[k].length - cursors[k]
      if (remaining <= 0) continue
      if (remaining > bestGap) { bestGap = remaining; bestIdx = k }
    }
    if (bestIdx < 0) break
    out.push(parts[bestIdx][cursors[bestIdx]++])
  }
  return out
}

/** A spot on the spawn ring that is not inside a girder. */
function pickSpawn(): [number, number] {
  for (let tries = 0; tries < 24; tries++) {
    const ang = Math.random() * Math.PI * 2
    const d = SPAWN.ringMin + Math.random() * (SPAWN.ringMax - SPAWN.ringMin)
    const x = playerState.pos.x + Math.cos(ang) * d
    const z = playerState.pos.z + Math.sin(ang) * d
    if (Math.hypot(x, z) > ARENA.radius - 2) continue
    let blocked = false
    for (const p of pillars) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + 1.6) { blocked = true; break }
    }
    if (!blocked) return [x, z]
  }
  const ang = Math.random() * Math.PI * 2
  return [Math.cos(ang) * (ARENA.radius - 6), Math.sin(ang) * (ARENA.radius - 6)]
}

export type DirectorEvents = {
  onWaveStart: (index: number) => void
  onWaveCleared: (index: number) => void
  onRunCleared: () => void
}

export function updateDirector(dt: number, ev: DirectorEvents) {
  director.timer -= dt

  switch (director.phase) {
    case 'intermission': {
      if (director.timer > 0) return
      director.queue = buildQueue(director.waveIndex)
      director.phase = 'engaging'
      director.timer = 0
      ev.onWaveStart(director.waveIndex)
      return
    }

    case 'engaging': {
      if (director.queue.length > 0) {
        if (director.timer <= 0 && aliveCount() < SPAWN.maxAlive) {
          const kind = director.queue.shift()!
          const [x, z] = pickSpawn()
          spawnEnemy(kind, x, z)
          director.timer = SPAWN.interval
        }
        return
      }
      if (aliveCount() === 0) {
        ev.onWaveCleared(director.waveIndex)
        if (director.waveIndex >= WAVES.length - 1) {
          director.phase = 'cleared'
          ev.onRunCleared()
        } else {
          director.waveIndex++
          director.phase = 'intermission'
          director.timer = BETWEEN_DELAY
        }
      }
      return
    }

    default:
  }
}

/** What the HUD should show as "left": on the field plus still owed. */
export const remaining = () => aliveCount() + director.queue.length
