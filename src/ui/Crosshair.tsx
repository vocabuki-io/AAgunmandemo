import { useEffect, useRef } from 'react'
import { charge } from '../game/runtime'

/**
 * Four ticks and a dot. It tightens as volts build and flares as amperes do,
 * which is the only place the two knobs are quantified -- deliberately as a
 * feel, not a number.
 */
export function Crosshair() {
  const box = useRef<HTMLDivElement>(null)
  const ticks = useRef<HTMLDivElement[]>([])
  const dot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const spread = 11 - charge.vSmooth * 7 + charge.aSmooth * 9
      const len = 6 + charge.aSmooth * 8
      for (let i = 0; i < ticks.current.length; i++) {
        const el = ticks.current[i]
        if (!el) continue
        const horiz = i < 2
        const sign = i % 2 === 0 ? -1 : 1
        el.style.width = horiz ? `${len}px` : '2px'
        el.style.height = horiz ? '2px' : `${len}px`
        el.style.transform = horiz
          ? `translate(${sign * spread - (sign < 0 ? len : 0)}px, -1px)`
          : `translate(-1px, ${sign * spread - (sign < 0 ? len : 0)}px)`
        el.style.background = charge.aSmooth > charge.vSmooth ? '#ff2f9e' : '#22e6ff'
      }
      if (dot.current) {
        const k = 1 + charge.vSmooth * 1.4
        dot.current.style.transform = `translate(-50%,-50%) scale(${k})`
        dot.current.style.opacity = charge.cooldown > 0 ? '0.25' : '0.95'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={box} style={{
      position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none',
    }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          ref={(el) => { if (el) ticks.current[i] = el }}
          style={{ position: 'absolute', background: '#22e6ff', boxShadow: '0 0 6px currentColor' }}
        />
      ))}
      <div ref={dot} style={{
        position: 'absolute', left: 0, top: 0, width: 3, height: 3, borderRadius: '50%',
        background: '#e9dfc8', boxShadow: '0 0 8px #22e6ff',
      }} />
    </div>
  )
}
