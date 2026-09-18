/**
 * All audio is synthesised at runtime. No files, no fetches, no licences.
 *
 * The palette is deliberately narrow: band-passed noise for anything
 * electrical, detuned saw for anything mechanical, and a sine sweep for
 * impact weight. Volts and amperes drive pitch and grit respectively, so a
 * shot sounds like what it cost.
 */
import type { EnemyKind } from '../config'
import type { ShotSpec } from './shooting'

type Ctx = AudioContext

let ctx: Ctx | null = null
let master: GainNode | null = null
let voltOsc: OscillatorNode | null = null
let voltGain: GainNode | null = null
let voltFilter: BiquadFilterNode | null = null
let ampSrc: AudioBufferSourceNode | null = null
let ampGain: GainNode | null = null
let ampFilter: BiquadFilterNode | null = null
let noise: AudioBuffer | null = null

export const audio = {
  ready: false,
  muted: false,
  /** Bumped for every sound actually scheduled; verify asserts on it. */
  played: 0,
}

/** Cheap guard against a hundred simultaneous spark ticks in one frame. */
let budget = 24
let budgetAt = 0
function afford(now: number, cost = 1) {
  if (now - budgetAt > 0.1) { budget = 24; budgetAt = now }
  if (budget < cost) return false
  budget -= cost
  return true
}

function makeNoise(c: Ctx) {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/**
 * Must be called from a real user gesture (the DRAW button), or the browser
 * will refuse to start the context.
 */
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    noise = makeNoise(ctx)

    master = ctx.createGain()
    master.gain.value = 0.55
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 7
    master.connect(comp).connect(ctx.destination)

    // --- continuous volt whine: pitch IS the charge readout -------------
    voltOsc = ctx.createOscillator()
    voltOsc.type = 'sawtooth'
    voltOsc.frequency.value = 150
    voltFilter = ctx.createBiquadFilter()
    voltFilter.type = 'lowpass'
    voltFilter.frequency.value = 900
    voltFilter.Q.value = 6
    voltGain = ctx.createGain()
    voltGain.gain.value = 0
    voltOsc.connect(voltFilter).connect(voltGain).connect(master)
    voltOsc.start()

    // --- continuous ampere crackle -------------------------------------
    ampSrc = ctx.createBufferSource()
    ampSrc.buffer = noise
    ampSrc.loop = true
    ampFilter = ctx.createBiquadFilter()
    ampFilter.type = 'bandpass'
    ampFilter.frequency.value = 1100
    ampFilter.Q.value = 1.2
    ampGain = ctx.createGain()
    ampGain.gain.value = 0
    ampSrc.connect(ampFilter).connect(ampGain).connect(master)
    ampSrc.start()

    audio.ready = true
  } catch {
    ctx = null
    audio.ready = false
  }
}

export function setMuted(m: boolean) {
  audio.muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02)
}

export function suspendAudio() {
  if (voltGain && ctx) voltGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  if (ampGain && ctx) ampGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}

/** Drive the two charge loops from the live knobs. */
export function updateAudio(v: number, a: number) {
  if (!ctx || !audio.ready) return
  const t = ctx.currentTime
  if (voltOsc && voltGain && voltFilter) {
    voltOsc.frequency.setTargetAtTime(150 + v * v * 1250, t, 0.04)
    voltFilter.frequency.setTargetAtTime(700 + v * 3600, t, 0.05)
    voltGain.gain.setTargetAtTime(v > 0.01 ? 0.015 + v * 0.055 : 0, t, 0.05)
  }
  if (ampGain && ampFilter) {
    ampFilter.frequency.setTargetAtTime(700 + a * 2600, t, 0.05)
    ampFilter.Q.setTargetAtTime(1.2 + a * 5, t, 0.05)
    ampGain.gain.setTargetAtTime(a > 0.01 ? 0.01 + a * 0.085 : 0, t, 0.05)
  }
}

type NoiseOpts = {
  dur?: number
  freq?: number
  q?: number
  gain?: number
  type?: BiquadFilterType
  sweepTo?: number
}

