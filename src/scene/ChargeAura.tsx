import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, Mesh, MeshBasicMaterial, PointLight,
} from 'three'
import { charge, clampDt, playerState } from '../game/runtime'
import { makeGlowDisc } from './glow'

const ARCS = 7
const SEGS = 6
const VERTS = ARCS * SEGS * 2

/**
 * The ampere gauge. There is no bar on the HUD by design: how violently the
 * player crackles IS the readout. Volts get the FOV zoom instead.
 */
export function ChargeAura() {
  const lines = useRef<LineSegments>(null)
  const disc = useRef<Mesh>(null)
  const muzzleGlow = useRef<Mesh>(null)
  const muzzleLight = useRef<PointLight>(null)
  const timer = useRef(0)

  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(VERTS * 3), 3))
    return g
  }, [])
  const discGeo = useMemo(() => makeGlowDisc(24), [])

  useFrame((_, rawDt) => {
    const dt = clampDt(rawDt)
    const a = charge.aSmooth
    const v = charge.vSmooth

    const l = lines.current
    if (l) {
      l.visible = a > 0.02
      const mat = l.material as MeshBasicMaterial
      mat.opacity = Math.min(1, a * 1.5)
      if (l.visible) {
        timer.current -= dt
        // Re-jitter in bursts, not every frame: continuous noise reads as fog,
        // whereas held-then-snapped shapes read as electricity.
        if (timer.current <= 0) {
          timer.current = 0.035
          const arr = geo.getAttribute('position') as BufferAttribute
          const p = arr.array as Float32Array
          let k = 0
          const reach = 0.55 + a * 1.05
          for (let i = 0; i < ARCS; i++) {
            const th = Math.random() * Math.PI * 2
            const baseY = -0.75 + Math.random() * 1.7
            let px = Math.cos(th) * 0.3
            let py = baseY
            let pz = Math.sin(th) * 0.3
            for (let s = 0; s < SEGS; s++) {
              const t = (s + 1) / SEGS
              const nx = Math.cos(th) * reach * t + (Math.random() - 0.5) * 0.5
              const ny = baseY + (Math.random() - 0.5) * 0.7 * t
              const nz = Math.sin(th) * reach * t + (Math.random() - 0.5) * 0.5
              p[k++] = px; p[k++] = py; p[k++] = pz
              p[k++] = nx; p[k++] = ny; p[k++] = nz
              px = nx; py = ny; pz = nz
            }
          }
          arr.needsUpdate = true
        }
      }
      l.position.copy(playerState.pos)
    }

    const d = disc.current
    if (d) {
      d.visible = a > 0.02
      d.position.set(playerState.pos.x, 0.07, playerState.pos.z)
      d.scale.setScalar(1.0 + a * 1.9)
      const m = d.material as MeshBasicMaterial
      m.color.setRGB(a * 0.5, a * 0.07, a * 0.3)
    }

    const g = muzzleGlow.current
    if (g) {
      const on = v > 0.02 || charge.firedPulse > 0
      g.visible = on
      if (on) {
        g.position.copy(playerState.muzzle)
        const k = v + charge.firedPulse * 3
        g.scale.setScalar(0.12 + k * 0.5)
        const m = g.material as MeshBasicMaterial
        m.color.setRGB(k * 0.35, k * 1.1, k * 1.35)
      }
    }

    // One real light at the muzzle, kept mounted at zero intensity so the
    // light count never changes and materials never recompile mid-fight.
    const ml = muzzleLight.current
    if (ml) {
      ml.position.copy(playerState.muzzle)
      const k = charge.firedPulse * 9 + v * 0.9 + a * 0.6
      ml.intensity = k * 26
      ml.color.setRGB(0.35 + a * 0.65, 0.85 - a * 0.35, 1.0 - a * 0.45)
    }
  })

  return (
    <group>
      <lineSegments ref={lines} frustumCulled={false}>
        <primitive object={geo} attach="geometry" />
        <lineBasicMaterial
          color="#ff4fb0" transparent opacity={0}
          blending={AdditiveBlending} depthWrite={false} toneMapped={false}
        />
      </lineSegments>

      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <primitive object={discGeo} attach="geometry" />
        <meshBasicMaterial vertexColors toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      <pointLight ref={muzzleLight} intensity={0} distance={26} decay={2} />

      <mesh ref={muzzleGlow} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}
