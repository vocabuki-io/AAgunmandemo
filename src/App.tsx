import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { ACESFilmicToneMapping } from 'three'
import { CAMERA, GRAVITY } from './config'
import { Arena } from './scene/Arena'
import { CameraRig } from './scene/CameraRig'
import { Lighting } from './scene/Lighting'
import { Player } from './scene/Player'
import { SkyDome } from './scene/Sky'
import { Title } from './ui/Title'
import { useGame } from './store'
import { attachInput, look, pointer, requestLock } from './input'
import { camState, charge, playerState } from './game/runtime'

// Debug probe used by scripts/verify.mjs and by hand in the console.
;(window as unknown as Record<string, unknown>).__aa = { camState, charge, playerState, look, useGame }

function Stage() {
  const phase = useGame((s) => s.phase)
  return (
    <Suspense fallback={null}>
      <SkyDome />
      <Lighting />
      <Physics gravity={GRAVITY} timeStep="vary" paused={phase !== 'playing'}>
        <Arena />
        <Player />
        <CameraRig />
      </Physics>
    </Suspense>
  )
}

export default function App() {
  const host = useRef<HTMLDivElement>(null)
  const phase = useGame((s) => s.phase)

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
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: CAMERA.baseFov, near: 0.08, far: 420, position: [0, 4, 11] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <Stage />
      </Canvas>
      {phase === 'title' && <Title />}
    </div>
  )
}
