/**
 * Plays a whole run with a scripted strategy and reports what it cost.
 *
 * This is the empirical counterpart to game/economy.ts: instead of solving the
 * (volts, amperes) plane on paper, it actually fights all six waves and lets
 * the battery arithmetic happen for real.
 *
 *   node scripts/dev/playthrough.mjs picky    -- choose the shot per enemy kind
 *   node scripts/dev/playthrough.mjs lazy     -- hold both buttons every time
 *
 * God mode is on for both: the question under test is whether the BATTERIES
 * last, not whether a script can dodge.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'

const STRATEGY = process.argv[2] ?? 'picky'
const PORT = 4960 + Math.floor(Math.random() * 30)

// Per-kind shot plans, close to what game/economy.ts says is optimal.
const PLAN = {
  armored: { v: 0.5, a: 0.7 },
  swarm: { v: 0, a: 0.45 },
  runner: { v: 0, a: 0.12 },
}
const MAX = { v: 1, a: 1 }

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: '/home/user/AAgunmandemo', stdio: 'ignore', detached: true },
)
await new Promise((res) => {
  const t = () => {
    const k = net.connect(PORT, '127.0.0.1')
    k.once('connect', () => { k.destroy(); res() })
    k.once('error', () => { k.destroy(); setTimeout(t, 200) })
  }
  t()
})

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 520 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(`http://127.0.0.1:${PORT}/`)
await page.waitForSelector('canvas')
await page.waitForTimeout(2500)
await page.click('[data-testid="start-button"]')
await page.waitForTimeout(1500)
await page.evaluate(() => { window.__aa.debug.godMode = true })

const probe = () => page.evaluate(() => {
  const a = window.__aa
  const s = a.useGame.getState()
  return {
    phase: s.phase, wave: s.wave, spares: s.spares, deathReason: s.deathReason,
    cylinder: s.chambers.reduce((x, y) => x + y, 0),
    shots: s.shotsFired, spent: s.spentUnits, score: s.score,
    reloading: s.reloading,
    alive: a.enemies.filter((e) => e.alive).length,
    kills: a.stats.enemyKills,
  }
})

async function chargeTo({ v, a }) {
  if (v > 0) await page.mouse.down({ button: 'right' })
  if (a > 0) await page.mouse.down({ button: 'left' })
  let vDone = v <= 0
  let aDone = a <= 0
  const deadline = Date.now() + 20000
  while (!vDone || !aDone) {
    const c = await page.evaluate(() => ({ v: window.__aa.charge.v, a: window.__aa.charge.a }))
    if (!vDone && c.v >= v) { await page.mouse.up({ button: 'right' }); vDone = true }
    if (!aDone && c.a >= a) { await page.mouse.up({ button: 'left' }); aDone = true }
    if (Date.now() > deadline) break
    if (!vDone || !aDone) await page.waitForTimeout(60)
  }
}

const started = Date.now()
let idle = 0
for (;;) {
  const st = await probe()
  if (st.phase !== 'playing') break
  if (Date.now() - started > 20 * 60_000) { console.log('giving up on time'); break }

  // Reload when the cylinder can no longer pay for the biggest shot either
  // strategy fires. Same rule for both so the comparison is fair.
  if (!st.reloading && st.cylinder < 105 && st.spares > 0) {
    await page.keyboard.press('r')
    await page.waitForTimeout(1600)
    continue
  }

  const target = await page.evaluate(() => window.__aa.debugFaceNearest())
  if (!target) {
    idle++
    await page.waitForTimeout(600)
    if (idle > 200) { console.log('nothing to shoot for too long'); break }
    continue
  }
  idle = 0
  await chargeTo(STRATEGY === 'lazy' ? MAX : PLAN[target.kind])
  await page.waitForTimeout(420)
}

const final = await probe()
const mins = ((Date.now() - started) / 60000).toFixed(1)
console.log(`\n=== ${STRATEGY} run (${mins} min wall) ===`)
console.log(JSON.stringify({ ...final, avgCostPerShot: +(final.spent / Math.max(1, final.shots)).toFixed(1) }, null, 1))
console.log('console errors:', errors.length, errors.slice(0, 5))

await browser.close()
try { process.kill(-server.pid, 'SIGTERM') } catch {}
