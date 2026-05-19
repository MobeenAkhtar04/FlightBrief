import { useState } from 'react'
import type { SigmetAirmet as SigmetAirmetType } from '../types/brief'

interface Props {
  items: SigmetAirmetType[]
}

const HAZARD_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  TS:        { bg: 'var(--red-bg)',    border: 'var(--red-border)',    text: 'var(--red)'    },
  TURB:      { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
  ICE:       { bg: 'var(--blue-bg)',   border: 'var(--blue-border)',   text: 'var(--blue)'   },
  IFR:       { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
  MTN_OBSCN: { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
  DEFAULT:   { bg: 'var(--bg-page)',   border: 'var(--border-card)',   text: 'var(--text-muted)' },
}

const HAZARD_LABEL: Record<string, string> = {
  TS: 'Thunderstorms', TURB: 'Turbulence', ICE: 'Icing',
  IFR: 'IFR Conditions', MTN_OBSCN: 'Mtn Obscuration',
  LLWS: 'Low-Level Wind Shear', ASH: 'Volcanic Ash',
}

export default function SigmetAirmet({ items }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (items.length === 0) return null

  const sigmets = items.filter(i => i.type === 'SIGMET')
  const airmets = items.filter(i => i.type !== 'SIGMET')

  function toggle(idx: number) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(idx) ? n.delete(idx) : n.add(idx)
      return n
    })
  }

  return (
    <div className="card">
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border-card)' : 'none', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label">SIGMETs / AIRMETs</span>
          {sigmets.length > 0 && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
              background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)',
            }}>
              {sigmets.length} SIGMET{sigmets.length !== 1 ? 's' : ''}
            </span>
          )}
          {airmets.length > 0 && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
              background: 'var(--yellow-bg)', border: '1px solid var(--yellow-border)', color: 'var(--yellow)',
            }}>
              {airmets.length} AIRMET{airmets.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div>
          {items.map((item, idx) => {
            const c = HAZARD_COLORS[item.hazard] ?? HAZARD_COLORS.DEFAULT
            const hazardLabel = HAZARD_LABEL[item.hazard] ?? item.hazard
            const isExpanded = expanded.has(idx)
            const preview = item.raw.length > 120 ? item.raw.slice(0, 120) + '…' : item.raw
            return (
              <div key={idx} style={{ borderBottom: '1px solid var(--border-card)' }}>
                <button
                  onClick={() => toggle(idx)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
                    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {item.type}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
                    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {hazardLabel}
                  </span>
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    flex: 1,
                  }}>
                    {isExpanded ? item.raw : preview}
                  </span>
                  <span style={{ color: 'var(--text-subtle)', fontSize: 11, flexShrink: 0 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
                {isExpanded && item.valid_from && (
                  <div style={{ margin: '0 14px 10px', fontSize: 10, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
                    Valid {item.valid_from} – {item.valid_to}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
