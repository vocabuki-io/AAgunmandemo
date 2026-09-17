/**
 * AA GUNMAN verification harness.
 *
 * 1. serves the production build
 * 2. opens it in chromium and requires ZERO console errors / page errors
 * 3. saves a screenshot per scenario
 * 4. computes the per-pixel STANDARD DEVIATION of the frame and fails on a
 *    near-uniform image.
 *
 * Mean brightness is deliberately NOT used: a mean-based gate only rejects
 * pure black and pure white, so an empty scene with a flat sky passes it.
 * Standard deviation answers the question we actually care about -- is
 * anything at all drawn on this screen.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SHOTS = resolve(ROOT, 'shots')
/** A fresh port per run: a leftover preview from an aborted run must never be
 *  able to silently serve a STALE dist and make this harness lie. */
const PORT = 4300 + Math.floor(Math.random() * 600)
const URL = `http://127.0.0.1:${PORT}/`

const VIEWPORT = { width: 1280, height: 720 }

/**
 * Read game state out of the debug probe the app publishes on window.__aa.
 * Scenarios assert on this, so verify checks that the game WORKS -- not only
 * that something colourful was drawn.
 */
const probe = (page) => page.evaluate(() => {
  const a = window.__aa
  const s = a.useGame.getState()
  const alive = (arr) => arr.filter((b) => b.alive).length
  return {
    phase: s.phase,
    hp: s.hp,
    spares: s.spares,
    chambers: s.chambers.map((c) => +c.toFixed(2)),
    cylinder: +s.chambers.reduce((x, y) => x + y, 0).toFixed(2),
    shotsFired: s.shotsFired,
    spentUnits: +s.spentUnits.toFixed(2),
    reloading: s.reloading,
    deathReason: s.deathReason,
    wave: s.wave,
    enemiesLeft: s.enemiesLeft,
    score: s.score,
    v: +a.charge.v.toFixed(3),
    amp: +a.charge.a.toFixed(3),
    bolts: alive(a.bolts),
    stats: { ...a.stats },
    enemies: a.enemies ? a.enemies.filter((e) => e.alive).length : 0,
    nearest: a.enemies
      ? Math.min(Infinity, ...a.enemies.filter((e) => e.alive).map((e) =>
          Math.hypot(e.pos.x - a.playerState.pos.x, e.pos.z - a.playerState.pos.z)))
      : Infinity,
    playerY: +a.playerState.pos.y.toFixed(2),
  }
})

const near = (actual, expected, tol) => Math.abs(actual - expected) <= tol