function burst(o: NoiseOpts) {
  if (!ctx || !master || !noise || !audio.ready) return
  const t = ctx.currentTime
  if (!afford(t)) return
  const dur = o.dur ?? 0.12
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.8 + Math.random() * 0.5
  const f = ctx.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.setValueAtTime(o.freq ?? 1200, t)
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweepTo), t + dur)
  f.Q.value = o.q ?? 1.4
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(o.gain ?? 0.25, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
  audio.played++
}

function tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx || !master || !audio.ready) return
  const t = ctx.currentTime
  if (!afford(t)) return
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
  audio.played++
}

/** The shot's voice is the shot's spec: volts crack, amperes growl. */
export function sfxShot(spec: ShotSpec) {
  const v = (spec.volts - 20) / 380
  const a = (spec.amps - 0.5) / 9.5
  tone(320 + v * 900, 60 + v * 140, 0.16 + a * 0.16, 0.3, 'square')
  burst({ dur: 0.1 + v * 0.1, freq: 900 + v * 3800, sweepTo: 220, q: 1 + v * 3, gain: 0.26 })
  if (a > 0.25) burst({ dur: 0.18 + a * 0.3, freq: 420 + a * 900, q: 0.9, gain: 0.1 + a * 0.16, type: 'bandpass' })
  tone(90 - a * 26, 34, 0.24 + a * 0.2, 0.22 + a * 0.2)
}

export function sfxDryFire() {
  burst({ dur: 0.05, freq: 2400, q: 6, gain: 0.16 })
  tone(240, 120, 0.05, 0.1, 'square')
}

export function sfxImpact(volts: number, amps: number) {
  burst({ dur: 0.07 + amps * 0.012, freq: 1600 + volts * 5, sweepTo: 300, q: 2, gain: 0.16 })
  tone(150, 50, 0.1, 0.1)
}

export function sfxRicochet() {
  burst({ dur: 0.1, freq: 3200, q: 9, gain: 0.2 })
  tone(1500, 600, 0.13, 0.09, 'triangle')
}

export function sfxArc() {
  burst({ dur: 0.13, freq: 2200 + Math.random() * 1600, q: 7, gain: 0.13 })
}

export function sfxKill(kind: EnemyKind) {
  if (kind === 'armored') {
    tone(150, 36, 0.4, 0.3)
    burst({ dur: 0.3, freq: 700, sweepTo: 130, q: 0.9, gain: 0.22 })
  } else if (kind === 'runner') {
    tone(520, 90, 0.2, 0.2, 'triangle')
    burst({ dur: 0.16, freq: 1900, sweepTo: 400, q: 2, gain: 0.16 })
  } else {
    burst({ dur: 0.11, freq: 2600, sweepTo: 700, q: 3, gain: 0.14 })
  }
}

export function sfxPlayerHit() {
  tone(190, 44, 0.3, 0.34)
  burst({ dur: 0.18, freq: 380, sweepTo: 110, q: 0.8, gain: 0.2, type: 'lowpass' })
}

export function sfxReloadStart() {
  burst({ dur: 0.05, freq: 1500, q: 8, gain: 0.16 })
}

export function sfxReloadDone() {
  burst({ dur: 0.04, freq: 2600, q: 10, gain: 0.18 })
  tone(700, 1200, 0.07, 0.1, 'square')
  tone(1200, 1600, 0.09, 0.07, 'square')
}

export function sfxWaveStart() {
  tone(180, 360, 0.5, 0.16, 'sawtooth')
  tone(270, 540, 0.5, 0.1, 'sawtooth')
}

export function sfxWaveClear() {
  tone(440, 660, 0.35, 0.14, 'triangle')
  tone(660, 880, 0.4, 0.1, 'triangle')
}

export function sfxWin() {
  tone(330, 660, 0.9, 0.2, 'triangle')
  tone(495, 990, 0.9, 0.12, 'triangle')
}

export function sfxLose() {
  tone(220, 40, 1.3, 0.28, 'sawtooth')
  burst({ dur: 1.0, freq: 500, sweepTo: 70, q: 0.7, gain: 0.16 })
}
