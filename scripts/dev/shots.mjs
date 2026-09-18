// Captures each shot kind so the three silhouettes can be eyeballed.
// A volt lance crosses the arena in under 50ms, so the capture runs the game
// at debug.timeScale 0.12: the same frames, eight times longer on the wall.
import { spawn } from 'node:child_process'
import net from 'node:net'
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const PORT = 4967
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((r)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();r()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']})

// Holds the asked-for buttons until both meters reach their target, and
// leaves them held -- the caller slows the clock before letting go, because
// letting go is what fires.
const holdTo = async (p, {v=0,a=0}) => {
  if (v>0) await p.mouse.down({button:'right'})
  if (a>0) await p.mouse.down({button:'left'})
  let c = {v:0,a:0}
  for (let i=0;i<500;i++){
    c = await p.evaluate(()=>({v:window.__aa.charge.v,a:window.__aa.charge.a}))
    if (c.v>=v-1e-3 && c.a>=a-1e-3) break
    await p.waitForTimeout(60)
  }
  return c
}
const release = async (p, {v=0,a=0}) => {
  if (v>0) await p.mouse.up({button:'right'})
  if (a>0) await p.mouse.up({button:'left'})
}

// Each entry names the frames to keep: a bolt in flight, and for the ball the
// burst as well. At ~10fps under swiftshader the window in which a bolt is
// both downrange and still alive is a frame or two wide, hence the delays.
// The ball is the anti-swarm shot and volts-only bounces off plating, so it
// is fired at swarm; the lance and the beam are shown against armour.
for (const [name, mix, frames, target] of [
  ['volt', {v:1}, [['volt', 60]], 'armored'],
  // The burst frame waits on the hit rather than a delay: which frame the
  // ball lands on moves around with the renderer's mood, and in slow motion
  // the blast is on screen for seconds afterwards.
  ['amp', {a:1}, [['amp', 420], ['amp-blast', 'hit']], 'swarm'],
  ['beam', {v:1,a:1}, [['beam', 60]], 'armored'],
]) {
  const p = await b.newPage({viewport:{width:1280,height:720}})
  await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForSelector('canvas'); await p.waitForTimeout(2400)
  await p.click('[data-testid="start-button"]'); await p.waitForTimeout(1200)
  await p.evaluate((k)=>{ window.__aa.debug.spawnPaused=true; window.__aa.debug.godMode=true
    window.__aa.debug.freezeEnemies=true; window.__aa.debugClearEnemies()
    for (const [d,x] of [[9,0],[11,1.2],[13,-1.2]]) window.__aa.debugSpawnAhead(k, d, x) }, target)
  await p.waitForTimeout(1200)
  await p.evaluate(()=>window.__aa.debugFaceNearest())
  const charged = await holdTo(p, mix)
  await p.evaluate(()=>{ window.__aa.debug.timeScale = 0.12 })
  await release(p, mix)
  let prev = 0
  for (const [label, when] of frames) {
    if (when === 'hit') {
      await p.waitForFunction(()=>window.__aa.stats.enemyHits > 0, null, { timeout: 30000 })
    } else {
      await p.waitForTimeout(when - prev); prev = when
    }
    const live = await p.evaluate(()=>window.__aa.bolts.filter(x=>x.alive)
      .map(x=>({k:x.spec.kind, d:+Math.hypot(x.pos.x-window.__aa.playerState.pos.x, x.pos.z-window.__aa.playerState.pos.z).toFixed(1)})))
    writeFileSync(`shots/kind-${label}.png`, await p.screenshot())
    console.log(label.padEnd(10), String(when).padStart(5), `charged v=${charged.v.toFixed(2)} a=${charged.a.toFixed(2)}`,
      'live', JSON.stringify(live), 'stats', JSON.stringify(await p.evaluate(()=>{const s=window.__aa.stats
      return {hit:s.enemyHits, arc:s.arcHits, world:s.worldImpacts}})))
  }
  await p.close()
}
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
