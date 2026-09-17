import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4917
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:1280,height:720}})
p.on('pageerror', e=>console.log('pageerror', e.message))
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2200)
// measure fps
const fps = await p.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();
  const f=()=>{n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(+(n/((performance.now()-t0)/1000)).toFixed(1))}; requestAnimationFrame(f)}))
console.log('fps:', fps)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(1200)
const rd = ()=>p.evaluate(()=>({v:+window.__aa.charge.v.toFixed(3),a:+window.__aa.charge.a.toFixed(3),
  cd:+window.__aa.charge.cooldown.toFixed(3), armed:window.__aa.charge.armed,
  shots:window.__aa.useGame.getState().shotsFired, spent:+window.__aa.useGame.getState().spentUnits.toFixed(2),
  bolts:window.__aa.bolts.filter(x=>x.alive).length}))
await p.mouse.down({button:'right'})
for (let i=0;i<6;i++){ await p.waitForTimeout(250); console.log(' t=%dms', 250*(i+1), JSON.stringify(await rd())) }
console.log('pre-up  ', JSON.stringify(await rd()))
await p.mouse.up({button:'right'})
await p.waitForTimeout(40);  console.log('+40ms   ', JSON.stringify(await rd()))
await p.waitForTimeout(100); console.log('+140ms  ', JSON.stringify(await rd()))
await p.waitForTimeout(300); console.log('+440ms  ', JSON.stringify(await rd()))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
