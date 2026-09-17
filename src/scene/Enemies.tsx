import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  InstancedMesh, Object3D, OctahedronGeometry,
} from 'three'
import { ENEMIES, type EnemyKind } from '../config'
import { enemies } from '../game/enemies'

const dummy = new Object3D()
const col = new Color()
const WHITE = new Color('#ffffff')

const KINDS: EnemyKind[] = ['armored', 'swarm', 'runner']

/** Where the glowing core sits, as a fraction of body height. */
const CORE_Y: Record<EnemyKind, number> = { armored: 0.62, swarm: 0.5, runner: 0.74 }

/** A wide visor slit for armour, a point for the dart, a heart for the shard. */
const CORE_SCALE: Record<EnemyKind, [number, number, number]> = {
  armored: [0.62, 0.13, 0.22],
  swarm: [0.2, 0.2, 0.2],
  runner: [0.1, 0.3, 0.1],
}

/** Silhouettes are the tell: a drum, a shard, a dart. */
function bodyGeometry(kind: EnemyKind): BufferGeometry {
  switch (kind) {
    case 'armored': {
      // Squat hexagonal boiler -- reads heavy and slow at any distance.
      const g = new CylinderGeometry(0.72, 1.0, 1, 6, 1)
      g.rotateY(Math.PI / 6)
      g.translate(0, 0.5, 0)
      return g
    }
    case 'swarm': {
      const g = new OctahedronGeometry(0.55, 0)
      g.scale(1, 0.85, 1)
      g.translate(0, 0.5, 0)
      return g
    }
    default: {
      // Four-sided dart, point down: all forward lean, no mass.
      const g = new ConeGeometry(0.42, 1, 4, 1)
      g.translate(0, 0.5, 0)
      return g
    }
  }
}

function KindLayer({ kind }: { kind: EnemyKind }) {
  const body = useRef<InstancedMesh>(null)
  const core = useRef<InstancedMesh>(null)
  const cfg = ENEMIES[kind]

  const geo = useMemo(() => bodyGeometry(kind), [kind])
  const coreGeo = useMemo(() => new OctahedronGeometry(1, 0), [])
  const base = useMemo(() => new Color(cfg.color), [cfg.color])
  const accent = useMemo(() => new Color(cfg.accent), [cfg.accent])

  useLayoutEffect(() => {
    body.current?.setColorAt(0, col.set('#000'))
    core.current?.setColorAt(0, col.set('#000'))
  }, [])

  useFrame(() => {
    const b = body.current
    const c = core.current
    if (!b || !c) return
    let n = 0

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]
      if (!e.alive || e.kind !== kind) continue
      const slot = n++
      if (slot >= enemies.length) break

      const em = e.emerge
      const bob = Math.sin(e.phase * (kind === 'swarm' ? 11 : 6)) * (kind === 'armored' ? 0.03 : 0.08)
      const h = cfg.height * em

      dummy.position.set(e.pos.x, e.pos.y + bob * em - (1 - em) * cfg.height * 0.6, e.pos.z)
      dummy.rotation.set(0, e.yaw + (kind === 'swarm' ? e.phase * 2.2 : 0), 0)
      // Stunned bodies sag; a lit-up enemy is visibly out of the fight.
      const sag = e.stun > 0 ? 0.82 : 1
      dummy.scale.set(cfg.radius * 1.05, h * sag, cfg.radius * 1.05)
      dummy.updateMatrix()
      b.setMatrixAt(slot, dummy.matrix)
      col.copy(base).lerp(WHITE, e.hitFlash * 0.85)
      b.setColorAt(slot, col)

      // Glowing core, pulsing faster as the thing gets closer to death. It
      // sits ON the front face rather than inside the body -- buried in an
      // opaque mesh it was invisible, which is most of what told the three
      // kinds apart.
      const hpLeft = Math.max(0, e.hp / e.maxHp)
      const pulse = 0.75 + Math.sin(e.phase * (5 + (1 - hpLeft) * 14)) * 0.25
      const fx = Math.sin(e.yaw)
      const fz = Math.cos(e.yaw)
      const reach = cfg.radius * 0.82
      dummy.position.set(
        e.pos.x + fx * reach,
        e.pos.y + cfg.height * CORE_Y[kind] * em + bob,
        e.pos.z + fz * reach,
      )
      dummy.rotation.set(kind === 'swarm' ? e.phase * 0.9 : 0, e.yaw, 0)
      const g = e.stun > 0 ? 1.45 : 1
      dummy.scale.set(
        CORE_SCALE[kind][0] * em * g,
        CORE_SCALE[kind][1] * em * g,
        CORE_SCALE[kind][2] * em * g,
      )
      dummy.updateMatrix()
      c.setMatrixAt(slot, dummy.matrix)
      col.copy(e.stun > 0 ? WHITE : accent).multiplyScalar(pulse * (1.7 + e.hitFlash * 3))
      c.setColorAt(slot, col)
    }

    for (let i = n; i < enemies.length; i++) {
      dummy.position.set(0, -9999, 0)
      dummy.scale.setScalar(0)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      b.setMatrixAt(i, dummy.matrix)
      c.setMatrixAt(i, dummy.matrix)
    }

    b.count = enemies.length
    c.count = enemies.length
    b.instanceMatrix.needsUpdate = true
    c.instanceMatrix.needsUpdate = true
    if (b.instanceColor) b.instanceColor.needsUpdate = true
    if (c.instanceColor) c.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh
        ref={body} args={[geo, undefined, enemies.length]}
        frustumCulled={false} castShadow receiveShadow
      >
        <meshStandardMaterial flatShading roughness={0.75} metalness={0.35} />
      </instancedMesh>
      <instancedMesh ref={core} args={[coreGeo, undefined, enemies.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

export function Enemies() {
  return (
    <group>
      {KINDS.map((k) => <KindLayer key={k} kind={k} />)}
    </group>
  )
}
