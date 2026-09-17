import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, InstancedMesh, Object3D } from 'three'
import { flashes, rings, sparks } from '../game/effects'
import { makeGlowDisc, makeGlowRing } from './glow'

const dummy = new Object3D()
const col = new Color()

/**
 * All particles render as additive instanced meshes. Fade is encoded in the
 * INSTANCE COLOUR rather than alpha: under additive blending black is already
 * invisible, which sidesteps transparency sorting entirely.
 */
export function Effects() {
  const sparkRef = useRef<InstancedMesh>(null)
  const flashRef = useRef<InstancedMesh>(null)
  const ringRef = useRef<InstancedMesh>(null)
  const camera = useThree((s) => s.camera)

  const discGeo = useMemo(() => makeGlowDisc(20), [])
  const ringGeo = useMemo(() => makeGlowRing(44, 0.72), [])

  // Instanced colour buffers only exist once setColorAt has been called.
  useLayoutEffect(() => {
    for (const m of [sparkRef.current, flashRef.current, ringRef.current]) {
      if (m) m.setColorAt(0, col.set('#000000'))
    }
  }, [])

  useFrame(() => {
    const s = sparkRef.current
    if (s) {
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i]
        if (!p.alive) {
          dummy.position.set(0, -9999, 0)
          dummy.scale.setScalar(0)
        } else {
          const t = Math.max(0, p.life / p.maxLife)
          dummy.position.copy(p.pos)
          // Stretch along travel so fast sparks read as streaks.
          const sp = p.vel.length()
          dummy.scale.set(p.size * t, p.size * t, p.size * t * (1 + Math.min(sp * 0.06, 3)))
          dummy.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z)
          col.copy(p.color).multiplyScalar(t * t * 2.2)
          s.setColorAt(i, col)
        }
        dummy.updateMatrix()
        s.setMatrixAt(i, dummy.matrix)
      }
      s.instanceMatrix.needsUpdate = true
      if (s.instanceColor) s.instanceColor.needsUpdate = true
    }

    const f = flashRef.current
    if (f) {
      for (let i = 0; i < flashes.length; i++) {
        const p = flashes[i]
        if (!p.alive) {
          dummy.position.set(0, -9999, 0)
          dummy.scale.setScalar(0)
          dummy.rotation.set(0, 0, 0)
        } else {
          const t = Math.max(0, p.life / p.maxLife)
          dummy.position.copy(p.pos)
          dummy.quaternion.copy(camera.quaternion)
          dummy.scale.setScalar(p.size * (1.25 - t * 0.35))
          col.copy(p.color).multiplyScalar(t * 2.6)
          f.setColorAt(i, col)
        }
        dummy.updateMatrix()
        f.setMatrixAt(i, dummy.matrix)
      }
      f.instanceMatrix.needsUpdate = true
      if (f.instanceColor) f.instanceColor.needsUpdate = true
    }

    const r = ringRef.current
    if (r) {
      for (let i = 0; i < rings.length; i++) {
        const p = rings[i]
        if (!p.alive) {
          dummy.position.set(0, -9999, 0)
          dummy.scale.setScalar(0)
          dummy.rotation.set(0, 0, 0)
        } else {
          const t = Math.max(0, p.life / p.maxLife)
          dummy.position.copy(p.pos)
          if (p.flat) {
            dummy.rotation.set(-Math.PI / 2, 0, 0)
            dummy.position.y = Math.max(p.pos.y, 0.06)
          } else {
            dummy.quaternion.copy(camera.quaternion)
          }
          dummy.scale.setScalar(p.to * (1 - t * t))
          col.copy(p.color).multiplyScalar(t * 2.0)
          r.setColorAt(i, col)
        }
        dummy.updateMatrix()
        r.setMatrixAt(i, dummy.matrix)
      }
      r.instanceMatrix.needsUpdate = true
      if (r.instanceColor) r.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={sparkRef} args={[undefined, undefined, sparks.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={flashRef} args={[undefined, undefined, flashes.length]} frustumCulled={false}>
        <primitive object={discGeo} attach="geometry" />
        <meshBasicMaterial vertexColors toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={ringRef} args={[undefined, undefined, rings.length]} frustumCulled={false}>
        <primitive object={ringGeo} attach="geometry" />
        <meshBasicMaterial vertexColors toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
