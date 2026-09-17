import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useRef } from 'react'
import { Color, Vector3 } from 'three'
import { BATTERY, SHOT } from '../config'
import { keys, mouse } from '../input'
import { camState, charge, clampDt, damp, playerState, stats } from '../game/runtime'
import { bolts, clearBolts, computeShot, spawnBolt, type Bolt, type ShotSpec } from '../game/shooting'
import { spawnFlash, spawnRing, spawnSparks, updateEffects } from '../game/effects'
import { boltColor, CYAN, MAGENTA, WHITE_HOT } from '../game/palette'
import { useGame } from '../store'

const aimPoint = new Vector3()
const boltDir = new Vector3()
const impactPoint = new Vector3()
const tmpColor = new Color()

/** When the cylinder cannot pay in full, the shot shrinks instead of failing. */
function scaleSpec(s: ShotSpec, power: number): ShotSpec {
  const k = Math.sqrt(power)
  return {
    volts: s.volts * k,
    amps: s.amps * k,
    speed: s.speed * (0.5 + 0.5 * k),
    range: s.range * k,
    pierce: Math.floor(s.pierce * k),
    damage: s.damage * k,
    arcRadius: s.arcRadius * k,
    arcDamage: s.arcDamage * k,
    stun: s.stun * k,
    cost: s.cost * power,
    hue: s.hue,
  }
}

function impact(point: Vector3, b: Bolt) {
  const s = b.spec
  boltColor(tmpColor, s.hue)
  spawnFlash(point, 0.5 + s.amps * 0.11 + s.volts * 0.0016, WHITE_HOT, 0.11)
  spawnFlash(point, 0.9 + s.amps * 0.2, tmpColor, 0.2)
  spawnSparks(point, Math.round(5 + s.amps * 1.8), 4 + s.volts * 0.016, tmpColor, {
    spread: 1, up: 0.5, life: 0.45, size: 0.075,
  })
  if (s.arcRadius > 0.5) {
    spawnRing(point, s.arcRadius, MAGENTA, 0.36)
    spawnSparks(point, Math.round(6 + s.amps * 2.4), s.arcRadius * 2.6, MAGENTA, {
      spread: 1.3, up: 0.18, life: 0.4, size: 0.06, gravity: 6,
    })
  }
  if (s.volts > 200) spawnRing(point, 0.5 + s.volts * 0.004, CYAN, 0.22, false)
}

/**
 * The single ordered game step. Everything that must happen in a known order
 * (input -> fire -> bolts -> effects) lives here rather than being scattered
 * across component-local useFrame callbacks.
 */
