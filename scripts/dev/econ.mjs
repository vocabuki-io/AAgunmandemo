import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4921
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:800,height:600}})
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForFunction(()=>!!window.__aa, null, {timeout:30000})
console.log(JSON.stringify(await p.evaluate(()=>window.__aa.analyseEconomy()), null, 1))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
