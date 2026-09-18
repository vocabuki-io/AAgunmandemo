import { useMemo } from 'react'
import { BoxGeometry, CylinderGeometry } from 'three'
import { ARENA } from '../config'
import { mulberry32 } from '../game/rng'
import { CYAN, MAGENTA } from '../game/palette'
import { StaticInstances, type Placement } from './StaticInstances'

const UNIT_MESA = new CylinderGeometry(0.62, 0.8, 1, 5, 1)
const UNIT_BOX = new BoxGeometry(1, 1, 1)

/**
 * Everything outside the fence. Nothing here collides or updates -- it exists
 * to give the horizon depth and to stop the arena reading as a bowl floating
 * in a gradient.
 */
export function Backdrop() {
  const { signs, mesaItems, derrickLegs, derrickLamps } = useMemo(() => {
    const rnd = mulberry32(0x5eed)

    // Flat-topped buttes, well beyond the fog's reach.
    const mesas = Array.from({ length: 20 }, () => {
      const ang = rnd() * Math.PI * 2
      const d = 118 + rnd() * 130
      return {
        x: Math.cos(ang) * d,
        z: Math.sin(ang) * d,
        w: 30 + rnd() * 80,
        h: 9 + rnd() * 24,
        rot: rnd() * Math.PI,
        shade: 0.55 + rnd() * 0.45,
      }
    })

    // Pump-jack towers: four legs leaning into a point.
    const derricks = Array.from({ length: 9 }, () => {
      const ang = rnd() * Math.PI * 2
      const d = 88 + rnd() * 78
      return { x: Math.cos(ang) * d, z: Math.sin(ang) * d, h: 16 + rnd() * 18, rot: rnd() * Math.PI }
    })

    // Neon mounted on the inside of the fence.
    const signs = Array.from({ length: 7 }, (_, i) => {
      const ang = (i / 7) * Math.PI * 2 + 0.35
      return {
        ang,
        kind: i % 3,
        color: i % 2 === 0 ? CYAN : MAGENTA,
        y: 5.4 + rnd() * 1.6,
      }
    })

    const mesaItems: Placement[] = mesas.map((m) => ({
      position: [m.x, m.h / 2 - 2, m.z],
      rotation: [0, m.rot, 0],
      scale: [m.w, m.h, m.w],
    }))
    const derrickLegs: Placement[] = derricks.flatMap((d) =>
      ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) => ({
        position: [d.x + sx * d.h * 0.11, d.h / 2, d.z + sz * d.h * 0.11] as [number, number, number],
        rotation: [sz * 0.16, d.rot, -sx * 0.16] as [number, number, number],
        scale: [0.35, d.h, 0.35] as [number, number, number],
      })),
    )
    const derrickLamps: Placement[] = derricks.map((d) => ({
      position: [d.x, d.h + 0.4, d.z],
      scale: [0.7, 0.7, 0.7],
    }))

    return { signs, mesaItems, derrickLegs, derrickLamps }
  }, [])

  return (
    <group>
      <StaticInstances geometry={UNIT_MESA} items={mesaItems} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#1c1220" fog />
      </StaticInstances>
      <StaticInstances geometry={UNIT_BOX} items={derrickLegs} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#160f1a" fog />
      </StaticInstances>
      <StaticInstances geometry={UNIT_BOX} items={derrickLamps} castShadow={false} receiveShadow={false}>
        <meshBasicMaterial color="#ff3b2e" toneMapped={false} />
      </StaticInstances>

      {signs.map((s, i) => {
        const r = ARENA.radius - 1.2
        return (
          <group
            key={`s${i}`}
            position={[Math.cos(s.ang) * r, s.y, Math.sin(s.ang) * r]}
            rotation={[0, -s.ang + Math.PI / 2, 0]}
          >
            {/* backing board */}
            <mesh position={[0, 0, -0.16]}>
              <boxGeometry args={[3.4, 2.2, 0.16]} />
              <meshStandardMaterial color="#1b1620" roughness={0.9} flatShading />
            </mesh>
            <NeonGlyph kind={s.kind} color={s.color} />
          </group>
        )
      })}
    </group>
  )
}

/**
 * Sign art without fonts or textures: three abstract glyphs assembled from
 * boxes and a torus. A bolt, an arrow, and a cell with its terminal.
 */
function NeonGlyph({ kind, color }: { kind: number; color: string }) {
  const mat = <meshBasicMaterial color={color} toneMapped={false} />
  if (kind === 0) {
    // lightning
    return (
      <group>
        <mesh position={[0.28, 0.5, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.16, 1.1, 0.12]} />{mat}
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[0, 0, 1.15]}>
          <boxGeometry args={[0.16, 1.0, 0.12]} />{mat}
        </mesh>
        <mesh position={[-0.28, -0.5, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.16, 1.1, 0.12]} />{mat}
        </mesh>
      </group>
    )
  }
  if (kind === 1) {
    // arrow pointing down into the arena
    return (
      <group>
        <mesh><boxGeometry args={[0.16, 1.5, 0.12]} />{mat}</mesh>
        <mesh position={[-0.34, -0.55, 0]} rotation={[0, 0, 0.72]}>
          <boxGeometry args={[0.16, 0.9, 0.12]} />{mat}
        </mesh>
        <mesh position={[0.34, -0.55, 0]} rotation={[0, 0, -0.72]}>
          <boxGeometry args={[0.16, 0.9, 0.12]} />{mat}
        </mesh>
      </group>
    )
  }
  // a cell on its side, with the positive terminal
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh><torusGeometry args={[0.62, 0.075, 4, 16]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      <mesh position={[0, 0.78, 0]}><boxGeometry args={[0.3, 0.22, 0.12]} />{mat}</mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.12, 0.8, 0.12]} />{mat}</mesh>
    </group>
  )
}
