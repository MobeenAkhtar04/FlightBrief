import { useEffect, useState } from 'react'
import type { BriefResponse } from '../types/brief'
import { useBriefHistory } from '../hooks/useBriefApi'

interface Props {
  onSelect: (brief: BriefResponse) => void
}

function frColor(fr: string): string {
  return { VFR: 'var(--green)', MVFR: 'var(--yellow)', IFR: 'var(--red)', LIFR: 'var(--purple)' }[fr] ?? 'var(--text-muted)'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return iso }
}

const inputStyle: React.CSSProperties = {
  width: 80,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: 6,
  padding: '5px 8px',
  color: 'var(--text-primary)',
  fontFamily: '"Courier New", monospace',
  fontSize: 12,
  outline: 'none',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

export default function BriefHistory({ onSelect }: Props) {
  const { loadHistory, loadSingle, loading, briefings, error } = useBriefHistory()
  const [dep, setDep] = useState('')
  const [arr, setArr] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => { loadHistory() }, [])

  async function handleRowClick(id: string) {
    setSelectedId(id)
    const full = await loadSingle(id)
    if (full) onSelect(full)
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 14px',
    textAlign: 'left',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    fontWeight: 400,
    borderBottom: '1px solid var(--border-card)',
  }

  const tdStyle: React.CSSProperties = {
    padding: '9px 14px',
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    borderBottom: '1px solid var(--border-card)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="label">BRIEFING HISTORY</div>

      <form
        onSubmit={e => { e.preventDefault(); loadHistory(dep || undefined, arr || undefined) }}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}
      >
        <div>
          <div className="label" style={{ marginBottom: 4 }}>DEP</div>
          <input type="text" value={dep} onChange={e => setDep(e.target.value.toUpperCase())} placeholder="KJFK" maxLength={4} style={inputStyle} />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>ARR</div>
          <input type="text" value={arr} onChange={e => setArr(e.target.value.toUpperCase())} placeholder="KBOS" maxLength={4} style={inputStyle} />
        </div>
        <button type="submit" style={{
          padding: '5px 14px', background: 'var(--bg-input)', border: '1px solid var(--border-input)',
          borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
          fontFamily: '"Courier New", monospace', fontSize: 10, letterSpacing: '0.1em',
        }}>FILTER</button>
        <button type="button" onClick={() => { setDep(''); setArr(''); loadHistory() }} style={{
          padding: '5px 14px', background: 'none', border: 'none',
          color: 'var(--text-subtle)', cursor: 'pointer',
          fontFamily: '"Courier New", monospace', fontSize: 10, letterSpacing: '0.1em',
        }}>CLEAR</button>
      </form>

      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>Error: {error}</div>}
      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>loading...</div>}

      {!loading && briefings.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No briefings found. Generate one from the BRIEF tab.
        </div>
      )}

      {!loading && briefings.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['DATE', 'ROUTE', 'DIST', 'TIME', 'DEP FR', 'ARR FR', 'DECISION'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {briefings.map(b => (
                <tr
                  key={b.id}
                  onClick={() => handleRowClick(b.id)}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === b.id ? 'var(--border-card)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--border-card)')}
                  onMouseLeave={e => (e.currentTarget.style.background = selectedId === b.id ? 'var(--border-card)' : 'transparent')}
                >
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11 }}>{formatDate(b.created_at)}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 600 }}>{b.departure} → {b.arrival}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{b.distance_nm?.toFixed(0)} NM</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                    {b.flight_time_hrs ? `${Math.floor(b.flight_time_hrs)}h ${Math.round((b.flight_time_hrs % 1) * 60)}m` : '—'}
                  </td>
                  <td style={{ ...tdStyle, color: frColor(b.departure_flight_rules), fontWeight: 700 }}>{b.departure_flight_rules || '—'}</td>
                  <td style={{ ...tdStyle, color: frColor(b.arrival_flight_rules),   fontWeight: 700 }}>{b.arrival_flight_rules || '—'}</td>
                  <td style={{ ...tdStyle }}>
                    <span style={{ color: b.decision === 'GO' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {b.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