export function GameSystems() {
  const { world, rapier } = useRapier()
  const prevReload = useRef(false)

  useFrame((_, rawDt) => {
    const dt = clampDt(rawDt)
    const g = useGame.getState()
    const playing = g.phase === 'playing'

    charge.firedPulse = Math.max(0, charge.firedPulse - dt)
    charge.dryPulse = Math.max(0, charge.dryPulse - dt)
    charge.cooldown = Math.max(0, charge.cooldown - dt)

    // --- reload -------------------------------------------------------
    const rDown = keys.has('KeyR')
    if (playing && rDown && !prevReload.current) {
      g.beginReload()
      if (useGame.getState().reloading) charge.reloadTimer = BATTERY.reloadTime
    }
    prevReload.current = rDown

    if (g.reloading) {
      charge.reloadTimer -= dt
      charge.v = 0
      charge.a = 0
      charge.armed = false
      if (charge.reloadTimer <= 0) {
        g.finishReload()
        stats.reloads++
        spawnSparks(playerState.muzzle, 7, 3.2, CYAN, { spread: 1, up: 0.6, life: 0.4, size: 0.06 })
      }
    } else if (playing) {
      // --- charge state machine --------------------------------------
      const vHeld = mouse.right
      const aHeld = mouse.left
      const ready = charge.cooldown <= 0

      if (ready) {
        if (vHeld) charge.v = Math.min(1, charge.v + dt / SHOT.voltChargeTime)
        if (aHeld) charge.a = Math.min(1, charge.a + dt / SHOT.ampChargeTime)
        if (vHeld || aHeld) charge.armed = true

        // Fire on the frame where NEITHER button is down any more. While
        // either is held the gun never discharges -- release order is free.
        if (charge.armed && !vHeld && !aHeld) fire(g)
      }
      charge.vHeld = vHeld
      charge.aHeld = aHeld
    } else {
      charge.v = 0
      charge.a = 0
      charge.armed = false
      charge.vHeld = false
      charge.aHeld = false
    }

    charge.vSmooth = damp(charge.vSmooth, charge.v, 10, dt)
    charge.aSmooth = damp(charge.aSmooth, charge.a, 10, dt)

    // Amperes crackle around you while they build.
    if (charge.a > 0.05 && Math.random() < charge.a * dt * 42) {
      const r = 0.6 + charge.a * 0.9
      const th = Math.random() * Math.PI * 2
      impactPoint.set(
        playerState.pos.x + Math.cos(th) * r,
        playerState.pos.y - 0.4 + Math.random() * 1.6,
        playerState.pos.z + Math.sin(th) * r,
      )
      spawnSparks(impactPoint, 1, 2 + charge.a * 5, MAGENTA, {
        spread: 1, up: 0.3, life: 0.25, size: 0.055, gravity: 4,
      })
    }

    stepBolts(dt)
    updateEffects(dt)
  })

  function fire(g: ReturnType<typeof useGame.getState>) {
    const raw = computeShot(charge.v, charge.a)
    const power = g.drawCharge(raw.cost)

    charge.v = 0
    charge.a = 0
    charge.armed = false
    charge.cooldown = SHOT.cooldown

    if (power <= 0) {
      // Dry click: the cylinder is flat.
      charge.dryPulse = 0.25
      stats.dryFires++
      spawnSparks(playerState.muzzle, 3, 1.4, '#886644', { spread: 0.6, up: 0.3, life: 0.25, size: 0.04 })
      useGame.getState().pushLog('CYLINDER DEAD — PRESS R', 'warn')
      return
    }

    const spec = power < 0.999 ? scaleSpec(raw, power) : raw

    // Resolve aim against the crosshair, not the muzzle: cast from the camera
    // and point the bolt at whatever the reticle is actually over.
    const probe = spec.range + 24
    const hit = world.castRay(
      new rapier.Ray(
        { x: camState.pos.x, y: camState.pos.y, z: camState.pos.z },
        { x: camState.dir.x, y: camState.dir.y, z: camState.dir.z },
      ),
      probe, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC,
    )
    const dist = Math.max(hit ? hit.timeOfImpact : probe, 6)
    aimPoint.copy(camState.pos).addScaledVector(camState.dir, dist)

    const muzzle = playerState.muzzle.lengthSq() > 0.001 ? playerState.muzzle : playerState.pos
    boltDir.copy(aimPoint).sub(muzzle).normalize()
    spawnBolt(muzzle, boltDir, spec, power)

    boltColor(tmpColor, spec.hue)
    spawnFlash(muzzle, 0.5 + spec.amps * 0.07, WHITE_HOT, 0.09)
    spawnFlash(muzzle, 0.85 + spec.amps * 0.14, tmpColor, 0.16)
    spawnSparks(muzzle, 5, 3 + spec.volts * 0.01, tmpColor, {
      spread: 0.55, up: 0.25, life: 0.3, size: 0.05,
    })

    charge.firedPulse = 0.12
    camState.shake += 0.05 + spec.cost * 0.0035
    camState.fovKick += 2.5 + spec.cost * 0.06
  }

  function stepBolts(dt: number) {
    for (const b of bolts) {
      if (!b.alive) continue
      b.age += dt
      const step = b.spec.speed * dt
      b.prev.copy(b.pos)

      const hit = world.castRay(
        new rapier.Ray(
          { x: b.pos.x, y: b.pos.y, z: b.pos.z },
          { x: b.dir.x, y: b.dir.y, z: b.dir.z },
        ),
        step + SHOT.bulletRadius, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC,
      )

      if (hit) {
        impactPoint.copy(b.pos).addScaledVector(b.dir, Math.max(0, hit.timeOfImpact - 0.05))
        impact(impactPoint, b)
        b.alive = false
        stats.worldImpacts++
        continue
      }

      b.pos.addScaledVector(b.dir, step)
      b.traveled += step
      if (b.traveled >= b.spec.range) {
        // Out of push: the bolt simply runs out of volts and dies.
        boltColor(tmpColor, b.spec.hue)
        spawnSparks(b.pos, 3, 1.6, tmpColor, { spread: 1, up: 0.2, life: 0.3, size: 0.05, gravity: 5 })
        b.alive = false
        stats.boltsExpired++
      }
    }
  }

  return null
}

export { clearBolts }
