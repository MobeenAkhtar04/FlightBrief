interface Props {
  decision: 'GO' | 'CAUTION' | 'NOGO'
  reasons: string[]
}

const colors = {
  GO:      { main: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)',  accent: 'var(--green)'  },
  CAUTION: { main: 'var(--yellow)', bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', accent: 'var(--yellow)' },
  NOGO:    { main: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)',    accent: 'var(--red)'    },
}

export default function GoNoGo({ decision, reasons }: Props) {
  const c = colors[decision] ?? colors.NOGO

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${c.border}`,
      borderLeft: `4px solid ${c.main}`,
      background: c.bg,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: c.main,
        }}>
          {decision}
        </span>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: c.main,
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reasons.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: c.accent, flexShrink: 0, marginTop: 1 }}>
              {decision === 'GO' ? '✓' : decision === 'CAUTION' ? '⚠' : '✗'}
            </span>
            <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>{r}</span>
          </div>
        ))}
      </div>

      <div className="label" style={{ marginTop: 14 }}>
        * based on approach type minimums — not for actual flight planning
      </div>
    </div>
  )
}
