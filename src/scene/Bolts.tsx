import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, CylinderGeometry, InstancedMesh, Object3D } from 'three'
import { bolts } from '../game/shooting'
import { boltColor } from '../game/palette'

const dummy = new Object3D()
const col = new Color()
const WHITE = new Color('#ffffff')

/**
 * Bolts draw as a stretched capsule: length from velocity, girth from amperes,
 * colour from the volt/ampere mix. A bright core inside a wide dim halo reads
 * as "hot" long before Bloom is added.
 */
export function Bolts() {
  const core = useRef<InstancedMesh>(null)
  const halo = useRef<InstancedMesh>(null)

  // Cylinder runs along +Y by default; point it down -Z so lookAt orients it.
  const geo = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 6, 1)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useLayoutEffect(() => {
    core.current?.setColorAt(0, col.set('#000'))
    halo.current?.setColorAt(0, col.set('#000'))
  }, [])

  useFrame(() => {
    const c = core.current
    const h = halo.current
    if (!c || !h) return

    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i]
      if (!b.alive) {
        dummy.position.set(0, -9999, 0)
        dummy.scale.setScalar(0)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        c.setMatrixAt(i, dummy.matrix)
        h.setMatrixAt(i, dummy.matrix)
        continue
      }

      const s = b.spec
      const len = Math.min(0.8 + s.speed * 0.016, 4.2)
      const rad = 0.05 + s.amps * 0.017
      // Spawn stretch: the bolt grows to full length over its first metre so
      // it does not pop into existence at four metres long.
      const grow = Math.min(1, b.traveled / len + 0.25)

      dummy.position.copy(b.pos).addScaledVector(b.dir, -len * 0.5 * grow)
      dummy.lookAt(b.pos.x + b.dir.x, b.pos.y + b.dir.y, b.pos.z + b.dir.z)

      dummy.scale.set(rad, rad, len * grow)
      dummy.updateMatrix()
      c.setMatrixAt(i, dummy.matrix)
      col.copy(WHITE).lerp(boltColor(new Color(), s.hue), 0.35).multiplyScalar(3.4)
      c.setColorAt(i, col)

      dummy.scale.set(rad * 3.4, rad * 3.4, len * grow * 1.12)
      dummy.updateMatrix()
      h.setMatrixAt(i, dummy.matrix)
      boltColor(col, s.hue).multiplyScalar(0.62)
      h.setColorAt(i, col)
    }

    c.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    if (c.instanceColor) c.instanceColor.needsUpdate = true
    if (h.instanceColor) h.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={halo} args={[geo, undefined, bolts.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={core} args={[geo, undefined, bolts.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
