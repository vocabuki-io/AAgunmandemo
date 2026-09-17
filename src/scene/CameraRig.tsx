import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA } from '../config'
import { consumeLook, look, pointer } from '../input'
import { camState, charge, clampDt, damp, playerState } from '../game/runtime'
import { useGame } from '../store'

const target = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const wanted = new Vector3()
const lookAt = new Vector3()

/**
 * Over-the-shoulder chase camera. The FOV is the volt gauge: it is the only
 * readout the volt knob gets, by design -- no bar on screen.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const { world, rapier } = useRapier()
  const dist = useRef(CAMERA.offset[2])

  useFrame((_, rawDt) => {
    const dt = clampDt(rawDt)
    if (pointer.locked) consumeLook()

    const z = charge.vSmooth
    target.copy(playerState.pos)
    target.y += CAMERA.eyeY

    const cp = Math.cos(look.pitch)
    forward.set(-Math.sin(look.yaw) * cp, Math.sin(look.pitch), -Math.cos(look.yaw) * cp).normalize()
    right.set(Math.cos(look.yaw), 0, -Math.sin(look.yaw)).normalize()

    const ox = CAMERA.offset[0] + (CAMERA.zoomOffset[0] - CAMERA.offset[0]) * z
    const oy = CAMERA.offset[1] + (CAMERA.zoomOffset[1] - CAMERA.offset[1]) * z
    const oz = CAMERA.offset[2] + (CAMERA.zoomOffset[2] - CAMERA.offset[2]) * z

    // Desired boom direction from the head, then shorten it if a wall is in
    // the way so the camera never ends up inside a girder.
    wanted.copy(right).multiplyScalar(ox).addScaledVector(forward, -oz)
    wanted.y += oy
    const boomLen = wanted.length()
    let allowed = boomLen
    if (boomLen > 0.05) {
      const dir = wanted.clone().multiplyScalar(1 / boomLen)
      // EXCLUDE_DYNAMIC: the arena is all fixed bodies and the player is the
      // only dynamic one, so this is exactly "ignore myself".
      const hit = world.castRay(
        new rapier.Ray({ x: target.x, y: target.y, z: target.z }, { x: dir.x, y: dir.y, z: dir.z }),
        boomLen + 0.4, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC,
      )
      if (hit) allowed = Math.max(0.7, hit.timeOfImpact - 0.35)
    }
    dist.current = damp(dist.current, allowed, allowed < dist.current ? 40 : 9, dt)
    wanted.multiplyScalar(dist.current / Math.max(boomLen, 1e-4))

    camera.position.x = damp(camera.position.x, target.x + wanted.x, CAMERA.lerp, dt)
    camera.position.y = damp(camera.position.y, target.y + wanted.y, CAMERA.lerp, dt)
    camera.position.z = damp(camera.position.z, target.z + wanted.z, CAMERA.lerp, dt)

    // Shake: decays fast, offsets after the smoothing so it never fights it.
    camState.shake = damp(camState.shake, 0, 9, dt)
    if (camState.shake > 0.001) {
      const s = camState.shake
      camera.position.x += (Math.random() - 0.5) * s
      camera.position.y += (Math.random() - 0.5) * s
      camera.position.z += (Math.random() - 0.5) * s
    }

    lookAt.copy(target).addScaledVector(forward, 24)
    camera.lookAt(lookAt)

    camState.fovKick = damp(camState.fovKick, 0, 10, dt)
    const fov = CAMERA.baseFov + (CAMERA.zoomFov - CAMERA.baseFov) * z + camState.fovKick
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    camState.pos.copy(camera.position)
    camera.getWorldDirection(camState.dir)

    // The aim ray starts at the camera and is what every shot resolves against.
    playerState.aim.copy(camState.dir)

    if (useGame.getState().phase !== 'playing') return
  })

  return null
}
