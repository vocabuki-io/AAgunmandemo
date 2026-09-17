import { ARENA } from '../config'

/**
 * Few lights, hard contrast. A low warm sun (the western half) throws long
 * shadows across the sand; a cold blue fill from the opposite side keeps
 * silhouettes off pure black so girders read as objects, not holes. Anything
 * that actually glows is emissive, not a light.
 */
export function Lighting() {
  return (
    <>
      <fogExp2 attach="fog" args={['#2a1626', 0.0115]} />
      <ambientLight intensity={0.85} color="#6b5a7d" />
      <hemisphereLight intensity={1.15} color="#8a6f9e" groundColor="#4a2f18" />

      <directionalLight
        castShadow
        position={[-62, 22, -48]}
        intensity={3.4}
        color="#ff8f4a"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.04}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-ARENA.radius, ARENA.radius, ARENA.radius, -ARENA.radius, 1, 190]}
        />
      </directionalLight>

      {/* Cold rim from behind-right: the cyberpunk half of the palette. */}
      <directionalLight position={[46, 18, 54]} intensity={1.35} color="#5a7dff" />
      {/* Low magenta bounce off the arena floor. */}
      <directionalLight position={[10, -6, -20]} intensity={0.55} color="#ff3b8e" />
    </>
  )
}
