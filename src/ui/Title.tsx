import { initAudio } from '../game/audio'
import { useGame } from '../store'

const wrap: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 22,
  background: 'radial-gradient(ellipse at 50% 58%, rgba(10,6,16,0.35) 0%, rgba(6,4,10,0.9) 72%)',
  textAlign: 'center', letterSpacing: '0.08em',
}

export function Title() {
  const startRun = useGame((s) => s.start)
  // The audio context has to be created inside a real user gesture.
  const start = () => { initAudio(); startRun() }
  return (
    <div style={wrap}>
      <div style={{ fontSize: 13, color: '#ff2f9e', letterSpacing: '0.5em' }}>ALKALINE ARENA</div>
      <h1 style={{
        margin: 0, fontSize: 68, lineHeight: 1, color: '#e9dfc8',
        textShadow: '0 0 24px rgba(34,230,255,0.55), 0 0 60px rgba(255,47,158,0.35)',
      }}>
        AA GUNMAN
      </h1>
      <p style={{ maxWidth: 560, color: '#a99a7e', fontSize: 14, lineHeight: 1.9, margin: 0 }}>
        単三電池をシリンダーに込めて撃つ。<br />
        右クリックで<span style={{ color: '#22e6ff' }}>ボルト</span>、左クリックで
        <span style={{ color: '#ff2f9e' }}>アンペア</span>を溜め、<br />
        両方のボタンを離した瞬間に発射する。
      </p>
      <button
        data-testid="start-button"
        onClick={start}
        style={{
          marginTop: 8, padding: '14px 44px', fontFamily: 'inherit', fontSize: 18,
          letterSpacing: '0.3em', color: '#07060a', background: '#22e6ff', border: 'none',
          cursor: 'pointer', boxShadow: '0 0 30px rgba(34,230,255,0.6)',
        }}
      >
        DRAW
      </button>
    </div>
  )
}
