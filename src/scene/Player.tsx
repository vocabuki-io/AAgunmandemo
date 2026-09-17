import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Group } from 'three'
import { PLAYER } from '../config'
import { keys, look } from '../input'
import { charge, playerState } from '../game/runtime'
import { useGame } from '../store'
import { Gunman } from './Gunman'

export function Player() {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const { world, rapier } = useRapier()

  useFrame((_, rawDt) => {
    const rb = body.current
    if (!rb) return
    const dt = Math.min(rawDt, 1 / 30)
    const phase = useGame.getState().phase
    const t = rb.translation()
    playerState.pos.set(t.x, t.y, t.z)

    const lv = rb.linvel()
    playerState.vel.set(lv.x, lv.y, lv.z)

    if (phase !== 'playing') {
      rb.setLinvel({ x: 0, y: lv.y, z: 0 }, true)
      return
    }

    // --- grounded test -------------------------------------------------
    const ray = new rapier.Ray(
      { x: t.x, y: t.y, z: t.z },
      { x: 0, y: -1, z: 0 },
    )
    const reach = PLAYER.halfHeight + PLAYER.radius + 0.22
    const hit = world.castRay(ray, reach, true, undefined, undefined, undefined, rb)
    playerState.grounded = !!hit

    // --- wish direction, relative to where the camera looks ------------
    let ix = 0
    let iz = 0
    if (keys.has('KeyW')) iz -= 1
    if (keys.has('KeyS')) iz += 1
    if (keys.has('KeyA')) ix -= 1
    if (keys.has('KeyD')) ix += 1
    const len = Math.hypot(ix, iz)
    const sy = Math.sin(look.yaw)
    const cy = Math.cos(look.yaw)

    // Standing still while charging is part of the cost of a big shot.
    const charging = charge.vHeld || charge.aHeld
    const speed = PLAYER.moveSpeed * (charging ? PLAYER.chargeSpeedMul : 1)

    let wx = 0
    let wz = 0
    if (len > 0) {
      const nx = ix / len
      const nz = iz / len
      // forward = (-sin yaw, 0, -cos yaw); right = (cos yaw, 0, -sin yaw)
      wx = (nx * cy + nz * -sy) * speed
      wz = (nx * -sy + nz * -cy) * speed
    }

    const control = playerState.grounded ? 1 : PLAYER.airControl
    const rate = PLAYER.accel * control * dt
    const nvx = lv.x + Math.max(-rate, Math.min(rate, wx - lv.x))
    const nvz = lv.z + Math.max(-rate, Math.min(rate, wz - lv.z))
    let nvy = lv.y

    if (keys.has('Space') && playerState.grounded && lv.y < 1.5) nvy = PLAYER.jumpSpeed

    rb.setLinvel({ x: nvx, y: nvy, z: nvz }, true)

    if (visual.current) visual.current.rotation.y = look.yaw
  })

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={PLAYER.spawn}
      enabledRotations={[false, false, false]}
      linearDamping={0.15}
      friction={0.1}
      mass={1.2}
      ccd
      name="player"
    >
      <CapsuleCollider args={[PLAYER.halfHeight, PLAYER.radius]} />
      <group ref={visual} position={[0, -PLAYER.halfHeight - PLAYER.radius, 0]}>
        <Gunman />
      </group>
    </RigidBody>
  )
}
