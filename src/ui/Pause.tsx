import { Controls } from './Controls'
import { useGame } from '../store'

/**
 * Losing pointer lock (Escape, alt-tab) used to leave the game running while
 * the player could no longer aim. It now stops the world and says so.
 */
export function Pause({ onResume }: { onResume: () => void }) {
  const hp = useGame((s) => s.hp)
  const spares = useGame((s) => s.spares)

  return (
    <div
      data-testid="pause-overlay"
      onClick={onResume}
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 22, cursor: 'pointer',
        background: 'rgba(6,4,10,0.82)', letterSpacing: '0.08em',
      }}
    >
      <div style={{ fontSize: 34, color: '#e9dfc8', letterSpacing: '0.35em' }}>HOLSTERED</div>
      <div style={{ fontSize: 12, color: '#a99a7e', letterSpacing: '0.3em' }}>
        BODY {hp} ／ SPARE ×{spares}
      </div>
      <Controls compact />
      <div
        data-testid="resume-button"
        style={{
          marginTop: 6, padding: '11px 34px', fontSize: 14, letterSpacing: '0.3em',
          color: '#07060a', background: '#22e6ff', boxShadow: '0 0 24px rgba(34,230,255,0.55)',
        }}
      >
        CLICK TO RESUME
      </div>
    </div>
  )
}
