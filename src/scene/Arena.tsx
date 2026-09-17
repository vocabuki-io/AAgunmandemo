import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { ARENA } from '../config'
import { mulberry32 } from '../game/rng'

type Pillar = { x: number; z: number; h: number; r: number; rot: number; lit: boolean }

export function useArenaLayout() {
  return useMemo(() => {
    const rnd = mulberry32(0xa11ce)
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
    // Scattered debris: flat, non-colliding, purely for ground texture.
    const debris = Array.from({ length: 150 }, () => {
      const ang = rnd() * Math.PI * 2
      const d = Math.sqrt(rnd()) * (ARENA.radius - 1)
      return {
        x: Math.cos(ang) * d,
        z: Math.sin(ang) * d,
        s: 0.3 + rnd() * 1.5,
        rot: rnd() * Math.PI,
        dark: rnd() < 0.5,
      }
    })
    return { pillars, debris }
  }, [])
}

export function Arena() {
  const { pillars, debris } = useArenaLayout()
  const R = ARENA.radius

  const wallSegments = useMemo(() => {
    const segs = 28
    return Array.from({ length: segs }, (_, i) => {
      const ang = (i / segs) * Math.PI * 2
      return {
        x: Math.cos(ang) * R,
        z: Math.sin(ang) * R,
        rot: -ang,
        w: (Math.PI * 2 * R) / segs * 0.62,
      }
    })
  }, [R])

  return (
    <group>
      {/* Ground: one big disc with a flat box collider under it. */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[R + 12, 1, R + 12]} position={[0, -1, 0]} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[R + 10, 64]} />
          <meshStandardMaterial color="#63503a" roughness={0.98} metalness={0.02} />
        </mesh>
        {/* Slightly raised inner plate reads as the packed-dirt arena floor. */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[R * 0.72, 48]} />
          <meshStandardMaterial color="#755c3d" roughness={0.95} flatShading />
        </mesh>
      </RigidBody>

      {/* Boundary: rusted corrugated fence panels. */}
      {wallSegments.map((s, i) => (
        <RigidBody key={`w${i}`} type="fixed" colliders={false} position={[s.x, ARENA.wallHeight / 2, s.z]} rotation={[0, s.rot, 0]}>
          <CuboidCollider args={[0.5, ARENA.wallHeight / 2, s.w]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.7, ARENA.wallHeight, s.w * 2]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#413a33' : '#4e4239'} roughness={0.9} metalness={0.25} flatShading />
          </mesh>
          {/* Neon strip along the top of every third panel. */}
          {i % 3 === 1 && (
            <mesh position={[-0.4, ARENA.wallHeight / 2 - 0.5, 0]}>
              <boxGeometry args={[0.12, 0.22, s.w * 1.7]} />
              <meshBasicMaterial color={i % 6 === 1 ? '#22e6ff' : '#ff2f9e'} toneMapped={false} />
            </mesh>
          )}
        </RigidBody>
      ))}

      {/* Cover: steel girders / oil drums. */}
      {pillars.map((p, i) => (
        <RigidBody key={`p${i}`} type="fixed" colliders={false} position={[p.x, p.h / 2, p.z]} rotation={[0, p.rot, 0]}>
          <CylinderCollider args={[p.h / 2, p.r]} />
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[p.r * 0.86, p.r, p.h, 6, 1]} />
            <meshStandardMaterial color="#4c4239" roughness={0.82} metalness={0.4} flatShading />
          </mesh>
          {p.lit && (
            <mesh position={[0, p.h / 2 + 0.18, 0]}>
              <cylinderGeometry args={[p.r * 0.7, p.r * 0.7, 0.3, 6, 1]} />
              <meshBasicMaterial color="#22e6ff" toneMapped={false} />
            </mesh>
          )}
        </RigidBody>
      ))}

      {debris.map((d, i) => (
        <mesh key={`d${i}`} position={[d.x, 0.04, d.z]} rotation={[-Math.PI / 2, 0, d.rot]} receiveShadow>
          <circleGeometry args={[d.s, 5]} />
          <meshStandardMaterial color={d.dark ? '#4a3a27' : '#7a6140'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}
