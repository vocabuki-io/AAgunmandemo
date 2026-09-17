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

/** Scenarios run in order against a single server, one fresh page each. */
const SCENARIOS = [
  {
    name: '01-title',
    minStd: 18,
    async run() {},
  },
  {
    name: '02-arena',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.waitForTimeout(1500)
    },
  },
  {
    name: '03-charge-volt',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.mouse.down({ button: 'right' })
      await page.waitForTimeout(1200)
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(500)
    },
  },
  {
    name: '04-charge-amp',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.mouse.down({ button: 'left' })
      await page.waitForTimeout(1200)
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(500)
    },
  },
]

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
      await sc.run(page)
      await page.waitForTimeout(400)

      const shotPath = resolve(SHOTS, `${sc.name}.png`)
      const png = await page.screenshot()
      writeFileSync(shotPath, png)
      const stats = await imageStats(page, png)

      const problems = []
      if (errors.length) problems.push(`${errors.length} console/page error(s)`)
      if (stats.std < sc.minStd) problems.push(`std ${stats.std.toFixed(2)} < min ${sc.minStd} (near-uniform frame)`)

      report.push({ name: sc.name, stats, errors, problems })
      if (problems.length) failures.push(sc.name)

      const tag = problems.length ? 'FAIL' : 'ok  '
      console.log(
        `[verify] ${tag} ${sc.name.padEnd(16)} std=${stats.std.toFixed(2).padStart(6)} ` +
        `mean=${stats.mean.toFixed(1).padStart(6)} colors=${String(stats.colors).padStart(5)} errors=${errors.length}`
      )
      for (const e of errors.slice(0, 12)) console.log(`         | ${e}`)
      for (const p of problems) console.log(`         ! ${p}`)
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