/** Scenarios run in order against a single server, one fresh page each. */
const SCENARIOS = [
  {
    name: '01-title',
    minStd: 18,
    async run() {},
    assert: (s) => [
      ['stays on the title screen', s.phase === 'title'],
      ['cylinder starts full', s.cylinder === 600],
    ],
  },
  {
    name: '02-arena',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.waitForTimeout(1500)
    },
    assert: (s) => [
      ['entered play', s.phase === 'playing'],
      ['player is standing on the floor, not falling through it', near(s.playerY, 0.9, 0.35)],
      ['nothing fired on its own', s.shotsFired === 0],
    ],
  },
  {
    name: '03-charge-volt',
    // Zoomed to FOV 26, so the frame shows a narrow slice of arena and is
    // legitimately flatter than the wide shots. Still 10x the 1.13 an empty
    // scene measured.
    minStd: 12,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { volt: true })
    },
    // Screenshot is taken WHILE the button is still held: this is the rule
    // "never discharge while either button is down".
    assert: (s) => [
      ['volts are at full charge', near(s.v, 1, 0.02)],
      ['amperes untouched', s.amp === 0],
      ['no shot while the button is held', s.shotsFired === 0],
      ['no battery spent while holding', s.cylinder === 600],
    ],
  },
  {
    name: '04-charge-amp',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { amp: true })
    },
    assert: (s) => [
      ['amperes are at full charge', near(s.amp, 1, 0.02)],
      ['volts untouched', s.v === 0],
      ['no shot while the button is held', s.shotsFired === 0],
    ],
  },
  {
    name: '05-hold-both',
    minStd: 12,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.waitForTimeout(600)
    },
    assert: (s) => [
      ['both knobs charged', near(s.v, 1, 0.02) && near(s.amp, 1, 0.02)],
      ['STILL no shot with both held', s.shotsFired === 0],
    ],
  },
  {
    name: '06-fire-volt',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { volt: true })
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['fired exactly once on release', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      ['the bolt travelled and resolved', s.stats.worldImpacts + s.stats.boltsExpired === 1],
      // 400V x 1.26A / 40 = 12.6 units. A pure penetrator is CHEAP.
      ['pure-volt shot costs 12.6 units', near(s.spentUnits, 12.6, 0.4)],
      ['charge reset after firing', s.v === 0 && s.amp === 0],
    ],
  },
  {
    name: '07-fire-amp',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['fired exactly once on release', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      ['the bolt travelled and resolved', s.stats.worldImpacts + s.stats.boltsExpired === 1],
      // 58V x 10A / 40 = 14.5 units. A pure shock shot is also CHEAP.
      ['pure-ampere shot costs 14.5 units', near(s.spentUnits, 14.5, 0.4)],
    ],
  },
  {
    name: '08-fire-mixed',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page)
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(600)
      // Still held on the right: the gun must wait for it.
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(900)
    },
    assert: (s) => [
      ['waited for the LAST button, then fired once', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      // 400V x 10A / 40 = 100 units: one whole AA for a single shot. This is
      // the ratio that makes always-max-charge a losing strategy.
      ['max shot drains a full cell (100 units)', near(s.spentUnits, 100, 0.5)],
      ['exactly one chamber emptied', s.chambers[0] === 0 && s.chambers[1] === 600 / 6],
    ],
  },
  {
    name: '09-enemies',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await waitForState(page, (s) => s.enemies >= 4, 'enemies to spawn')
    },
    assert: (s) => [
      ['enemies are on the sand', s.enemies >= 4],
      ['HUD enemy count matches the world', s.enemiesLeft === s.enemies],
      ['player has not been hurt yet at spawn range', s.hp === 100],
    ],
  },
  {
    name: '10-arc-kill',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page)
      // Planted in front rather than waited for: which side the ambient
      // spawner sends bodies from is random, and a pure-ampere bolt has to
      // actually hit something near the pack for the charge to conduct.
      await page.evaluate(() => {
        for (let i = 0; i < 4; i++) window.__aa.debugSpawnAhead('swarm', 6 + i * 0.6, (i - 1.5) * 1.1)
      })
      await holdUntilCharged(page, { amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(1000)
    },
    assert: (s) => [
      ['the bolt hit a body', s.stats.enemyHits >= 1],
      ['the charge conducted to the rest of the pack', s.stats.arcHits >= 2],
      // One 14.5-unit shot clears a cluster. This is why swarms want amperes.
      ['one ampere shot killed the whole cluster', s.stats.enemyKills >= 4],
      ['score went up', s.score > 0],
    ],
  },
  {
    name: '11-player-damage',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await waitForState(page, (s) => s.stats.playerHits >= 2, 'enemies to land hits')
    },
    assert: (s) => [
      ['melee contact damaged the player', s.hp < 100],
      // 6 damage a hit; i-frames stop a crowd from deleting you in one frame.
      ['damage matches hits taken', s.hp === 100 - s.stats.playerHits * 6],
      ['still alive and playing', s.phase === 'playing'],
    ],
  },
  {
    name: '12-enemies-on-screen',
    minStd: 14,
    async run(page, ctx) {
      await startGame(page)
      const before = await page.screenshot()
      await page.evaluate(() => {
        // A wall of all three silhouettes, close enough to fill real screen
        // area: the point is to prove the renderer draws them.
        window.__aa.debugSpawnAhead('armored', 6, -3.4)
        window.__aa.debugSpawnAhead('armored', 6.4, 0)
        window.__aa.debugSpawnAhead('armored', 6, 3.4)
        window.__aa.debugSpawnAhead('runner', 4.6, -1.8)
        window.__aa.debugSpawnAhead('runner', 4.6, 1.8)
        window.__aa.debugSpawnAhead('swarm', 3.6, -0.9)
        window.__aa.debugSpawnAhead('swarm', 3.6, 0.9)
      })
      await page.waitForTimeout(900)
      const after = await page.screenshot()
      return { diff: await ctx.meanAbsDiff(page, before, after) }
    },
    assert: (s) => [
      ['all three kinds spawned in front of the camera', s.enemies >= 7],
      // A renderer that draws nothing cannot fake a changed frame.
      ['enemies visibly changed the frame', s.diff > 3],
    ],
  },
  {
    name: '13-reload',
    minStd: 14,
    async run(page) {
      await startGame(page)
      // One max-power shot empties exactly one chamber.
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.mouse.up({ button: 'right' })
      await waitForState(page, (s) => s.shotsFired === 1, 'the shot to leave')
      await page.keyboard.press('r')
      await waitForState(page, (s) => !s.reloading && s.stats.reloads === 1, 'the reload to finish')
    },
    assert: (s) => [
      ['cylinder is full again', s.cylinder === 600],
      // Only the one emptied chamber was replaced, so only one spare is gone.
      ['exactly one spare was consumed', s.spares === 17],
      ['not stuck in the reloading state', s.reloading === false],
    ],
  },
  {
    name: '14-reload-waste',
    minStd: 14,
    async run(page) {
      await startGame(page)
      // A chamber with charge still in it. Reloading now throws that charge
      // away -- reloading early is how you waste batteries, and this pins it.
      await page.evaluate(() => window.__aa.useGame.setState({
        chambers: [40, 100, 100, 100, 100, 100], spares: 5,
      }))
      await page.keyboard.press('r')
      await waitForState(page, (s) => !s.reloading && s.stats.reloads === 1, 'the reload to finish')
    },
    assert: (s) => [
      ['cylinder is full', s.cylinder === 600],
      ['a whole spare was spent', s.spares === 4],
      // 100 units of spare bought only 60 units of capacity: the other 40
      // went in the dirt with the part-used cell.
      ['the part-used cell was discarded, not topped up', s.chambers[0] === 100],
    ],
  },
  {
    name: '15-out-of-batteries',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.evaluate(() => window.__aa.useGame.setState({
        chambers: [4, 0, 0, 0, 0, 0], spares: 0,
      }))
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.mouse.up({ button: 'right' })
      await waitForState(page, (s) => s.phase !== 'playing', 'the run to end')
    },
    assert: (s) => [
      ['the run ended', s.phase === 'lost'],
      ['ended for the right reason', s.deathReason === 'OUT OF BATTERIES'],
      // The last 4 units still fired -- a shot scaled down, not a dead trigger.
      ['the last of the charge still fired a shot', s.shotsFired === 1 && s.spentUnits === 4],
    ],
  },
]

