import type { WindsAloftLevel } from '../types/brief'

interface Props {
  dep: WindsAloftLevel[]
  arr: WindsAloftLevel[]
  departure: string
  arrival: string
  cruiseAltFt?: number
}

function windDir(dir: number | null): string {
  if (dir === null) return 'LT&VAR'
  return `${String(dir).padStart(3, '0')}°`
}

function headwindLabel(dir: number | null, speed: number, courseDeg: number): string {
  if (dir === null || speed === 0) return ''
  const angle = ((dir - courseDeg) + 360) % 360
  const hw = Math.round(speed * Math.cos((angle * Math.PI) / 180))
  if (hw > 2) return `${hw}kt HW`
  if (hw < -2) return `${Math.abs(hw)}kt TW`
  return 'crosswind'
}

function AltRow({ level, courseDeg, isCruise }: { level: WindsAloftLevel; courseDeg?: number; isCruise: boolean }) {
  const hw = courseDeg != null ? headwindLabel(level.wind_dir, level.wind_speed, courseDeg) : ''
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 90px 70px 70px auto',
      gap: 8, padding: '5px 12px', alignItems: 'center',
      background: isCruise ? 'var(--blue-bg)' : 'transparent',
      borderLeft: isCruise ? '2px solid var(--blue)' : '2px solid transparent',
    }}>
      <span style={{
        fontFamily: '"Courier New", monospace', fontSize: 11,
        color: isCruise ? 'var(--blue)' : 'var(--text-muted)',
        fontWeight: isCruise ? 700 : 400,
      }}>
        {(level.altitude_ft).toLocaleString()} ft
        {isCruise && <span style={{ fontSize: 9, marginLeft: 4 }}>← cruise</span>}
      </span>
      <span style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: 'var(--text-primary)' }}>
        {windDir(level.wind_dir)} / {level.wind_speed}kt
      </span>
      <span style={{ fontFamily: '"Courier New", monospace', fontSize: 11, color: 'var(--text-muted)' }}>
        {level.temperature_c != null ? `${level.temperature_c > 0 ? '+' : ''}${level.temperature_c}°C` : '—'}
      </span>
      <span style={{
        fontFamily: '"Courier New", monospace', fontSize: 10,
        color: hw.includes('HW') ? 'var(--yellow)' : hw.includes('TW') ? 'var(--green)' : 'var(--text-subtle)',
      }}>
        {hw}
      </span>
    </div>
  )
}

function StationTable({
  levels, label, courseDeg, cruiseAltFt,
}: {
  levels: WindsAloftLevel[]
  label: string
  courseDeg?: number
  cruiseAltFt?: number
}) {
  if (levels.length === 0) return null
  const closestCruise = cruiseAltFt != null
    ? levels.reduce((best, l) => Math.abs(l.altitude_ft - cruiseAltFt) < Math.abs(best.altitude_ft - cruiseAltFt) ? l : best)
    : null

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div className="label" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-card)' }}>
        {label}
      </div>
      {/* column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '80px 90px 70px 70px auto',
        gap: 8, padding: '4px 12px',
      }}>
        {['ALT', 'WIND', 'TEMP', 'COMP', ''].map(h => (
          <span key={h} className="label" style={{ fontSize: 9 }}>{h}</span>
        ))}
      </div>
      {levels.map(l => (
        <AltRow
          key={l.altitude_ft}
          level={l}
          courseDeg={courseDeg}
          isCruise={closestCruise?.altitude_ft === l.altitude_ft}
        />
      ))}
    </div>
  )
}

export default function WindsAloft({ dep, arr, departure, arrival, cruiseAltFt }: Props) {
  if (dep.length === 0 && arr.length === 0) return null

  return (
    <div className="card">
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-card)' }}>
        <span className="label">WINDS ALOFT</span>
        {cruiseAltFt && (
          <span className="label" style={{ marginLeft: 12 }}>cruise {cruiseAltFt.toLocaleString()}ft</span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <StationTable levels={dep} label={`DEPARTURE — ${departure}`} cruiseAltFt={cruiseAltFt} />
        {dep.length > 0 && arr.length > 0 && (
          <div style={{ width: 1, background: 'var(--border-card)', margin: '8px 0' }} />
        )}
        <StationTable levels={arr} label={`ARRIVAL — ${arrival}`} cruiseAltFt={cruiseAltFt} />
      </div>
    </div>
  )
}
