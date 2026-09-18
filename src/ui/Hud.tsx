import { useEffect, useRef } from 'react'
import { BATTERY, PLAYER, WAVES } from '../config'
import { charge, playerState } from '../game/runtime'
import { useGame } from '../store'

const CELL_W = 15
const CELL_H = 34

/** Cyan while healthy, amber as it drains, red when nearly flat. */
function cellColor(frac: number) {
  if (frac > 0.6) return '#22e6ff'
  if (frac > 0.28) return '#ffd23f'
  return '#ff4a4a'
}

function Cell({ frac }: { frac: number }) {
  const c = cellColor(frac)
  return (
    <div style={{ width: CELL_W, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* positive nub */}
      <div style={{ width: 5, height: 3, background: frac > 0.02 ? c : '#3a3129' }} />
      <div style={{
        width: CELL_W, height: CELL_H, border: '1px solid #6b5a41',
        background: '#140f0b', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${Math.max(0, Math.min(1, frac)) * 100}%`,
          background: c, boxShadow: `0 0 8px ${c}`,
          transition: 'height 90ms linear',
        }} />
      </div>
    </div>
  )
}

export function Hud() {
  const hp = useGame((s) => s.hp)
  const chambers = useGame((s) => s.chambers)
  const spares = useGame((s) => s.spares)
  const wave = useGame((s) => s.wave)
  const waveLabel = useGame((s) => s.waveLabel)
  const enemiesLeft = useGame((s) => s.enemiesLeft)
  const score = useGame((s) => s.score)
  const reloading = useGame((s) => s.reloading)
  const log = useGame((s) => s.log)

  const reloadBar = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)

  // Per-frame bits read the runtime directly instead of going through the
  // store: reload progress and the damage flash must not re-render the HUD.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (reloadBar.current) {
        const p = 1 - Math.max(0, charge.reloadTimer) / BATTERY.reloadTime
        reloadBar.current.style.width = `${Math.min(1, p) * 100}%`
      }
      if (flash.current) {
        flash.current.style.opacity = String(Math.min(0.55, playerState.hitFlash * 0.55))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const total = chambers.reduce((a, b) => a + b, 0)
  const lowCylinder = total < BATTERY.unitsPerCell * 1.2

  return (
    <>
      <div ref={flash} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0,
        background: 'radial-gradient(ellipse at center, rgba(255,40,40,0) 35%, rgba(255,30,60,0.95) 100%)',
      }} />

      {/* top centre: just the two numbers that matter */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 26, fontSize: 12, letterSpacing: '0.22em',
        color: '#a99a7e', pointerEvents: 'none', textShadow: '0 0 10px #000',
      }}>
        <span>WAVE <b style={{ color: '#e9dfc8' }}>{wave + 1}</b>/{WAVES.length}</span>
        <span style={{ color: '#ff2f9e' }}>{waveLabel}</span>
        <span>LEFT <b style={{ color: '#e9dfc8' }}>{enemiesLeft}</b></span>
        <span>{String(score).padStart(5, '0')}</span>
      </div>

      {/* bottom left: body and batteries, nothing else */}
      <div style={{
        position: 'absolute', left: 22, bottom: 20, pointerEvents: 'none',
        textShadow: '0 0 10px #000',
      }}>
        <div style={{ fontSize: 10, letterSpacing: '0.3em', color: '#a99a7e', marginBottom: 5 }}>BODY</div>
        <div style={{ width: 6 * (CELL_W + 6) - 6, height: 7, background: '#140f0b', border: '1px solid #6b5a41' }}>
          <div style={{
            height: '100%', width: `${(hp / PLAYER.maxHp) * 100}%`,
            background: hp > 40 ? '#e9dfc8' : '#ff4a4a',
            boxShadow: hp > 40 ? 'none' : '0 0 10px #ff4a4a',
            transition: 'width 140ms linear',
          }} />
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'flex-end' }}>
          {chambers.map((c, i) => <Cell key={i} frac={c / BATTERY.unitsPerCell} />)}
        </div>

        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12, letterSpacing: '0.18em', color: '#a99a7e',
        }}>
          <span>SPARE <b style={{ color: spares > 3 ? '#e9dfc8' : '#ff4a4a' }}>×{spares}</b></span>
          {reloading ? (
            <span style={{ color: '#22e6ff' }}>
              RELOADING
              <span style={{
                display: 'inline-block', width: 54, height: 4, marginLeft: 8,
                background: '#140f0b', border: '1px solid #22e6ff', verticalAlign: 'middle',
              }}>
                <div ref={reloadBar} style={{ height: '100%', width: '0%', background: '#22e6ff' }} />
              </span>
            </span>
          ) : lowCylinder && spares > 0 ? (
            <span style={{ color: '#ffd23f' }}>[R] RELOAD</span>
          ) : null}
        </div>
      </div>

      {/* transient messages, bottom right, max five lines */}
      <div style={{
        position: 'absolute', right: 22, bottom: 22, textAlign: 'right',
        fontSize: 12, letterSpacing: '0.16em', pointerEvents: 'none',
        textShadow: '0 0 10px #000',
      }}>
        {log.map((l) => (
          <div key={l.id} style={{
            color: l.tone === 'warn' ? '#ff4a4a' : l.tone === 'v' ? '#22e6ff' : l.tone === 'a' ? '#ff2f9e' : '#a99a7e',
            marginTop: 3,
          }}>
            {l.text}
          </div>
        ))}
      </div>
    </>
  )
}
