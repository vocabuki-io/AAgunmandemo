// Sabotage: serve the page but 404 the JS bundle, and check the boot fallback
// names the real problem instead of just saying it stalled.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'

const ROOT = '/home/user/AAgunmandemo/dist'
const MODES = ['404', 'ok']
const results = {}

for (const mode of MODES) {
  const server = createServer((req, res) => {
    const url = req.url.split('?')[0]
    const p = join(ROOT, url === '/' ? 'index.html' : url)
    if (mode === '404' && url.endsWith('.js')) { res.writeHead(404); res.end('nope'); return }
    if (!existsSync(p)) { res.writeHead(404); res.end('nope'); return }
    const type = extname(p) === '.js' ? 'text/javascript' : extname(p) === '.html' ? 'text/html' : 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(readFileSync(p))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await p.waitForTimeout(mode === '404' ? 3000 : 4000)
  results[mode] = await p.evaluate(() => ({
    msg: (document.getElementById('boot-msg') || {}).textContent || null,
    detail: ((document.getElementById('boot-detail') || {}).textContent || '').slice(0, 150).replace(/\n+/g, ' | '),
    mounted: !!window.__aaMounted,
    start: !!document.querySelector('[data-testid="start-button"]'),
  }))
  await b.close()
  server.close()
}
for (const m of MODES) console.log(m.padEnd(4), JSON.stringify(results[m]))
