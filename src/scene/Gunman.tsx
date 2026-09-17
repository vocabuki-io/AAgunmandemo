import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Object3D } from 'three'
import { look } from '../input'
import { charge, clampDt, damp, playerState } from '../game/runtime'

const SAND = '#8a7043'
const DARK = '#332921'
const LEATHER = '#5c432a'
const STEEL = '#343a45'

/**
 * Low-poly gunman, seen almost entirely from behind: the silhouette does the
 * work. Wide hat brim + poncho cone = western, read in one frame.
 */
export function Gunman() {
  const arm = useRef<Group>(null)
  const muzzle = useRef<Object3D>(null)
  const legs = useRef<Group>(null)
  const walkT = useRef(0)
  const recoil = useRef(0)

  useFrame((_, rawDt) => {
    const dt = clampDt(rawDt)

    if (charge.firedPulse > 0) recoil.current = 1
    recoil.current = damp(recoil.current, 0, 11, dt)

    if (arm.current) {
      arm.current.rotation.x = look.pitch + recoil.current * 0.55
      arm.current.position.z = 0.02 + recoil.current * 0.16
    }
    if (muzzle.current) muzzle.current.getWorldPosition(playerState.muzzle)

    // Legs swing with planar speed; frozen mid-air.
    const sp = Math.hypot(playerState.vel.x, playerState.vel.z)
    if (legs.current) {
      walkT.current += dt * sp * 1.5
      const s = playerState.grounded ? Math.min(sp / 8, 1) : 0
      const a = Math.sin(walkT.current) * 0.55 * s
      const l = legs.current.children
      if (l[0]) l[0].rotation.x = a
      if (l[1]) l[1].rotation.x = -a
    }
  })

  return (
    <group>
      <group ref={legs}>
        {[-0.16, 0.16].map((x, i) => (
          <group key={i} position={[x, 0.78, 0]}>
            <mesh castShadow position={[0, -0.39, 0]}>
              <boxGeometry args={[0.19, 0.78, 0.2]} />
              <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, -0.76, 0.05]}>
              <boxGeometry args={[0.22, 0.1, 0.32]} />
              <meshStandardMaterial color={LEATHER} flatShading roughness={0.85} />
            </mesh>
          </group>
        ))}
      </group>

      {/* torso */}
      <mesh castShadow position={[0, 1.08, 0]}>
        <boxGeometry args={[0.52, 0.62, 0.34]} />
        <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
      </mesh>

      {/* poncho */}
      <mesh castShadow position={[0, 1.02, 0]}>
        <coneGeometry args={[0.56, 0.86, 6, 1, true]} />
        <meshStandardMaterial color={SAND} flatShading roughness={0.95} side={2} />
      </mesh>
      {/* poncho trim -- the one bit of neon on the player */}
      <mesh position={[0, 0.62, 0]}>
        <torusGeometry args={[0.5, 0.022, 4, 6]} />
        <meshBasicMaterial color="#22e6ff" toneMapped={false} />
      </mesh>

      {/* head + hat */}
      <mesh castShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[0.26, 0.28, 0.26]} />
        <meshStandardMaterial color="#8a7355" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 1.63, 0]}>
        <cylinderGeometry args={[0.46, 0.5, 0.05, 8]} />
        <meshStandardMaterial color={LEATHER} flatShading roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 1.74, 0]}>
        <cylinderGeometry args={[0.2, 0.23, 0.22, 8]} />
        <meshStandardMaterial color={LEATHER} flatShading roughness={0.95} />
      </mesh>

      {/* left arm, tucked */}
      <mesh castShadow position={[-0.34, 1.12, 0]} rotation={[0.25, 0, -0.12]}>
        <boxGeometry args={[0.15, 0.5, 0.16]} />
        <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
      </mesh>

      {/* right arm + revolver, pitched with the aim */}
      <group ref={arm} position={[0.34, 1.24, 0.02]}>
        <mesh castShadow position={[0, -0.06, -0.3]}>
          <boxGeometry args={[0.16, 0.16, 0.56]} />
          <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
        </mesh>
        {/* frame */}
        <mesh castShadow position={[0, -0.04, -0.66]}>
          <boxGeometry args={[0.1, 0.16, 0.26]} />
          <meshStandardMaterial color={STEEL} flatShading roughness={0.45} metalness={0.8} />
        </mesh>
        {/* barrel */}
        <mesh castShadow position={[0, -0.02, -0.92]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.05, 0.42, 6]} />
          <meshStandardMaterial color={STEEL} flatShading roughness={0.4} metalness={0.85} />
        </mesh>
        {/* cylinder: six AA cells, canted out so the copper caps catch light */}
        <group position={[0, -0.04, -0.66]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.2, 6]} />
            <meshStandardMaterial color="#2a2f38" flatShading roughness={0.4} metalness={0.8} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const ang = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(ang) * 0.085, 0, Math.sin(ang) * 0.085]}>
                <cylinderGeometry args={[0.03, 0.03, 0.215, 6]} />
                <meshStandardMaterial color="#1f6f7a" emissive="#22e6ff" emissiveIntensity={0.7} flatShading />
              </mesh>
            )
          })}
        </group>
        {/* grip */}
        <mesh castShadow position={[0, -0.18, -0.58]} rotation={[0.45, 0, 0]}>
          <boxGeometry args={[0.08, 0.24, 0.1]} />
          <meshStandardMaterial color={LEATHER} flatShading roughness={0.9} />
        </mesh>
        <object3D ref={muzzle} position={[0, -0.02, -1.16]} />
      </group>
    </group>
  )
}
