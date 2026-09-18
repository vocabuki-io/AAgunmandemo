/**
 * Design guard for the core rule: "you must pick the right shot or the
 * batteries run out".
 *
 * This searches the real (volts, amperes) space against the real enemy table
 * and reports the cheapest shot that actually clears each threat. It is not
 * decoration -- verify asserts on its output, so retuning a number that
 * collapses the three answers into one (or makes full charge optimal) fails
 * the build instead of quietly ruining the game.
 */
import { BATTERY, ENEMIES, WAVES, type EnemyKind } from '../config'
import { computeShot } from './shooting'

/** What each kind actually shows up as: armour alone, swarms packed, runners solo. */
export const THREAT: Record<EnemyKind, { count: number; radius: number }> = {
  armored: { count: 1, radius: 0 },
  swarm: { count: 5, radius: 2.6 },
  runner: { count: 1, radius: 0 },
}

export type Plan = {
  kind: EnemyKind
  v: number
  a: number
  volts: number
  amps: number
  cost: number
  cleared: number
  costPerKill: number
}

/** How many of a packed group one shot at (v,a) actually kills. */
export function cleared(kind: EnemyKind, v: number, a: number) {
  const cfg = ENEMIES[kind]
  const s = computeShot(v, a)
  if (s.volts < cfg.armorVolts) return 0
  if (s.damage < cfg.hp) return 0
  const t = THREAT[kind]
  if (t.count === 1) return 1
  if (s.arcRadius < t.radius) return 1
  // Neighbours sit around 60% of the way out; falloff bottoms out at 35%.
  const falloff = 1 - (0.6 * t.radius / s.arcRadius) * 0.65
  const arc = s.arcDamage * falloff * cfg.arcTaken
  return arc >= cfg.hp ? t.count : 1
}

export function bestShotFor(kind: EnemyKind, step = 0.02): Plan {
  let best: Plan | null = null
  for (let v = 0; v <= 1.0001; v += step) {
    for (let a = 0; a <= 1.0001; a += step) {
      const n = cleared(kind, v, a)
      if (n === 0) continue
      const s = computeShot(v, a)
      const cpk = s.cost / n
      if (!best || cpk < best.costPerKill - 1e-9) {
        best = {
          kind, v: +v.toFixed(3), a: +a.toFixed(3),
          volts: +s.volts.toFixed(1), amps: +s.amps.toFixed(2),
          cost: +s.cost.toFixed(2), cleared: n, costPerKill: +cpk.toFixed(2),
        }
      }
    }
  }
  if (!best) throw new Error(`no shot can clear ${kind}`)
  return best
}

/**
 * The whole-run question: can you finish by spamming full charge?
 *
 * The answer must be no. Per-kind waste ratios alone do not settle it --
 * armour is expensive however you kill it -- but a run is mostly swarms and
 * runners, where full charge is 30-70x too expensive.
 */
export function analyseRun() {
  const plans = Object.fromEntries(
    (Object.keys(ENEMIES) as EnemyKind[]).map((k) => [k, bestShotFor(k)]),
  ) as Record<EnemyKind, Plan>

  const maxCost = computeShot(1, 1).cost
  let optimal = 0
  let maxCharge = 0
  const perWave = WAVES.map((w, i) => {
    const o = (Object.keys(ENEMIES) as EnemyKind[])
      .reduce((sum, k) => sum + w[k] * plans[k].costPerKill, 0)
    // At full charge every shot still only clears one armour, one runner or
    // one packed cluster -- you pay 100 units for each of them.
    const shots = (Object.keys(ENEMIES) as EnemyKind[])
      .reduce((n, k) => n + w[k] / THREAT[k].count, 0)
    const m = shots * maxCost
    optimal += o
    maxCharge += m
    return { wave: i + 1, label: w.label, optimal: +o.toFixed(1), maxCharge: +m.toFixed(1) }
  })

  // Everything the run will ever give you.
  const budget =
    BATTERY.chambers * BATTERY.unitsPerCell +
    (BATTERY.startingSpares + (WAVES.length - 1) * BATTERY.waveRefill) * BATTERY.unitsPerCell

  return {
    perWave,
    budget,
    optimalRunCost: +optimal.toFixed(1),
    maxChargeRunCost: +maxCharge.toFixed(1),
    /** >1 means full-charge spam cannot finish the run. */
    maxChargeOverBudget: +(maxCharge / budget).toFixed(2),
    /** Headroom a well-aimed run has for misses and mistakes. */
    optimalHeadroom: +(budget / optimal).toFixed(2),
  }
}

export function analyseEconomy() {
  const plans = (Object.keys(ENEMIES) as EnemyKind[]).map((k) => bestShotFor(k))
  const maxShot = computeShot(1, 1)
  const spread = (() => {
    let min = Infinity
    for (let i = 0; i < plans.length; i++) {
      for (let j = i + 1; j < plans.length; j++) {
        min = Math.min(min, Math.hypot(plans[i].v - plans[j].v, plans[i].a - plans[j].a))
      }
    }
    return +min.toFixed(3)
  })()
  return {
    plans,
    maxShotCost: +maxShot.cost.toFixed(2),
    /** Closest pair of per-kind optima in the (v,a) plane. */
    minOptimumSpread: spread,
    /** Worst case ratio of "just spam full charge" to "pick the right shot". */
    worstWasteRatio: +Math.min(...plans.map((p) => maxShot.cost / p.costPerKill)).toFixed(2),
    run: analyseRun(),
  }
}
