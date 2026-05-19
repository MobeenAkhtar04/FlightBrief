import { useState, useMemo } from 'react'
import type { Notam } from '../types/brief'

interface Props {
  notams: Notam[]
  flightTimeHrs?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  runway:    'RWY',
  taxiway:   'TWY',
  navaid:    'NAV',
  airspace:  'ARSP',
  obstacle:  'OBST',
  procedure: 'PROC',
  lighting:  'LGTS',
  other:     'OTH',
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  runway:    { bg: 'var(--red-bg)',    border: 'var(--red-border)',    text: 'var(--red)'    },
  taxiway:   { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
  navaid:    { bg: 'var(--blue-bg)',   border: 'var(--blue-border)',   text: 'var(--blue)'   },
  airspace:  { bg: 'var(--purple-bg)', border: 'var(--purple-border)', text: 'var(--purple)' },
  obstacle:  { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
  procedure: { bg: 'var(--bg-page)',   border: 'var(--border-card)',   text: 'var(--text-muted)' },
  lighting:  { bg: 'var(--bg-page)',   border: 'var(--border-card)',   text: 'var(--text-muted)' },
  other:     { bg: 'var(--bg-page)',   border: 'var(--border-card)',   text: 'var(--text-subtle)' },
}

function isInWindow(notam: Notam, start: Date, end: Date): boolean {
  const props = notam.raw?.properties ?? notam.raw
  if (!props) return true
  const s = props.effectiveStart ?? props.startTime ?? props.validTimeFrom
  const e = props.effectiveEnd   ?? props.endTime   ?? props.validTimeTo
  if (!s && !e) return true
  const sd = s ? new Date(s) : null
  const ed = e ? new Date(e) : null
  if (sd && ed) return sd <= end && ed >= start
  if (sd)       return sd <= end
  if (ed)       return ed >= start
  return true
}

export default function NotamList({ notams, flightTimeHrs }: Props) {
  const [listOpen, setListOpen] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  function toggle(id: string) {
    setOpen(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const { filtered, etaLabel, hiddenCount } = useMemo(() => {
    if (!flightTimeHrs) return { filtered: notams, etaLabel: null, hiddenCount: 0 }
    const now = new Date()
    const eta = new Date(now.getTime() + flightTimeHrs * 3600 * 1000)
    const ws  = new Date(eta.getTime() - 2 * 3600 * 1000)
    const we  = new Date(eta.getTime() + 3 * 3600 * 1000)
    const etaStr = eta.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + 'Z'
    const f = notams.filter(n => isInWindow(n, ws, we))
    return { filtered: f, etaLabel: `ETA ~${etaStr} · ±2/3hr window`, hiddenCount: notams.length - f.length }
  }, [notams, flightTimeHrs])

  const categories = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of filtered) {
      counts[n.category] = (counts[n.category] ?? 0) + 1
    }
    return counts
  }, [filtered])

  const displayed = activeCategory ? filtered.filter(n => n.category === activeCategory) : filtered

  return (
    <div className="card">
      <button
        onClick={() => setListOpen(!listOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: listOpen ? '1px solid var(--border-card)' : 'none', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label">NOTAMs</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: '"Courier New", monospace' }}>
            {filtered.length}
          </span>
          {hiddenCount > 0 && <span className="label">({hiddenCount} filtered by ETA)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {etaLabel && <span className="label">{etaLabel}</span>}
          <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{listOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      {listOpen && (
        <>
          {/* category filter row */}
          {Object.keys(categories).length > 1 && (
            <div style={{
              display: 'flex', gap: 6, padding: '8px 14px',
              borderBottom: '1px solid var(--border-card)', flexWrap: 'wrap',
            }}>
              <button
                onClick={() => setActiveCategory(null)}
                style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 4,
                  fontFamily: '"Courier New", monospace', cursor: 'pointer',
                  background: activeCategory === null ? 'var(--border-input)' : 'none',
                  border: '1px solid var(--border-input)',
                  color: activeCategory === null ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                ALL ({filtered.length})
              </button>
              {Object.entries(categories).map(([cat, count]) => {
                const c = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other
                const active = activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(active ? null : cat)}
                    style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 4,
                      fontFamily: '"Courier New", monospace', cursor: 'pointer',
                      background: active ? c.bg : 'none',
                      border: `1px solid ${active ? c.border : 'var(--border-input)'}`,
                      color: active ? c.text : 'var(--text-muted)',
                    }}
                  >
                    {CATEGORY_LABELS[cat] ?? cat.toUpperCase()} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {displayed.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No NOTAMs active during your flight window
            </div>
          ) : (
            <div className="notam-list-body">
              {displayed.map(notam => {
                const isOpen = open.has(notam.id)
                const preview = notam.text.length > 130 ? notam.text.slice(0, 130) + '…' : notam.text
                const c = CATEGORY_COLORS[notam.category] ?? CATEGORY_COLORS.other
                return (
                  <div key={notam.id} style={{ borderBottom: '1px solid var(--border-card)' }}>
                    <button
                      onClick={() => toggle(notam.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                        gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, minWidth: 0, alignItems: 'flex-start' }}>
                        <span style={{
                          fontSize: 9, padding: '2px 5px', borderRadius: 3, flexShrink: 0, marginTop: 1,
                          fontFamily: '"Courier New", monospace', background: c.bg,
                          border: `1px solid ${c.border}`, color: c.text,
                        }}>
                          {CATEGORY_LABELS[notam.category] ?? 'OTH'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace', flexShrink: 0 }}>
                          {notam.location}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontFamily: '"Courier New", monospace', flexShrink: 0 }}>
                          {notam.id}
                        </span>
                        <span style={{
                          fontSize: 11, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isOpen ? 'normal' : 'nowrap',
                        }}>
                          {isOpen ? notam.text : preview}
                        </span>
                      </div>
                      <span style={{ color: 'var(--text-subtle)', fontSize: 11, flexShrink: 0 }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{
                        margin: '0 14px 10px', padding: 10,
                        background: 'var(--bg-page)', border: '1px solid var(--border-card)',
                        borderRadius: 6, fontSize: 11, fontFamily: '"Courier New", monospace',
                        color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7,
                      }}>
                        {notam.text}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
