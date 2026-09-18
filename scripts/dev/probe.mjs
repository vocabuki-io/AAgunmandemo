import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4911
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res,rej)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:1280,height:720}})
p.on('console', m=>console.log('  console['+m.type()+']', m.text()))
p.on('pageerror', e=>console.log('  pageerror', e.message))
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(1500)
const snap = async (tag) => {
  const d = await p.evaluate(()=>({yaw:+window.__aa.look.yaw.toFixed(3), pitch:+window.__aa.look.pitch.toFixed(3)}))
  console.log(tag, JSON.stringify(d))
}
await snap('after-start ')
await p.mouse.down({button:'right'}); await snap('after-rdown')
await p.waitForTimeout(1200); await snap('after-hold ')
await p.mouse.up({button:'right'}); await snap('after-rup  ')
await p.waitForTimeout(500)
const d = await p.evaluate(()=>{
  const a = window.__aa
  const st = a.useGame.getState()
  return { player:a.playerState.pos.toArray().map(n=>+n.toFixed(2)),
    grounded:a.playerState.grounded,
    vel:a.playerState.vel.toArray().map(n=>+n.toFixed(2)),
    cam:a.camState.pos.toArray().map(n=>+n.toFixed(2)),
    camdir:a.camState.dir.toArray().map(n=>+n.toFixed(3)),
    look:{yaw:+a.look.yaw.toFixed(3),pitch:+a.look.pitch.toFixed(3)},
    locked: document.pointerLockElement!==null,
    phase: st.phase }
})
console.log(JSON.stringify(d,null,1))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
