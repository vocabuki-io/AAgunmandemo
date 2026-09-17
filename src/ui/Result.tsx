import { BATTERY } from '../config'
import { initAudio } from '../game/audio'
import { stats } from '../game/runtime'
import { useGame } from '../store'

const wrap: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
  background: 'radial-gradient(ellipse at 50% 55%, rgba(8,5,12,0.55) 0%, rgba(5,3,8,0.94) 70%)',
  letterSpacing: '0.1em',
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: 320, fontSize: 13 }}>
      <span style={{ color: '#8d7f67' }}>{k}</span>
      <span style={{ color: '#e9dfc8' }}>{v}</span>
    </div>
  )
}

export function Result() {
  const phase = useGame((s) => s.phase)
  const score = useGame((s) => s.score)
  const wave = useGame((s) => s.wave)
  const spares = useGame((s) => s.spares)
  const shotsFired = useGame((s) => s.shotsFired)
  const spentUnits = useGame((s) => s.spentUnits)
  const deathReason = useGame((s) => s.deathReason)
  const startRun = useGame((s) => s.start)
  const start = () => { initAudio(); startRun() }

  const won = phase === 'won'
  const perShot = shotsFired > 0 ? (spentUnits / shotsFired).toFixed(1) : '0.0'

  return (
    <div style={wrap}>
      <h1 style={{
        margin: 0, fontSize: 54, color: won ? '#22e6ff' : '#ff4a4a',
        textShadow: won ? '0 0 34px rgba(34,230,255,0.6)' : '0 0 34px rgba(255,74,74,0.5)',
      }}>
        {won ? 'LAST ONE STANDING' : 'DOWN'}
      </h1>
      {!won && (
        <div style={{ color: '#a99a7e', fontSize: 13, letterSpacing: '0.3em' }}>{deathReason}</div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Row k="SCORE" v={String(score).padStart(5, '0')} />
        <Row k="WAVE REACHED" v={wave + 1} />
        <Row k="KILLS" v={stats.enemyKills} />
        <Row k="SHOTS" v={shotsFired} />
        {/* The number that says whether you were picking your shots: a
            full-power shot costs 100, a well-chosen one costs single digits. */}
        <Row k="AVG COST / SHOT" v={`${perShot} u`} />
        <Row k="CELLS SPENT" v={(spentUnits / BATTERY.unitsPerCell).toFixed(1)} />
        <Row k="SPARES LEFT" v={spares} />
      </div>

      <button
        data-testid="restart-button"
        onClick={start}
        style={{
          marginTop: 22, padding: '13px 40px', fontFamily: 'inherit', fontSize: 16,
          letterSpacing: '0.3em', color: '#07060a', background: '#e9dfc8', border: 'none',
          cursor: 'pointer', boxShadow: '0 0 26px rgba(233,223,200,0.35)',
        }}
      >
        AGAIN
      </button>
    </div>
  )
}
