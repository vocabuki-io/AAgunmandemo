import { spawn } from 'node:child_process'
import net from 'node:net'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const PORT = 4941
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:1280,height:720}})
p.on('pageerror', e=>console.log('pageerror:', e.message))
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(3000)
await p.evaluate(()=>{ window.__aa.debug.spawnPaused=true; window.__aa.debug.godMode=true; window.__aa.debugClearEnemies()
  window.__aa.debugSpawnAhead('armored', 11, -4); window.__aa.debugSpawnAhead('runner', 8, 2.5)
  window.__aa.debugSpawnAhead('swarm', 6, -1.5); window.__aa.debugSpawnAhead('swarm', 7, 0.8)
})
const yaw = Number(process.argv[2] ?? 0)
await p.evaluate((y)=>{ window.__aa.look.yaw = y; window.__aa.look.pitch = -0.08 }, yaw)
await p.waitForTimeout(2500)
writeFileSync('shots/look.png', await p.screenshot())
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
