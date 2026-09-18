import { Component, type ErrorInfo, type ReactNode } from 'react'

const wrap: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32,
  background: '#07060a', color: '#e9dfc8', textAlign: 'center', overflow: 'auto',
}

export function FatalPanel({ title, detail, hint }: { title: string; detail?: string; hint?: ReactNode }) {
  return (
    <div style={wrap} data-testid="fatal-panel">
      <div style={{ fontSize: 12, letterSpacing: '0.5em', color: '#ff2f9e' }}>AA GUNMAN</div>
      <h1 style={{ margin: 0, fontSize: 28, color: '#ff4a4a', letterSpacing: '0.12em' }}>{title}</h1>
      {hint && <div style={{ maxWidth: 620, fontSize: 13, lineHeight: 1.9, color: '#a99a7e' }}>{hint}</div>}
      {detail && (
        <pre style={{
          maxWidth: 760, maxHeight: 260, overflow: 'auto', textAlign: 'left', fontSize: 11,
          lineHeight: 1.6, color: '#8d7f67', background: '#120e15', border: '1px solid #33291f',
          padding: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {detail}
        </pre>
      )}
    </div>
  )
}

/**
 * Without this, any throw inside the Canvas subtree unmounts the whole tree and
 * the page goes black with nothing to go on -- which is exactly what a visitor
 * whose browser blocks WebGL was seeing.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AA GUNMAN crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <FatalPanel
        title="CRASHED"
        detail={`${this.state.error.message}\n\n${this.state.error.stack ?? ''}`}
        hint={<>描画の初期化中にエラーが発生しました。下の内容をそのまま伝えてもらえれば直せます。</>}
      />
    )
  }
}

/**
 * Probe for a usable WebGL context up front. Browsers that block it for
 * fingerprinting reasons fail here rather than deep inside three.js, so the
 * message can say what to do about it.
 */
export function checkWebGL(): { ok: true } | { ok: false; reason: string } {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl2') as WebGLRenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null)
    if (!gl) return { ok: false, reason: 'canvas.getContext("webgl2"/"webgl") returned null' }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer'
    return { ok: true, reason: renderer } as { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  }
}
