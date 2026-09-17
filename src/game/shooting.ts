/**
 * Charge -> shot math and the bolt pool.
 *
 * The two knobs are deliberately multiplicative in cost and orthogonal in
 * effect, so the interesting shots are the SPECIALISED ones:
 *
 *   pure volts  (v=1,a=0) -> 400V  1.3A -> cost  13, pierces 4, breaks armour
 *   pure amps   (v=0,a=1) ->  58V 10.0A -> cost  15, 6.5m arc, deletes swarms
 *   both maxed  (v=1,a=1) -> 400V 10.0A -> cost 100
 *
 * Holding everything down every time therefore costs ~7x a specialised shot
 * for no extra utility. That ratio is the whole economy.
 */
import { Vector3 } from 'three'
import { SHOT } from '../config'
import { stats } from './runtime'

export type ShotSpec = {
  volts: number
  amps: number
  speed: number
  range: number
  pierce: number
  damage: number
  arcRadius: number
  arcDamage: number
  stun: number
  cost: number
  /** 0..1 blend for the bolt colour: 0 = magenta (amps), 1 = cyan (volts). */
  hue: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Map the two raw 0..1 knobs to a concrete shot. */
export function computeShot(vRaw: number, aRaw: number): ShotSpec {
  // A bare tap still produces a usable pellet, so the floor is a remap rather
  // than a clamp: 0 knob -> floor, 1 knob -> 1.
  const v = SHOT.voltFloor + vRaw * (1 - SHOT.voltFloor)
  const a = SHOT.ampFloor + aRaw * (1 - SHOT.ampFloor)

  const volts = lerp(SHOT.voltMin, SHOT.voltMax, v)
  const amps = lerp(SHOT.ampMin, SHOT.ampMax, a)

  return {
    volts,
    amps,
    speed: lerp(SHOT.speedMin, SHOT.speedMax, v),
    range: lerp(SHOT.rangeMin, SHOT.rangeMax, v),
    pierce: Math.floor(v * SHOT.pierceMax),
    damage: amps * SHOT.damagePerAmp,
    arcRadius: aRaw * SHOT.arcRadiusPerA,
    arcDamage: amps * SHOT.arcDamagePerAmp,
    stun: aRaw * SHOT.stunPerA,
    cost: (volts * amps) / SHOT.costDivisor,
    hue: v / (v + a),
  }
}

export type Bolt = {
  alive: boolean
  pos: Vector3
  prev: Vector3
  dir: Vector3
  spec: ShotSpec
  /** Scales every effect of the shot when the cylinder could not pay in full. */
  power: number
  traveled: number
  pierceLeft: number
  /** Enemy ids already punched through, so one bolt cannot hit twice. */
  hits: number[]
  age: number
}

const emptySpec = computeShot(0, 0)

export const bolts: Bolt[] = Array.from({ length: 64 }, () => ({
  alive: false,
  pos: new Vector3(),
  prev: new Vector3(),
  dir: new Vector3(0, 0, -1),
  spec: emptySpec,
  power: 1,
  traveled: 0,
  pierceLeft: 0,
  hits: [],
  age: 0,
}))

let boltCursor = 0

export function spawnBolt(origin: Vector3, dir: Vector3, spec: ShotSpec, power: number) {
  let bolt: Bolt | null = null
  for (let i = 0; i < bolts.length; i++) {
    const b = bolts[(boltCursor + i) % bolts.length]
    if (!b.alive) { bolt = b; boltCursor = (boltCursor + i + 1) % bolts.length; break }
  }
  if (!bolt) { bolt = bolts[boltCursor]; boltCursor = (boltCursor + 1) % bolts.length }

  bolt.alive = true
  bolt.pos.copy(origin)
  bolt.prev.copy(origin)
  bolt.dir.copy(dir).normalize()
  bolt.spec = spec
  bolt.power = power
  bolt.traveled = 0
  bolt.pierceLeft = spec.pierce
  bolt.hits.length = 0
  bolt.age = 0
  stats.boltsSpawned++
  return bolt
}

export function clearBolts() {
  for (const b of bolts) { b.alive = false; b.hits.length = 0 }
}
