import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { ACESFilmicToneMapping } from 'three'
import { CAMERA, GRAVITY } from './config'
import { Arena } from './scene/Arena'
import { Backdrop } from './scene/Backdrop'
import { Bolts } from './scene/Bolts'
import { ChargeAura } from './scene/ChargeAura'
import { Effects } from './scene/Effects'
import { Enemies } from './scene/Enemies'
import { GameSystems } from './scene/GameSystems'
import { Crosshair } from './ui/Crosshair'
import { Hud } from './ui/Hud'
import { CameraRig } from './scene/CameraRig'
import { Lighting } from './scene/Lighting'
import { Player } from './scene/Player'
import { Post } from './scene/Post'
import { SkyDome } from './scene/Sky'
import { Result } from './ui/Result'
import { Title } from './ui/Title'
import { useGame } from './store'
import { attachInput, look, pointer, requestLock } from './input'
import { camState, charge, debug, playerState, stats } from './game/runtime'
import { bolts } from './game/shooting'
import { clearEnemies, enemies, spawnEnemy } from './game/enemies'
import { analyseEconomy } from './game/economy'
import { director } from './game/director'
import { ENEMIES } from './config'
import type { EnemyKind } from './config'

/**
 * Debug probe, used by scripts/verify.mjs and by hand in the console.
 *
 * `debugSpawnAhead` exists because Chrome's pointer lock makes it impossible
 * to aim the camera from CDP-synthesised mouse input -- every move is reported
 * along with its own cancelling warp. Without it, verify can prove enemies
 * exist and die but can never get one into frame to prove they are drawn at
 * all. It goes through the ordinary spawn path; nothing here is a shortcut
 * around game logic.
 */
;(window as unknown as Record<string, unknown>).__aa = {
  camState, charge, playerState, look, useGame, bolts, stats, enemies, analyseEconomy, debug,
  debugClearEnemies: clearEnemies, director,
  /**
   * Point the view at the nearest body. Writes only to `look`, exactly what
   * the mouse writes -- it exists because CDP cannot drive a pointer-locked
   * camera, not because the game needs it.
   */
  debugFaceNearest() {
    let best: (typeof enemies)[number] | null = null
    let bestD = Infinity
    for (const e of enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.pos.x - playerState.pos.x, e.pos.z - playerState.pos.z)
      if (d < bestD) { bestD = d; best = e }
    }
    if (!best) return false
    const dx = best.pos.x - playerState.pos.x
    const dz = best.pos.z - playerState.pos.z
    look.yaw = Math.atan2(-dx, -dz)
    const dy = best.pos.y + ENEMIES[best.kind].height * 0.5 - (playerState.pos.y + 0.4)
    look.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    return true
  },
  debugSpawnAhead(kind: EnemyKind, dist: number, sideways = 0) {
    const fx = -Math.sin(look.yaw)
    const fz = -Math.cos(look.yaw)
    return spawnEnemy(
      kind,
      playerState.pos.x + fx * dist + Math.cos(look.yaw) * sideways,
      playerState.pos.z + fz * dist - Math.sin(look.yaw) * sideways,
    )
  },
}

function Stage() {
  const phase = useGame((s) => s.phase)
  const runId = useGame((s) => s.runId)
  return (
    <Suspense fallback={null}>
      <SkyDome />
      <Backdrop />
      <Lighting />
      <Physics gravity={GRAVITY} timeStep="vary" paused={phase !== 'playing'}>
        <Arena />
        <Player key={runId} />
        <CameraRig />
        <GameSystems />
        <Enemies />
        <Bolts />
        <ChargeAura />
        <Effects />
      </Physics>
      <Post />
    </Suspense>
  )
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const phase = useGame((s) => s.phase)
  // Adaptive resolution. The bloom pass is fill-rate bound, so on a machine
  // that cannot keep up we render fewer pixels and upscale rather than drop
  // the effect that the whole art direction rests on. Measured under software
  // rendering this is the difference between 2fps and a playable frame.
  // Starts below 1 and climbs on a machine that can afford it, rather than
  // starting high and stuttering while it works out that it cannot.
  const [dpr, setDpr] = useState(0.8)

  useEffect(() => {
    const canvas = host.current?.querySelector('canvas')
    if (canvas) attachInput(canvas)
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = host.current?.querySelector('canvas')
    if (canvas && !pointer.locked) requestLock(canvas)
  }, [phase])

  return (
    <div ref={host} style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: CAMERA.baseFov, near: 0.08, far: 420, position: [0, 4, 11] }}
        dpr={dpr}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <PerformanceMonitor
          bounds={() => [30, 58]}
          flipflops={6}
          onChange={({ factor }) => setDpr(Math.round((0.5 + factor * 1.0) * 20) / 20)}
        />
        <Stage />
      </Canvas>
      {phase === 'playing' && <Crosshair />}
      {phase !== 'title' && <Hud />}
      {phase === 'title' && <Title />}
      {(phase === 'won' || phase === 'lost') && <Result />}
    </div>
  )
}
