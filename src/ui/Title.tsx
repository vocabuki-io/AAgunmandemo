import { initAudio } from '../game/audio'
import { useGame } from '../store'
import { Controls, EconomyNote } from './Controls'

const wrap: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 20,
  background: 'radial-gradient(ellipse at 50% 56%, rgba(10,6,16,0.32) 0%, rgba(6,4,10,0.93) 74%)',
  textAlign: 'center', letterSpacing: '0.08em', overflowY: 'auto', padding: '32px 24px',
}

export function Title() {
  const startRun = useGame((s) => s.start)
  // The audio context has to be created inside a real user gesture.
  const start = () => { initAudio(); startRun() }

  return (
    <div style={wrap}>
      <div style={{ fontSize: 12, color: '#ff2f9e', letterSpacing: '0.5em' }}>ALKALINE ARENA</div>
      <h1 style={{
        margin: 0, fontSize: 64, lineHeight: 1, color: '#e9dfc8',
        textShadow: '0 0 24px rgba(34,230,255,0.55), 0 0 60px rgba(255,47,158,0.35)',
      }}>
        AA GUNMAN
      </h1>
      <p style={{ maxWidth: 560, color: '#a99a7e', fontSize: 13, lineHeight: 1.9, margin: 0 }}>
        単三電池をリボルバーに装填して撃つ。弾は電気。<br />
        <span style={{ color: '#22e6ff' }}>ボルト</span>は押し出す力、
        <span style={{ color: '#ff2f9e' }}>アンペア</span>は流す量。
      </p>

      <Controls />
      <EconomyNote />

      <button
        data-testid="start-button"
        onClick={start}
        style={{
          marginTop: 6, padding: '14px 44px', fontFamily: 'inherit', fontSize: 18,
          letterSpacing: '0.3em', color: '#07060a', background: '#22e6ff', border: 'none',
          cursor: 'pointer', boxShadow: '0 0 30px rgba(34,230,255,0.6)',
        }}
      >
        DRAW
      </button>
      <div style={{ fontSize: 11, color: '#6b6152', letterSpacing: '0.2em' }}>
        6 WAVES ／ 電池が尽きたら終わり
      </div>
    </div>
  )
}
