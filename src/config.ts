/**
 * All tunable numbers live here. Rationale for every value is recorded in
 * PROGRESS.md -- the short version is printed next to each block.
 */

export const ARENA = {
  /** Playable radius. Beyond this is the boundary wall. */
  radius: 46,
  wallHeight: 9,
  /** Ring of cover pillars. */
  pillarRings: [
    { count: 6, dist: 15, h: 4.5, r: 1.3 },
    { count: 9, dist: 28, h: 6.5, r: 1.7 },
    { count: 7, dist: 39, h: 3.2, r: 1.1 },
  ],
}

export const PLAYER = {
  radius: 0.4,
  halfHeight: 0.5,
  eyeHeight: 0.75,
  moveSpeed: 8.2,
  /** Movement while a charge is building: you commit to standing still-ish. */
  chargeSpeedMul: 0.52,
  airControl: 0.35,
  accel: 62,
  jumpSpeed: 9.6,
  maxHp: 100,
  /** Seconds of damage immunity after a hit, so swarms cannot chain-lock you. */
  iFrames: 0.55,
  spawn: [0, 3, 0] as [number, number, number],
}

export const GRAVITY: [number, number, number] = [0, -26, 0]

export const CAMERA = {
  baseFov: 74,
  /** FOV at full volt charge. The zoom IS the volt gauge -- there is no bar. */
  zoomFov: 26,
  /** Height of the camera pivot above the player's feet. */
  eyeY: 1.45,
  /** Over-the-shoulder offset in camera-local space (x right, y up, z back). */
  offset: [0.85, 1.5, 4.6] as [number, number, number],
  zoomOffset: [0.55, 1.2, 2.5] as [number, number, number],
  pitchMin: -1.15,
  pitchMax: 0.95,
  sensitivity: 0.0022,
  lerp: 16,
}

/**
 * CHARGE -> SHOT.
 *
 * v (0..1) = volts knob  = push:   speed, range, pierce, armour break
 * a (0..1) = amperes knob = flow:  damage, arc radius, stun
 *
 * Battery cost is proportional to V*A, so the two knobs multiply against your
 * only real resource. That product is the whole game.
 */
export const SHOT = {
  /** Seconds of held button to reach full charge. */
  voltChargeTime: 1.35,
  ampChargeTime: 1.15,
  /** A bare tap still produces a usable pellet. */
  voltFloor: 0.1,
  ampFloor: 0.08,
  /** Cylinder rotation -- caps the DPS of tap-spamming. */
  cooldown: 0.34,

  voltMin: 20,
  voltMax: 400,
  ampMin: 0.5,
  ampMax: 10,

  speedMin: 44,
  speedMax: 205,
  rangeMin: 22,
  rangeMax: 92,
  /** Extra bodies a bolt punches through, floor(v * pierceMax). */
  pierceMax: 4,

  /** Direct hit damage per ampere. */
  damagePerAmp: 12,
  /** Arc (chain) radius per unit of a. */
  arcRadiusPerA: 6.5,
  /** Arc damage per ampere, before distance falloff. */
  arcDamagePerAmp: 5,
  stunPerA: 0.9,

  /** Battery units drawn = V * A / costDivisor. */
  costDivisor: 40,

  bulletRadius: 0.22,
}

export const BATTERY = {
  /** Charge units in one fresh AA. A max-power shot drains exactly one. */
  unitsPerCell: 100,
  /** Chambers in the cylinder. */
  chambers: 6,
  startingSpares: 18,
  /** Spares granted between waves. */
  waveRefill: 8,
  reloadTime: 1.15,
}

export type EnemyKind = 'armored' | 'swarm' | 'runner'

export const ENEMIES: Record<EnemyKind, {
  hp: number
  speed: number
  radius: number
  height: number
  damage: number
  attackRange: number
  attackInterval: number
  /** Bolts below this voltage simply bounce off. */
  armorVolts: number
  /** Multiplier applied to arc damage -- swarms conduct, armour does not. */
  arcTaken: number
  color: string
  accent: string
  score: number
}> = {
  // Slow wall of metal. Only a high-volt bolt gets through the plating.
  armored: {
    hp: 85, speed: 2.0, radius: 0.95, height: 2.3, damage: 18,
    attackRange: 2.2, attackInterval: 1.5, armorVolts: 220, arcTaken: 0.35,
    // Cold steel, deliberately unlike the warm-brown girders so a wall of
    // armour never reads as scenery.
    color: '#6d7787', accent: '#ff2f8e', score: 100,
  },
  // Weak, numerous, packs tight. Made to be deleted by one wide arc.
  swarm: {
    hp: 14, speed: 4.3, radius: 0.42, height: 1.0, damage: 6,
    attackRange: 1.3, attackInterval: 0.85, armorVolts: 0, arcTaken: 1.35,
    color: '#7d6234', accent: '#2ff2ff', score: 25,
  },
  // Fast flanker. If you are still charging, it is already on you.
  runner: {
    hp: 22, speed: 7.4, radius: 0.5, height: 1.7, damage: 11,
    attackRange: 1.7, attackInterval: 1.0, armorVolts: 0, arcTaken: 1.0,
    color: '#4e5460', accent: '#ffd23f', score: 50,
  },
}

export type WaveSpec = { armored: number; swarm: number; runner: number; label: string }

export const WAVES: WaveSpec[] = [
  { armored: 0, swarm: 6,  runner: 1, label: 'SPARKS' },
  { armored: 1, swarm: 8,  runner: 2, label: 'TIN CAN' },
  { armored: 2, swarm: 4,  runner: 4, label: 'FAST IRON' },
  { armored: 2, swarm: 14, runner: 3, label: 'SWARM' },
  { armored: 4, swarm: 10, runner: 4, label: 'FOUNDRY' },
  { armored: 3, swarm: 16, runner: 7, label: 'LAST CALL' },
]

/** Enemies alive at once; the rest trickle in as others die. */
export const SPAWN = {
  maxAlive: 22,
  interval: 0.55,
  ringMin: 30,
  ringMax: 44,
}
