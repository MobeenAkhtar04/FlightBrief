import { useState } from 'react'
import type { MetarData, TafData, CloudLayer } from '../types/brief'

interface Props {
  metar: MetarData
  label: string
  taf?: TafData
}

const FR_RANK: Record<string, number> = { LIFR: 0, IFR: 1, MVFR: 2, VFR: 3 }

// Ceiling = lowest BKN or OVC layer. FEW/SCT do not count.
function getCeiling(clouds: CloudLayer[]): number | null {
  const layers = (clouds ?? []).filter(c => c.coverage === 'BKN' || c.coverage === 'OVC')
  if (layers.length === 0) return null
  const alts = layers.map(c => c.altitude_ft).filter((a): a is number => a !== null)
  return alts.length > 0 ? Math.min(...alts) : null
}

function frStyle(fr: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    VFR:  { color: 'var(--green)',  background: 'var(--green-bg)',  borderColor: 'var(--green-border)' },
    MVFR: { color: 'var(--yellow)', background: 'var(--yellow-bg)', borderColor: 'var(--yellow-border)' },
    IFR:  { color: 'var(--red)',    background: 'var(--red-bg)',    borderColor: 'var(--red-border)' },
    LIFR: { color: 'var(--purple)', background: 'var(--purple-bg)', borderColor: 'var(--purple-border)' },
  }
  return map[fr] ?? map.VFR
}

function accentColor(fr: string): string {
  return { VFR: 'var(--green)', MVFR: 'var(--yellow)', IFR: 'var(--red)', LIFR: 'var(--purple)' }[fr] ?? 'var(--border-card)'
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

const TREND_CFG = {
  improving:     { icon: '↑', color: 'var(--green)' },
  stable:        { icon: '→', color: 'var(--text-muted)' },
  deteriorating: { icon: '↓', color: 'var(--red)' },
}

function windColor(spd: number) {
  if (spd > 25) return 'var(--red)'
  if (spd > 15) return 'var(--yellow)'
  return 'var(--green)'
}
function visColor(v: number | null) {
  if (v === null) return 'var(--text-muted)'
  if (v < 3) return 'var(--red)'
  if (v < 5) return 'var(--yellow)'
  return 'var(--green)'
}
function ceilColor(c: number | null) {
  if (c === null) return 'var(--text-muted)'
  if (c < 1000) return 'var(--red)'
  if (c < 3000) return 'var(--yellow)'
  return 'var(--green)'
}

function fmtWind(m: MetarData) {
  if (m.wind_variable) return `VRB${String(m.wind_speed).padStart(2,'0')}KT`
  if (m.wind_speed === 0) return 'CALM'
  const d = String(m.wind_dir ?? 0).padStart(3,'0')
  const s = String(m.wind_speed).padStart(2,'0')
  const g = m.wind_gust ? `G${String(m.wind_gust).padStart(2,'0')}` : ''
  return `${d}°/${s}${g}KT`
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: '"Courier New", monospace', fontSize: 13, color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

export default function MetarCard({ metar, label, taf }: Props) {
  const [expanded, setExpanded] = useState(false)
  const trend = taf ? getTrend(taf) : null
  const trendCfg = trend ? TREND_CFG[trend] : null

  const ceiling = getCeiling(metar.clouds)
  const ceilStr = ceiling == null ? 'CLR' : ceiling >= 99999 ? 'UNLIM' : `${ceiling.toLocaleString()}FT`
  const visStr  = metar.visibility_sm == null ? 'N/A' : `${metar.visibility_sm}SM`
  const frS = frStyle(metar.flight_rules)

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderLeft: `3px solid ${accentColor(metar.flight_rules)}`,
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: '1px solid var(--border-card)', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="label">{label}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: '"Courier New", monospace' }}>
            {metar.station_id}
          </span>
          {!expanded && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
              <span style={{ color: windColor(metar.wind_speed) }}>{fmtWind(metar)}</span>
              {' · '}
              <span style={{ color: visColor(metar.visibility_sm) }}>{visStr}</span>
              {' · '}
              <span style={{ color: ceilColor(ceiling) }}>{ceilStr}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {trendCfg && (
            <span style={{ fontSize: 11, color: trendCfg.color, fontFamily: '"Courier New", monospace' }}>
              {trendCfg.icon} {trend}
            </span>
          )}
          <span style={{
            ...frS,
            fontSize: 10, fontWeight: 700, padding: '2px 7px',
            borderRadius: 4, border: '1px solid', fontFamily: '"Courier New", monospace',
            letterSpacing: '0.06em',
          }}>
            {metar.flight_rules}
          </span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <>
          {/* raw */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-card)', background: 'var(--bg-page)' }}>
            <div className="label" style={{ marginBottom: 3 }}>RAW</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {metar.raw}
            </div>
          </div>

          {/* decoded */}
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
            <Row label="WIND"        value={fmtWind(metar)} color={windColor(metar.wind_speed)} />
            <Row label="VISIBILITY"  value={visStr}          color={visColor(metar.visibility_sm)} />
            <Row label="CEILING"     value={ceilStr}         color={ceilColor(ceiling)} />
            <Row label="ALTIMETER"   value={metar.altimeter_inhg != null ? `A${(metar.altimeter_inhg * 100).toFixed(0)}` : 'N/A'} />
            <Row label="TEMP / DEW"  value={`${metar.temperature_c ?? '?'}°C / ${metar.dewpoint_c ?? '?'}°C`} />
            <Row label="OBS TIME"    value={metar.obs_time || 'N/A'} />
          </div>

          {(metar.clouds ?? []).length > 0 && (
            <div style={{ padding: '0 14px 10px' }}>
              <div className="label" style={{ marginBottom: 5 }}>CLOUDS</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(metar.clouds ?? []).map((c, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontFamily: '"Courier New", monospace',
                    color: 'var(--text-primary)', background: 'var(--bg-page)',
                    border: '1px solid var(--border-input)', borderRadius: 4, padding: '2px 7px',
                  }}>
                    {c.coverage}{c.altitude_ft != null ? ` ${c.altitude_ft.toLocaleString()}ft` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(metar.weather_phenomena ?? []).length > 0 && (
            <div style={{ padding: '0 14px 10px' }}>
              <div className="label" style={{ marginBottom: 5 }}>WEATHER</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(metar.weather_phenomena ?? []).map((wx, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontFamily: '"Courier New", monospace',
                    color: 'var(--yellow)', background: 'var(--yellow-bg)',
                    border: '1px solid var(--yellow-border)', borderRadius: 4, padding: '2px 7px',
                  }}>
                    {wx}
                  </span>
                ))}
              </div>
            </div>
          )}

          {metar.remarks && metar.remarks.trim() && (
            <div style={{ padding: '0 14px 12px' }}>
              <div className="label" style={{ marginBottom: 3 }}>REMARKS</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: '"Courier New", monospace' }}>
                {metar.remarks}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
