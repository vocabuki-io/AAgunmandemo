import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { BufferGeometry, InstancedMesh, Object3D } from 'three'

export type Placement = {
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const dummy = new Object3D()

/**
 * One draw call for a pile of identical static props.
 *
 * The arena is built from a few hundred boxes and cylinders that never move.
 * As individual meshes that is a few hundred draw calls before a single enemy
 * exists; as instances it is one each. Matrices are written once on mount.
 */
export function StaticInstances({
  geometry, items, children, castShadow = true, receiveShadow = true,
}: {
  geometry: BufferGeometry
  items: Placement[]
  children: ReactNode
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      dummy.position.set(...it.position)
      dummy.rotation.set(...(it.rotation ?? [0, 0, 0]))
      dummy.scale.set(...(it.scale ?? [1, 1, 1]))
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])

  if (items.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
    </instancedMesh>
  )
}
