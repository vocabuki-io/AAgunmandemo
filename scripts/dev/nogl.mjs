// Simulates a browser that refuses a WebGL context (what aggressive
// fingerprint blocking does) and checks the page says so instead of going black.
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4995
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((r)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();r()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})

for (const mode of ['blocked', 'normal']) {
  const p = await b.newPage({viewport:{width:1280,height:720}})
  if (mode === 'blocked') {
    await p.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).indexOf('webgl') === 0) return null
        return orig.call(this, type, ...rest)
      }
    })
  }
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
  await p.waitForTimeout(3500)
  const out = await p.evaluate(() => ({
    fatal: !!document.querySelector('[data-testid="fatal-panel"]'),
    canvas: !!document.querySelector('canvas'),
    start: !!document.querySelector('[data-testid="start-button"]'),
    boot: !!document.getElementById('boot'),
    heading: (document.querySelector('h1') || {}).textContent || null,
    // Is anything at all painted, or is the page just black?
    text: document.body.innerText.slice(0, 90).replace(/\n+/g, ' | '),
  }))
  console.log(mode.padEnd(8), JSON.stringify(out))
  await p.close()
}
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
