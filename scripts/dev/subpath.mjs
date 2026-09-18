// Serves dist/ under a /AAgunmandemo/ subpath, the way GitHub Pages will,
// and checks the game boots there with no console errors.
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4988
const s = spawn('npx', ['http-server', '/tmp/pagestest', '-p', String(PORT), '-s'], { stdio:'ignore', detached:true })
await new Promise((r)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();r()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']})
const p = await b.newPage({viewport:{width:1280,height:720}})
const errs = []
p.on('pageerror', e=>errs.push('pageerror: '+e.message))
p.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text()) })
p.on('requestfailed', r=>{ const f=r.failure()?.errorText??''; if(!f.includes('ERR_ABORTED')) errs.push('requestfailed: '+r.url()+' '+f) })
const url = `http://127.0.0.1:${PORT}/AAgunmandemo/`
await p.goto(url, { waitUntil: 'load' })
await p.waitForSelector('canvas', { timeout: 20000 })
await p.waitForTimeout(3000)
await p.click('[data-testid="start-button"]')
await p.waitForTimeout(4000)
const st = await p.evaluate(()=>({ phase: window.__aa.useGame.getState().phase, locked: document.pointerLockElement !== null }))
console.log('url          :', url)
console.log('state        :', JSON.stringify(st))
console.log('console errs :', errs.length, errs.slice(0,5))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
