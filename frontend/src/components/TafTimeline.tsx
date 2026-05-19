import { useState } from 'react'
import type { TafData, TafPeriod } from '../types/brief'

const FR_RANK: Record<string, number> = { LIFR: 0, IFR: 1, MVFR: 2, VFR: 3 }

function frStyle(fr: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    VFR:  { color: 'var(--green)',  background: 'var(--green-bg)',  borderColor: 'var(--green-border)' },
    MVFR: { color: 'var(--yellow)', background: 'var(--yellow-bg)', borderColor: 'var(--yellow-border)' },
    IFR:  { color: 'var(--red)',    background: 'var(--red-bg)',    borderColor: 'var(--red-border)' },
    LIFR: { color: 'var(--purple)', background: 'var(--purple-bg)', borderColor: 'var(--purple-border)' },
  }
  return map[fr] ?? map.VFR
}

const FR_DOT_COLOR: Record<string, string> = {
  VFR: '#3fb950', MVFR: '#d29922', IFR: '#f85149', LIFR: '#bc8cff',
}

function getTrend(taf: TafData): 'improving' | 'stable' | 'deteriorating' {
  const main = taf.periods.filter(p => ['BASE', 'FM', 'BECMG'].includes(p.change_type))
  if (main.length < 2) return 'stable'
  const first = FR_RANK[main[0].flight_rules] ?? 2
  const last  = FR_RANK[main[main.length - 1].flight_rules] ?? 2
  if (last > first) return 'improving'
  if (last < first) return 'deteriorating'
  return 'stable'
}

const CHANGE_LABEL: Record<string, string> = {
  BASE: 'BASE', FM: 'FROM', TEMPO: 'TEMPO', BECMG: 'BECMG', PROB: 'PROB', PROB_TEMPO: 'PROB TEMPO',
}

const TREND_CFG = {
  improving:     { icon: '↑', color: 'var(--green)' },
  stable:        { icon: '→', color: 'var(--text-muted)' },
  deteriorating: { icon: '↓', color: 'var(--red)' },
}

function PeriodRow({ period }: { period: TafPeriod }) {
  const frs = frStyle(period.flight_rules)
  const label = CHANGE_LABEL[period.change_type] ?? period.change_type

  return (
    <div style={{
      borderRadius: 6,
      border: `1px solid ${frs.borderColor as string}`,
      background: frs.background as string,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-muted)', fontFamily: '"Courier New", monospace',
          }}>{label}</span>
          {period.probability && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
              PROB{period.probability}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
            {period.valid_from_display} → {period.valid_to_display}
          </span>
        </div>
        <span style={{
          ...frs,
          fontSize: 10, fontWeight: 700, padding: '1px 7px',
          borderRadius: 4, border: '1px solid', fontFamily: '"Courier New", monospace',
          letterSpacing: '0.06em', flexShrink: 0,
        }}>
          {period.flight_rules}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 16px' }}>
        {(period.wind_speed > 0 || period.wind_variable) && (
          <div style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>WND </span>
            {period.wind_variable
              ? `VRB${period.wind_speed}KT`
              : `${String(period.wind_dir ?? 0).padStart(3,'0')}/${period.wind_speed}${period.wind_gust ? `G${period.wind_gust}` : ''}KT`
            }
          </div>
        )}
        {period.visibility_sm !== null && (
          <div style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>VIS </span>
            {period.visibility_sm >= 10 ? '10+SM' : `${period.visibility_sm}SM`}
          </div>
        )}
        {period.ceiling_ft !== null && (
          <div style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>CEIL </span>
            {period.ceiling_ft >= 99999 ? 'UNLIM' : `${period.ceiling_ft.toLocaleString()}FT`}
          </div>
        )}
      </div>

      {period.weather_phenomena.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {period.weather_phenomena.map((wx, i) => (
            <span key={i} style={{ fontSize: 10, color: 'var(--yellow)', fontFamily: '"Courier New", monospace' }}>{wx}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TafTimeline({ taf, label }: { taf: TafData; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const trend = getTrend(taf)
  const trendCfg = TREND_CFG[trend]
  const mainPeriods = taf.periods.filter(p => ['BASE', 'FM'].includes(p.change_type))

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border-card)' : 'none', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label">{label}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: '"Courier New", monospace' }}>
            {taf.station_id}
          </span>
          {/* FR dot strip */}
          {!expanded && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {mainPeriods.map((p, i) => (
                <div key={i} style={{
                  width: 12, height: 6, borderRadius: 2,
                  background: FR_DOT_COLOR[p.flight_rules] ?? '#8b949e',
                }} title={`${p.change_type}: ${p.flight_rules}`} />
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: trendCfg.color, fontFamily: '"Courier New", monospace' }}>
            {trendCfg.icon} {trend}
          </span>
          <span className="label">{taf.issue_time}</span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-card)', background: 'var(--bg-page)' }}>
            <div className="label" style={{ marginBottom: 3 }}>RAW</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {taf.raw}
            </div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {taf.periods.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No forecast periods decoded</div>
              : taf.periods.map((p, i) => <PeriodRow key={i} period={p} />)
            }
          </div>
        </>
      )}
    </div>
  )
}
