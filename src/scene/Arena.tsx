import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { BoxGeometry, CircleGeometry, CylinderGeometry } from 'three'
import { ARENA } from '../config'
import { mulberry32 } from '../game/rng'
import { setPillars } from '../game/arenaLayout'
import { StaticInstances, type Placement } from './StaticInstances'

type Pillar = { x: number; z: number; h: number; r: number; rot: number; lit: boolean }
type Wall = { x: number; z: number; rot: number; w: number; neon: boolean; cyan: boolean }

let cached: ReturnType<typeof build> | null = null

export function useArenaLayout() {
  if (!cached) cached = build()
  return cached
}

/** Built once at module scope so non-React systems (enemy steering) can read
 *  the same obstacle list the renderer uses. */
function build() {
  const rnd = mulberry32(0xa11ce)
  const R = ARENA.radius

  const pillars: Pillar[] = []
  for (const ring of ARENA.pillarRings) {
    const phase = rnd() * Math.PI * 2
    for (let i = 0; i < ring.count; i++) {
      const ang = phase + (i / ring.count) * Math.PI * 2 + (rnd() - 0.5) * 0.24
      const d = ring.dist + (rnd() - 0.5) * 4
      pillars.push({
        x: Math.cos(ang) * d,
        z: Math.sin(ang) * d,
        h: ring.h * (0.75 + rnd() * 0.5),
        r: ring.r * (0.8 + rnd() * 0.45),
        rot: rnd() * Math.PI,
        lit: rnd() < 0.34,
      })
    }
  }

  const segs = 28
  const walls: Wall[] = Array.from({ length: segs }, (_, i) => {
    const ang = (i / segs) * Math.PI * 2
    return {
      x: Math.cos(ang) * R,
      z: Math.sin(ang) * R,
      rot: -ang,
      w: ((Math.PI * 2 * R) / segs) * 0.62,
      neon: i % 3 === 1,
      cyan: i % 6 === 1,
    }
  })

  // Scattered plates: flat, non-colliding, purely ground texture.
  const debris = Array.from({ length: 170 }, () => {
    const ang = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * (R - 1)
    return {
      x: Math.cos(ang) * d,
      z: Math.sin(ang) * d,
      s: 0.3 + rnd() * 1.5,
      rot: rnd() * Math.PI,
      dark: rnd() < 0.5,
    }
  })

  setPillars(pillars.map((p) => ({ x: p.x, z: p.z, r: p.r })))
  return { pillars, walls, debris }
}

const UNIT_BOX = new BoxGeometry(1, 1, 1)
const UNIT_CYL6 = new CylinderGeometry(0.86, 1, 1, 6, 1)
const UNIT_DISC5 = (() => {
  const g = new CircleGeometry(1, 5)
  g.rotateX(-Math.PI / 2)
  return g
})()

export function Arena() {
  const { pillars, walls, debris } = useArenaLayout()
  const R = ARENA.radius

  const groups = useMemo(() => {
    const wallBodies: Placement[] = walls.map((s) => ({
      position: [s.x, ARENA.wallHeight / 2, s.z],
      rotation: [0, s.rot, 0],
      scale: [0.7, ARENA.wallHeight, s.w * 2],
    }))
    const wallNeon: Placement[] = walls.filter((s) => s.neon).map((s) => ({
      position: [
        s.x + Math.cos(s.rot) * -0.4,
        ARENA.wallHeight - 0.5,
        s.z - Math.sin(s.rot) * -0.4,
      ],
      rotation: [0, s.rot, 0],
      scale: [0.12, 0.22, s.w * 1.7],
    }))
    const pillarBodies: Placement[] = pillars.map((p) => ({
      position: [p.x, p.h / 2, p.z],
      rotation: [0, p.rot, 0],
      scale: [p.r, p.h, p.r],
    }))
    const pillarCaps: Placement[] = pillars.filter((p) => p.lit).map((p) => ({
      position: [p.x, p.h + 0.18, p.z],
      rotation: [0, p.rot, 0],
      scale: [p.r * 0.7, 0.3, p.r * 0.7],
    }))
    const debrisDark: Placement[] = debris.filter((d) => d.dark).map((d) => ({
      position: [d.x, 0.04, d.z], rotation: [0, d.rot, 0], scale: [d.s, 1, d.s],
    }))
    const debrisLight: Placement[] = debris.filter((d) => !d.dark).map((d) => ({
      position: [d.x, 0.045, d.z], rotation: [0, d.rot, 0], scale: [d.s, 1, d.s],
    }))
    return { wallBodies, wallNeon, pillarBodies, pillarCaps, debrisDark, debrisLight }
  }, [pillars, walls, debris])

  return (
    <group>
      {/* Every static collider in the arena lives on one fixed body. */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[R + 12, 1, R + 12]} position={[0, -1, 0]} />
        {walls.map((s, i) => (
          <CuboidCollider
            key={`wc${i}`}
            args={[0.5, ARENA.wallHeight / 2, s.w]}
            position={[s.x, ARENA.wallHeight / 2, s.z]}
            rotation={[0, s.rot, 0]}
          />
        ))}
        {pillars.map((p, i) => (
          <CylinderCollider key={`pc${i}`} args={[p.h / 2, p.r]} position={[p.x, p.h / 2, p.z]} />
        ))}
      </RigidBody>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R + 10, 64]} />
        <meshStandardMaterial color="#4b3c2a" roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[R * 0.72, 48]} />
        <meshStandardMaterial color="#5b472f" roughness={0.95} flatShading />
      </mesh>

      <StaticInstances geometry={UNIT_BOX} items={groups.wallBodies}>
        <meshStandardMaterial color="#3a332c" roughness={0.9} metalness={0.25} flatShading />
      </StaticInstances>
      <StaticInstances geometry={UNIT_BOX} items={groups.wallNeon} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#22e6ff" toneMapped={false} />
      </StaticInstances>

      <StaticInstances geometry={UNIT_CYL6} items={groups.pillarBodies}>
        <meshStandardMaterial color="#42392f" roughness={0.82} metalness={0.4} flatShading />
      </StaticInstances>
      <StaticInstances geometry={UNIT_CYL6} items={groups.pillarCaps} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#22e6ff" toneMapped={false} />
      </StaticInstances>

      <StaticInstances geometry={UNIT_DISC5} items={groups.debrisDark} castShadow={false}>
        <meshStandardMaterial color="#3d2f1f" roughness={1} flatShading />
      </StaticInstances>
      <StaticInstances geometry={UNIT_DISC5} items={groups.debrisLight} castShadow={false}>
        <meshStandardMaterial color="#6a5335" roughness={1} flatShading />
      </StaticInstances>
    </group>
  )
}
