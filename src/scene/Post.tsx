import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { BlendFunction, KernelSize } from 'postprocessing'

/**
 * Bloom is doing the heavy lifting for the whole look: every emissive in the
 * scene is written well above 1.0, so the electricity blooms hard while the
 * sand and steel (which never exceed 1.0) stay matte. That contrast is the
 * entire "dark base, only the electricity glows" brief, and it costs one pass.
 */
export function Post() {
  return (
    // No MSAA: on top of a bloom pass it is the single most expensive thing in
    // the frame, and flat-shaded low-poly hides its absence well.
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={1.5}
        luminanceThreshold={0.42}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.72}
        kernelSize={KernelSize.MEDIUM}
      />
      <Vignette offset={0.16} darkness={0.85} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  )
}
