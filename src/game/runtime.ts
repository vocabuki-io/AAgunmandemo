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
}

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))
