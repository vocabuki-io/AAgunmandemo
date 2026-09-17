import { create } from 'zustand'
import { BATTERY, PLAYER, WAVES } from './config'

export type Phase = 'title' | 'playing' | 'won' | 'lost'

export type LogLine = { id: number; text: string; tone: 'v' | 'a' | 'warn' | 'plain' }

let logId = 0

export interface GameState {
  phase: Phase
  /** Bumped on every new run so the scene can remount what needs remounting. */
  runId: number
  hp: number
  /** Charge remaining in each chamber, 0..BATTERY.unitsPerCell. */
  chambers: number[]
  spares: number
  reloading: boolean
  wave: number
  waveLabel: string
  enemiesLeft: number
  score: number
  shotsFired: number
  spentUnits: number
  log: LogLine[]
  deathReason: string

  start: () => void
  reset: () => void
  setPhase: (p: Phase) => void
  lose: (reason: string) => void
  win: () => void
  grantSpares: (n: number) => void
  damagePlayer: (n: number) => void
  /**
   * Draw `cost` units from the cylinder, spilling across chambers.
   * Returns the fraction of the requested cost that was actually available:
   * 1 = full power shot, 0 = dry click.
   */
  drawCharge: (cost: number) => number
  beginReload: () => void
  finishReload: () => void
  setWave: (i: number) => void
  setEnemiesLeft: (n: number) => void
  addScore: (n: number) => void
  pushLog: (text: string, tone?: LogLine['tone']) => void
}

const freshChambers = () => Array.from({ length: BATTERY.chambers }, () => BATTERY.unitsPerCell)

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  runId: 0,
  hp: PLAYER.maxHp,
  chambers: freshChambers(),
  spares: BATTERY.startingSpares,
  reloading: false,
  wave: 0,
  waveLabel: WAVES[0].label,
  enemiesLeft: 0,
  score: 0,
  shotsFired: 0,
  spentUnits: 0,
  log: [],
  deathReason: '',

  start: () => {
    get().reset()
    set({ phase: 'playing', runId: get().runId + 1 })
  },

  reset: () => set({
    hp: PLAYER.maxHp,
    chambers: freshChambers(),
    spares: BATTERY.startingSpares,
    reloading: false,
    wave: 0,
    waveLabel: WAVES[0].label,
    enemiesLeft: 0,
    score: 0,
    shotsFired: 0,
    spentUnits: 0,
    log: [],
    deathReason: '',
  }),

  setPhase: (p) => set({ phase: p }),

  lose: (reason) => set((s) => (s.phase === 'playing' ? { phase: 'lost' as Phase, deathReason: reason } : s)),

  win: () => set((s) => (s.phase === 'playing' ? { phase: 'won' as Phase } : s)),

  grantSpares: (n) => set((s) => ({ spares: s.spares + n })),

  damagePlayer: (n) => set((s) => {
    if (s.phase !== 'playing') return s
    const hp = Math.max(0, s.hp - n)
    if (hp <= 0) return { hp, phase: 'lost' as Phase, deathReason: 'BODY BURNED OUT' }
    return { hp }
  }),

  drawCharge: (cost) => {
    const s = get()
    const chambers = s.chambers.slice()
    const available = chambers.reduce((a, b) => a + b, 0)
    if (available <= 0) return 0
    const take = Math.min(cost, available)
    let left = take
    for (let i = 0; i < chambers.length && left > 0; i++) {
      const got = Math.min(chambers[i], left)
      chambers[i] -= got
      left -= got
    }
    set({ chambers, shotsFired: s.shotsFired + 1, spentUnits: s.spentUnits + take })
    return cost <= 0 ? 1 : take / cost
  },

  beginReload: () => {
    const s = get()
    if (s.reloading || s.phase !== 'playing') return
    if (s.spares <= 0) return
    if (s.chambers.every((c) => c >= BATTERY.unitsPerCell)) return
    set({ reloading: true })
  },

  finishReload: () => {
    const s = get()
    if (!s.reloading) return
    let spares = s.spares
    const chambers = s.chambers.map((c) => {
      // A partially drained cell is thrown away with the rest -- reloading
      // early is how you waste batteries.
      if (c < BATTERY.unitsPerCell && spares > 0) { spares--; return BATTERY.unitsPerCell }
      return c
    })
    set({ chambers, spares, reloading: false })
  },

  setWave: (i) => set({ wave: i, waveLabel: WAVES[Math.min(i, WAVES.length - 1)].label }),
  setEnemiesLeft: (n) => set({ enemiesLeft: n }),
  addScore: (n) => set((s) => ({ score: s.score + n })),

  pushLog: (text, tone = 'plain') => set((s) => ({
    log: [...s.log, { id: logId++, text, tone }].slice(-5),
  })),
}))

export const cylinderTotal = (s: GameState) => s.chambers.reduce((a, b) => a + b, 0)
