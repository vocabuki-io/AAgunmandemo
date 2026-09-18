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
      <fogExp2 attach="fog" args={['#251325', 0.0105]} />
      {/* Kept low on purpose: bloom supplies the brightness, so the fill only
          has to stop shadowed geometry from crushing to a silhouette. */}
      <ambientLight intensity={0.34} color="#5d4d73" />
      <hemisphereLight intensity={0.5} color="#7a6190" groundColor="#3a230f" />

      <directionalLight
        castShadow
        position={[-62, 22, -48]}
        intensity={3.4}
        color="#ff8f4a"
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.04}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-ARENA.radius, ARENA.radius, ARENA.radius, -ARENA.radius, 1, 190]}
        />
      </directionalLight>

      {/* Cold rim from behind-right: the cyberpunk half of the palette. */}
      <directionalLight position={[46, 18, 54]} intensity={0.8} color="#5a7dff" />
      {/* Low magenta bounce off the arena floor. */}
      <directionalLight position={[10, -6, -20]} intensity={0.34} color="#ff3b8e" />
    </>
  )
}
