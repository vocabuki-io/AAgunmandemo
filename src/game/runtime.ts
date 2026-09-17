/**
 * Mutable per-frame world state shared between systems.
 *
 * Deliberately outside React: bullets, enemies and the charge meter update at
 * 60Hz and must not touch the store or trigger renders. Only coarse,
 * HUD-visible facts are mirrored into zustand.
 */
import { Vector3 } from 'three'

export const playerState = {
  pos: new Vector3(0, 2, 0),
  vel: new Vector3(),
  grounded: false,
  /** Muzzle position, world space. */
  muzzle: new Vector3(),
  /** Unit aim direction, world space. */
  aim: new Vector3(0, 0, -1),
  invuln: 0,
  hitFlash: 0,
  alive: true,
}

/** Camera pose, published by CameraRig for aim resolution. */
export const camState = {
  pos: new Vector3(),
  dir: new Vector3(0, 0, -1),
  shake: 0,
  fovKick: 0,
}

export const charge = {
  /** 0..1 volt knob. */
  v: 0,
  /** 0..1 ampere knob. */
  a: 0,
  vHeld: false,
  aHeld: false,
  /** Was anything charged since the last release? */
  armed: false,
  cooldown: 0,
  reloadTimer: 0,
  /** Smoothed value driving the FOV. */
  vSmooth: 0,
  aSmooth: 0,
  /** Set for one frame when a shot leaves the barrel, for recoil/sound. */
  firedPulse: 0,
  dryPulse: 0,
}

/**
 * Developer switches. Bound to the leva panel for tuning, and used by verify
 * to get a quiet arena when a scenario is about the gun rather than the fight.
 */
export const debug = {
  spawnPaused: false,
  godMode: false,
  infiniteBattery: false,
}

/**
 * Cumulative event counters. These exist for verification: asserting "a bolt
 * is on screen right now" is a race against the frame rate, whereas "one bolt
 * was spawned and one bolt resolved" is the actual invariant and holds at any
 * frame rate. Cheap enough to leave in the shipped build.
 */
export const stats = {
  boltsSpawned: 0,
  worldImpacts: 0,
  boltsExpired: 0,
  enemyHits: 0,
  enemyKills: 0,
  arcHits: 0,
  playerHits: 0,
  dryFires: 0,
  reloads: 0,
}

export function resetStats() {
  stats.boltsSpawned = 0
  stats.worldImpacts = 0
  stats.boltsExpired = 0
  stats.enemyHits = 0
  stats.enemyKills = 0
  stats.arcHits = 0
  stats.playerHits = 0
  stats.dryFires = 0
  stats.reloads = 0
}

export function resetRuntime() {
  playerState.pos.set(0, 2, 0)
  playerState.vel.set(0, 0, 0)
  playerState.grounded = false
  playerState.invuln = 0
  playerState.hitFlash = 0
  playerState.alive = true
  charge.v = 0
  charge.a = 0
  charge.vHeld = false
  charge.aHeld = false
  charge.armed = false
  charge.cooldown = 0
  charge.reloadTimer = 0
  charge.vSmooth = 0
  charge.aSmooth = 0
  charge.firedPulse = 0
  charge.dryPulse = 0
  camState.shake = 0
  camState.fovKick = 0
  resetStats()
}

/**
 * Longest frame we will credit to gameplay timers.
 *
 * This was 1/30 and that was a bug: clamping at 30fps means every machine
 * running slower than 30fps charges, cools down and ages effects in slow
 * motion, without any visible sign that it is happening. Measured at 6.9fps
 * under SwiftShader, a 1.35s charge took 5.9s. The clamp only exists to
 * survive a genuine stall (tab switch, GC pause), so it belongs far out at
 * 0.2s; below 5fps the game slows down, which is the honest trade.
 *
 * Nothing here tunnels at a long step: bolts sweep their whole step with a
 * ray, and enemies move by distance, not by impulse.
 */
export const MAX_DT = 0.2

export const clampDt = (raw: number) => Math.min(raw, MAX_DT)

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))