/**
 * Hold the given buttons until the gun is actually fully charged.
 *
 * Wall-clock waits do not work here: SwiftShader renders at 4-7fps, so a
 * "1.5 second" hold is 6 frames and lands wherever it lands. Polling the real
 * charge value is both stabler and a truer statement of the intent -- a player
 * holds the button until the gun is ready, not for a stopwatch interval.
 */
async function holdUntilCharged(page, { volt = false, amp = false }, timeoutMs = 20000) {
  if (volt) await page.mouse.down({ button: 'right' })
  if (amp) await page.mouse.down({ button: 'left' })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const c = await page.evaluate(() => ({ v: window.__aa.charge.v, a: window.__aa.charge.a }))
    const ok = (!volt || c.v >= 0.999) && (!amp || c.a >= 0.999)
    if (ok) return
    if (Date.now() > deadline) throw new Error(`charge never filled: v=${c.v} a=${c.a}`)
    await page.waitForTimeout(120)
  }
}

/** Poll the probe until `pred(state)` holds. */
async function waitForState(page, pred, label, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const st = await probe(page)
    if (pred(st)) return st
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}: ${JSON.stringify(st)}`)
    await page.waitForTimeout(200)
  }
}

async function startGame(page) {
  // Title screen -> arena. The start control carries a stable test id.
  const start = page.locator('[data-testid="start-button"]')
  if (await start.count()) {
    await start.click()
  }
  await page.waitForTimeout(1200)
}

function waitForPort(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((res, rej) => {
    const tick = () => {
      const sock = net.connect(port, '127.0.0.1')
      sock.once('connect', () => { sock.destroy(); res() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() > deadline) rej(new Error(`port ${port} never opened`))
        else setTimeout(tick, 250)
      })
    }
    tick()
  })
}

/**
 * Decode the PNG inside the browser (no image deps in node) and return
 * luminance statistics for the frame.
 */
async function imageStats(page, pngBuffer) {
  const b64 = pngBuffer.toString('base64')
  return page.evaluate(async (data) => {
    const blob = await (await fetch('data:image/png;base64,' + data)).blob()
    const bmp = await createImageBitmap(blob)
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = cv.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, bmp.width, bmp.height)
    let sum = 0
    let sumSq = 0
    const n = px.length / 4
    const seen = new Set()
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      sum += l
      sumSq += l * l
      if (seen.size < 5000) seen.add((px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | (px[i + 2] >> 3))
    }
    const mean = sum / n
    const variance = Math.max(0, sumSq / n - mean * mean)
    return { mean, std: Math.sqrt(variance), colors: seen.size, w: bmp.width, h: bmp.height }
  }, b64)
}

/**
 * Mean absolute luminance difference between two frames, computed in the
 * browser. Lets a scenario assert that adding something to the world actually
 * changed the picture -- a renderer that draws nothing cannot fake this.
 */
async function meanAbsDiff(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = async (d) => {
      const blob = await (await fetch('data:image/png;base64,' + d)).blob()
      const bmp = await createImageBitmap(blob)
      const cv = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = cv.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data
    }
    const [pa, pb] = await Promise.all([load(x), load(y)])
    let sum = 0
    const n = pa.length / 4
    for (let i = 0; i < pa.length; i += 4) {
      const la = 0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2]
      const lb = 0.2126 * pb[i] + 0.7152 * pb[i + 1] + 0.0722 * pb[i + 2]
      sum += Math.abs(la - lb)
    }
    return sum / n
  }, [a.toString('base64'), b.toString('base64')])
}

async function main() {
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
    console.error('[verify] dist/index.html missing -- run `npm run build` first.')
    process.exit(1)
  }
  mkdirSync(SHOTS, { recursive: true })

  const server = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview',
     '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  let serverDied = null
  server.stdout.on('data', () => {})
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`))
  server.on('exit', (code) => { if (code) serverDied = code })

  let browser
  const failures = []
  const report = []
  try {
    await waitForPort(PORT)
    if (serverDied) throw new Error(`preview server exited with code ${serverDied}`)
    browser = await chromium.launch({
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
      ],
    })

    for (const sc of SCENARIOS) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('requestfailed', (r) => {
        const f = r.failure()?.errorText ?? ''
        if (!f.includes('ERR_ABORTED')) errors.push(`requestfailed: ${r.url()} ${f}`)
      })

      await page.goto(URL, { waitUntil: 'load' })
      await page.waitForSelector('canvas', { timeout: 20000 })
      await page.waitForTimeout(2500)
      const extra = (await sc.run(page, { meanAbsDiff })) ?? {}
      await page.waitForTimeout(sc.settle ?? 400)

      const shotPath = resolve(SHOTS, `${sc.name}.png`)
      const png = await page.screenshot()
      writeFileSync(shotPath, png)
      const stats = await imageStats(page, png)

      const problems = []
      if (errors.length) problems.push(`${errors.length} console/page error(s)`)
      if (stats.std < sc.minStd) problems.push(`std ${stats.std.toFixed(2)} < min ${sc.minStd} (near-uniform frame)`)

      const state = { ...(await probe(page)), ...extra }
      const checks = sc.assert ? sc.assert(state) : []
      for (const [label, ok] of checks) if (!ok) problems.push(`assert: ${label}`)

      report.push({ name: sc.name, stats, errors, problems, state })
      if (problems.length) failures.push(sc.name)

      const tag = problems.length ? 'FAIL' : 'ok  '
      console.log(
        `[verify] ${tag} ${sc.name.padEnd(16)} std=${stats.std.toFixed(2).padStart(6)} ` +
        `mean=${stats.mean.toFixed(1).padStart(6)} errors=${errors.length} ` +
        `checks=${checks.filter(([, ok]) => ok).length}/${checks.length}`
      )
      for (const e of errors.slice(0, 12)) console.log(`         | ${e}`)
      for (const p of problems) console.log(`         ! ${p}`)
      if (problems.some((p) => p.startsWith('assert'))) {
        console.log(`         state: ${JSON.stringify(state)}`)
      }
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }

  writeFileSync(resolve(SHOTS, 'report.json'), JSON.stringify(report, null, 2))
  if (failures.length) {
    console.error(`\n[verify] FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
  console.log('\n[verify] all scenarios passed')
}

main().catch((e) => { console.error('[verify] harness error:', e); process.exit(1) })
