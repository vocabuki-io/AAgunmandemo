import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4931
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:1280,height:720}})
p.on('pageerror', e=>console.log('pageerror:', e.message))
p.on('console', m=>{ if(m.type()==='error') console.log('console.error:', m.text()) })
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(14000)
console.log('canvas px:', await p.evaluate(()=>{const c=document.querySelector('canvas'); return c.width+'x'+c.height}))
const fps = await p.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();
  const f=()=>{n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else r(+(n/((performance.now()-t0)/1000)).toFixed(1))}; requestAnimationFrame(f)}))
console.log('fps in-game:', fps)
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
