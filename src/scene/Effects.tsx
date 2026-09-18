import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, InstancedMesh,
  LineSegments, Object3D,
} from 'three'
import { arcs, blasts, flashes, rings, sparks } from '../game/effects'
import { makeGlowDisc, makeGlowRing } from './glow'

const ARC_SEGS = 7
const ARC_VERTS = arcs.length * ARC_SEGS * 2

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
  const arcRef = useRef<LineSegments>(null)
  const blastRef = useRef<InstancedMesh>(null)
  const camera = useThree((s) => s.camera)

  const arcGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(ARC_VERTS * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(ARC_VERTS * 3), 3))
    return g
  }, [])

  const discGeo = useMemo(() => makeGlowDisc(20), [])
  const ringGeo = useMemo(() => makeGlowRing(44, 0.72), [])

  // Instanced colour buffers only exist once setColorAt has been called.
  useLayoutEffect(() => {
    for (const m of [sparkRef.current, flashRef.current, ringRef.current, blastRef.current]) {
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

    // Blast shells: expand fast, fade faster. Drawn as a low-poly sphere so the
    // facets read as a shockwave rather than a soap bubble.
    const bl = blastRef.current
    if (bl) {
      for (let i = 0; i < blasts.length; i++) {
        const p = blasts[i]
        if (!p.alive) {
          dummy.position.set(0, -9999, 0)
          dummy.scale.setScalar(0)
        } else {
          const t = Math.max(0, p.life / p.maxLife)
          const grow = 1 - t
          dummy.position.copy(p.pos)
          dummy.rotation.set(grow * 1.2, grow * 0.8, 0)
          dummy.scale.setScalar(p.radius * (0.25 + grow * 0.85))
          col.copy(p.color).multiplyScalar(t * t * 1.5)
          bl.setColorAt(i, col)
        }
        dummy.updateMatrix()
        bl.setMatrixAt(i, dummy.matrix)
      }
      bl.instanceMatrix.needsUpdate = true
      if (bl.instanceColor) bl.instanceColor.needsUpdate = true
    }

    // Chain lightning: a jagged polyline per arc, shape frozen by its seed so
    // it reads as one discharge fading rather than a flickering scribble.
    const a = arcRef.current
    if (a) {
      const pos = arcGeo.getAttribute('position') as BufferAttribute
      const colAttr = arcGeo.getAttribute('color') as BufferAttribute
      const P = pos.array as Float32Array
      const C = colAttr.array as Float32Array
      let k = 0
      for (const arc of arcs) {
        if (!arc.alive) {
          for (let i = 0; i < ARC_SEGS * 2; i++) {
            P[k * 3] = 0; P[k * 3 + 1] = -9999; P[k * 3 + 2] = 0
            C[k * 3] = 0; C[k * 3 + 1] = 0; C[k * 3 + 2] = 0
            k++
          }
          continue
        }
        const t = Math.max(0, arc.life / arc.maxLife)
        const amp = arc.from.distanceTo(arc.to) * 0.1
        let px = arc.from.x, py = arc.from.y, pz = arc.from.z
        for (let s2 = 0; s2 < ARC_SEGS; s2++) {
          const u = (s2 + 1) / ARC_SEGS
          const wob = s2 === ARC_SEGS - 1 ? 0 : amp
          const h = Math.sin(arc.seed + s2 * 12.9898) * 43758.5453
          const h2 = Math.sin(arc.seed + s2 * 78.233) * 12345.678
          const nx = arc.from.x + (arc.to.x - arc.from.x) * u + ((h % 1) - 0.5) * wob * 2
          const ny = arc.from.y + (arc.to.y - arc.from.y) * u + ((h2 % 1) - 0.5) * wob * 2
          const nz = arc.from.z + (arc.to.z - arc.from.z) * u + (((h * h2) % 1) - 0.5) * wob * 2
          P[k * 3] = px; P[k * 3 + 1] = py; P[k * 3 + 2] = pz
          C[k * 3] = arc.color.r * t * 2.4; C[k * 3 + 1] = arc.color.g * t * 2.4; C[k * 3 + 2] = arc.color.b * t * 2.4
          k++
          P[k * 3] = nx; P[k * 3 + 1] = ny; P[k * 3 + 2] = nz
          C[k * 3] = arc.color.r * t * 2.4; C[k * 3 + 1] = arc.color.g * t * 2.4; C[k * 3 + 2] = arc.color.b * t * 2.4
          k++
          px = nx; py = ny; pz = nz
        }
      }
      pos.needsUpdate = true
      colAttr.needsUpdate = true
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

      <instancedMesh ref={blastRef} args={[undefined, undefined, blasts.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} wireframe />
      </instancedMesh>

      <lineSegments ref={arcRef} frustumCulled={false}>
        <primitive object={arcGeo} attach="geometry" />
        <lineBasicMaterial vertexColors toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
