import { useMemo } from 'react'
import { BackSide, Color, ShaderMaterial } from 'three'

/**
 * Procedural dusk dome. No textures, no assets -- a three-stop vertical ramp
 * with a magenta band sitting on the horizon where the city glow would be.
 */
export function SkyDome() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color('#12091f') },
          uMid: { value: new Color('#3d1b45') },
          uHorizon: { value: new Color('#9c3a45') },
          uGlow: { value: new Color('#ff6a3d') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow;
          varying vec3 vPos;
          void main() {
            vec3 d = normalize(vPos);
            float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(uHorizon, uMid, smoothstep(0.48, 0.66, h));
            col = mix(col, uTop, smoothstep(0.62, 0.95, h));
            // Sun glow low on the -X/-Z side, matching the key light.
            float sd = max(0.0, dot(d, normalize(vec3(-0.62, 0.15, -0.55))));
            col += uGlow * (pow(sd, 520.0) * 2.2 + pow(sd, 10.0) * 0.22);
            // Ground half stays near-black so the arena silhouette reads.
            col *= smoothstep(0.34, 0.5, h) * 0.86 + 0.14;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  )

  return (
    <mesh scale={300} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 24, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
