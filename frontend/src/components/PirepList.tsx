import { useState } from 'react'
import type { Pirep } from '../types/brief'

interface Props {
  pireps: Pirep[]
}

const TURB_COLOR: Record<string, string> = {
  'Light': 'var(--green)',
  'Light-Moderate': 'var(--yellow)',
  'Moderate': 'var(--yellow)',
  'Moderate-Severe': 'var(--red)',
  'Severe': 'var(--red)',
  'Extreme': 'var(--red)',
}

const ICE_COLOR: Record<string, string> = {
  'Trace': 'var(--blue)',
  'Light': 'var(--blue)',
  'Moderate': 'var(--yellow)',
  'Severe': 'var(--red)',
}

function Badge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{
      fontSize: 9, padding: '2px 6px', borderRadius: 4,
      fontFamily: '"Courier New", monospace',
      background: 'var(--bg-page)', border: '1px solid var(--border-card)',
      color: color ?? 'var(--text-muted)',
    }}>
      {label}: {value}
    </span>
  )
}

export default function PirepList({ pireps }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (pireps.length === 0) return null

  function toggle(idx: number) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(idx) ? n.delete(idx) : n.add(idx)
      return n
    })
  }

  const withTurb = pireps.filter(p => p.turbulence)
  const withIce = pireps.filter(p => p.icing)

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
          <span className="label">PIREPs</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: '"Courier New", monospace' }}>
            {pireps.length}
          </span>
          {withTurb.length > 0 && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
              background: 'var(--yellow-bg)', border: '1px solid var(--yellow-border)', color: 'var(--yellow)',
            }}>
              {withTurb.length} turb
            </span>
          )}
          {withIce.length > 0 && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: '"Courier New", monospace',
              background: 'var(--blue-bg)', border: '1px solid var(--blue-border)', color: 'var(--blue)',
            }}>
              {withIce.length} ice
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label">within ~100nm of route</span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div>
          {pireps.map((p, idx) => {
            const isExpanded = expanded.has(idx)
            const preview = p.raw.length > 110 ? p.raw.slice(0, 110) + '…' : p.raw
            return (
              <div key={idx} style={{ borderBottom: '1px solid var(--border-card)' }}>
                <button
                  onClick={() => toggle(idx)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.location && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
                          {p.location}
                        </span>
                      )}
                      {p.altitude_ft != null && (
                        <Badge label="ALT" value={`${(p.altitude_ft).toLocaleString()}ft`} />
                      )}
                      {p.turbulence && (
                        <Badge label="TURB" value={p.turbulence} color={TURB_COLOR[p.turbulence]} />
                      )}
                      {p.icing && (
                        <Badge label="ICE" value={p.icing} color={ICE_COLOR[p.icing]} />
                      )}
                      {p.temperature_c != null && (
                        <Badge label="TEMP" value={`${p.temperature_c}°C`} />
                      )}
                    </div>
                    <span style={{
                      fontSize: 10, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    }}>
                      {isExpanded ? p.raw : preview}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-subtle)', fontSize: 11, flexShrink: 0 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
