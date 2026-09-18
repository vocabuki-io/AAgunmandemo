import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, InstancedMesh,
  Object3D, SphereGeometry,
} from 'three'
import { bolts, type Bolt, type ShotKind } from '../game/shooting'
import { boltColor } from '../game/palette'

const dummy = new Object3D()
const col = new Color()
const tint = new Color()
const WHITE = new Color('#ffffff')

/** Girth and length of a bolt, in metres, before the spawn stretch. */
type Shape = { radius: number; length: number }

/**
 * Three shots, three silhouettes -- the whole point of the volt/ampere split
 * is that you can tell at a glance what you fired.
 *
 *   volt : a thin lance, longer the faster it flies
 *   amp  : a round ball, fatter the bigger its blast will be
 *   beam : the two together, and it looks like it cost a whole cell
 */
const SHAPE: Record<ShotKind, (b: Bolt) => Shape> = {
  volt: (b) => ({
    radius: 0.045 + b.spec.volts * 0.00012,
    length: Math.min(1.6 + b.spec.speed * 0.022, 7),
  }),
  amp: (b) => ({
    radius: 0.2 + b.spec.arcRadius * 0.055,
    length: 0,
  }),
  beam: (b) => ({
    radius: 0.1 + b.spec.amps * 0.022 + b.spec.volts * 0.00025,
    length: Math.min(2.4 + b.spec.speed * 0.02, 9),
  }),
}

function BoltLayer({ kind, geometry, oriented }: {
  kind: ShotKind
  geometry: BufferGeometry
  oriented: boolean
}) {
  const core = useRef<InstancedMesh>(null)
  const halo = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    core.current?.setColorAt(0, col.set('#000'))
    halo.current?.setColorAt(0, col.set('#000'))
  }, [])

  useFrame(() => {
    const c = core.current
    const h = halo.current
    if (!c || !h) return
    let n = 0

    for (const b of bolts) {
      if (!b.alive || b.spec.kind !== kind) continue
      const slot = n++
      const { radius, length } = SHAPE[kind](b)
      boltColor(tint, b.spec.hue)

      if (oriented) {
        // Grow to full length over the first metre, so a long bolt does not
        // pop into existence already stretched across the muzzle.
        const grow = Math.min(1, b.traveled / Math.max(length, 0.001) + 0.25)
        dummy.position.copy(b.pos).addScaledVector(b.dir, -length * 0.5 * grow)
        dummy.lookAt(b.pos.x + b.dir.x, b.pos.y + b.dir.y, b.pos.z + b.dir.z)
        dummy.scale.set(radius, radius, length * grow)
      } else {
        // The ball pulses, so a slow shot still reads as live.
        const pulse = 1 + Math.sin(b.age * 26) * 0.07
        dummy.position.copy(b.pos)
        dummy.rotation.set(b.age * 3.1, b.age * 2.3, 0)
        dummy.scale.setScalar(radius * pulse)
      }
      dummy.updateMatrix()
      c.setMatrixAt(slot, dummy.matrix)
      col.copy(WHITE).lerp(tint, 0.35).multiplyScalar(3.4)
      c.setColorAt(slot, col)

      if (oriented) {
        // The glow is capped in absolute metres rather than scaled with the
        // bolt: a beam is four times the lance's girth, and a halo that also
        // multiplied would be a wall of white across the screen you shot past.
        const glow = radius + Math.min(radius * 2.2, 0.3)
        dummy.scale.set(glow, glow, dummy.scale.z * 1.1)
      } else {
        dummy.scale.multiplyScalar(2.1)
      }
      dummy.updateMatrix()
      h.setMatrixAt(slot, dummy.matrix)
      col.copy(tint).multiplyScalar(0.62)
      h.setColorAt(slot, col)
    }

    for (let i = n; i < bolts.length; i++) {
      dummy.position.set(0, -9999, 0)
      dummy.scale.setScalar(0)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      c.setMatrixAt(i, dummy.matrix)
      h.setMatrixAt(i, dummy.matrix)
    }

    c.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    if (c.instanceColor) c.instanceColor.needsUpdate = true
    if (h.instanceColor) h.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={halo} args={[geometry, undefined, bolts.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={core} args={[geometry, undefined, bolts.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

export function Bolts() {
  // Cylinders run along +Y by default; point them down -Z so lookAt orients them.
  const lance = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 6, 1)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const beam = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 10, 1)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const ball = useMemo(() => new SphereGeometry(1, 12, 8), [])

  return (
    <group>
      <BoltLayer kind="volt" geometry={lance} oriented />
      <BoltLayer kind="beam" geometry={beam} oriented />
      <BoltLayer kind="amp" geometry={ball} oriented={false} />
    </group>
  )
}
