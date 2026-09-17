import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'
const PORT = 4951
const s = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { cwd:'/home/user/AAgunmandemo', stdio:'ignore', detached:true })
await new Promise((res)=>{const t=()=>{const k=net.connect(PORT,'127.0.0.1');k.once('connect',()=>{k.destroy();res()});k.once('error',()=>{k.destroy();setTimeout(t,200)})};t()})
const b = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const p = await b.newPage({viewport:{width:1280,height:720}})
p.on('pageerror', e=>console.log('pageerror:', e.message))
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.click('[data-testid="start-button"]'); await p.waitForTimeout(2500)
await p.evaluate(()=>{ window.__keys=[]; window.addEventListener('keydown', e=>window.__keys.push(e.code), true) })
await p.keyboard.press('`'); await p.waitForTimeout(1200)
console.log('keys seen:', await p.evaluate(()=>window.__keys))
console.log('body children:', await p.evaluate(()=>[...document.body.children].map(c=>c.tagName+'#'+c.id+'.'+c.className)))
console.log('root children:', await p.evaluate(()=>[...document.getElementById('root').children].map(c=>c.tagName+'#'+c.id+'.'+(typeof c.className==='string'?c.className:''))))
console.log('leva ids:', await p.evaluate(()=>[...document.querySelectorAll('[id*="leva"]')].map(e=>e.tagName+'#'+e.id).slice(0,8)))
console.log('leva top classes:', await p.evaluate(()=>[...document.querySelectorAll('[class*="leva"]')].slice(0,4).map(e=>e.className)))
console.log('titlebar text:', await p.evaluate(()=>document.body.innerText.includes('TUNING')))
await b.close(); try{process.kill(-s.pid,'SIGTERM')}catch{}
