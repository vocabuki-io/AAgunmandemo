const ROWS: [string, string][] = [
  ['WASD', '移動'],
  ['SPACE', 'ジャンプ'],
  ['右クリック 長押し', 'ボルト(V)を溜める — 押すほど視界が絞られる'],
  ['左クリック 長押し', 'アンペア(A)を溜める — 押すほど周囲が放電する'],
  ['両方のボタンを離す', '発射（離す順序は自由。押している間は撃たない）'],
  ['R', 'リロード'],
  ['M', 'ミュート'],
  ['`', '調整パネル'],
]

/** The control list, shared by the title screen and the pause overlay. */
export function Controls({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: compact ? '5px 20px' : '8px 26px',
      fontSize: compact ? 12 : 13, textAlign: 'left', maxWidth: 560,
    }}>
      {ROWS.map(([k, d]) => (
        <div key={k} style={{ display: 'contents' }}>
          <div style={{ color: '#22e6ff', whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>{k}</div>
          <div style={{ color: '#a99a7e' }}>{d}</div>
        </div>
      ))}
    </div>
  )
}

/** The one thing a new player has to understand to spend batteries well. */
export function EconomyNote() {
  return (
    <p style={{
      maxWidth: 560, margin: 0, fontSize: 12, lineHeight: 1.9, color: '#8d7f67',
      borderLeft: '2px solid #ff2f9e', paddingLeft: 14, textAlign: 'left',
    }}>
      電池の消費は <b style={{ color: '#e9dfc8' }}>V × A</b> に比例する。
      片方だけ全開にした弾は安く、<b style={{ color: '#ff2f9e' }}>両方全開の弾は単三1本を一度に使い切る</b>。<br />
      <span style={{ color: '#22e6ff' }}>装甲個体</span>は高いVでしか抜けず、
      <span style={{ color: '#ff2f9e' }}>群れ</span>は高いAの感電でまとめて処理でき、
      <span style={{ color: '#ffd23f' }}>高速個体</span>は溜めている間に距離を詰めてくる。
    </p>
  )
}
