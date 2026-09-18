// Measures the mean absolute frame difference that 12-enemies-on-screen gates
// on, for a given formation. Used to size that gate against a real number
// rather than a guess.
import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4977
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((r)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();r()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']})
const p = await b.newPage({viewport:{width:1280,height:720}})
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(1200)
await p.evaluate(()=>{ window.__aa.debug.spawnPaused=true; window.__aa.debug.godMode=true; window.__aa.debugClearEnemies() })
await p.waitForTimeout(300)

const diff = async (a,b2)=>p.evaluate(async ([x,y])=>{
  const load=async d=>{const bl=await(await fetch('data:image/png;base64,'+d)).blob();const bm=await createImageBitmap(bl)
    const cv=new OffscreenCanvas(bm.width,bm.height);const c=cv.getContext('2d');c.drawImage(bm,0,0)
    return c.getImageData(0,0,bm.width,bm.height).data}
  const [pa,pb]=await Promise.all([load(x),load(y)]);let sum=0
  for(let i=0;i<pa.length;i+=4){sum+=Math.abs((0.2126*pa[i]+0.7152*pa[i+1]+0.0722*pa[i+2])-(0.2126*pb[i]+0.7152*pb[i+1]+0.0722*pb[i+2]))}
  return sum/(pa.length/4)}, [a.toString('base64'), b2.toString('base64')])

const before = await p.screenshot()
await p.evaluate(()=>{
  // Frozen so the geometry is identical regardless of how much game time
  // elapses, and close enough to fill real screen area.
  window.__aa.debug.freezeEnemies = true
  const S = window.__aa.debugSpawnAhead
  S('armored',4.2,-3.0); S('armored',4.4,0); S('armored',4.2,3.0)
  S('armored',6.2,-1.6); S('armored',6.2,1.6)
  S('runner',3.0,-1.5);  S('runner',3.0,1.5)
  S('swarm',2.4,-0.6);   S('swarm',2.4,0.6); S('swarm',3.0,0)
})
// Force the exact CI condition: sample while emerge is still partway.
const emergeAt = async () => p.evaluate(()=>{const a=window.__aa.enemies.filter(e=>e.alive)
  return {n:a.length, min:+Math.min(...a.map(e=>e.emerge)).toFixed(3)}})
for (;;) { const e = await emergeAt(); if (e.min >= 0.99) { console.log('full emerge state:   ', JSON.stringify(e)); break } await p.waitForTimeout(100) }
await p.waitForTimeout(250)
console.log('diff at FULL emerge    :', (await diff(before, await p.screenshot())).toFixed(3))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
