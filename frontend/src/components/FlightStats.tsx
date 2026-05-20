import type { FlightStats as FlightStatsType, FuelStatus, FuelUnit } from '../types/brief'

const LBS_PER_GAL = 6.0
const L_PER_GAL = 3.785

function galToUnit(gal: number, unit: FuelUnit): number {
  if (unit === 'LBS') return gal * LBS_PER_GAL
  if (unit === 'L') return gal * L_PER_GAL
  return gal
}

function fuelLabel(unit: FuelUnit): string {
  if (unit === 'LBS') return 'lbs'
  if (unit === 'L') return 'L'
  return 'gal'
}

interface Props {
  stats: FlightStatsType
  departure: string
  arrival: string
  aircraftLabel?: string
  maxRangeNm?: number
  fuelUnit?: FuelUnit
}

function bearingToCompass(deg: number): string {
  const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return pts[Math.round(deg / 22.5) % 16]
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, fontFamily: '"Courier New", monospace',
        color: warn ? 'var(--yellow)' : 'var(--text-primary)',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function FuelBadge({ fuel, unit = 'GAL' }: { fuel: FuelStatus; unit?: FuelUnit }) {
  const colors = {
    OK:   { bg: 'var(--green-bg)',  border: 'var(--green-border)',  text: 'var(--green)'  },
    LOW:  { bg: 'var(--yellow-bg)', border: 'var(--yellow-border)', text: 'var(--yellow)' },
    NOGO: { bg: 'var(--red-bg)',    border: 'var(--red-border)',    text: 'var(--red)'    },
  }
  const c = colors[fuel.status]
  const icon = fuel.status === 'OK' ? '✓' : fuel.status === 'LOW' ? '⚠' : '✗'
  return (
    <div style={{
      marginTop: 14, padding: '10px 14px', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`,
      display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: '"Courier New", monospace', fontWeight: 700, color: c.text, fontSize: 12 }}>
        {icon} FUEL {fuel.status}
      </span>
      {[
        { label: 'Usable',       value: `${galToUnit(fuel.usable_gal, unit).toFixed(1)}${fuelLabel(unit)}` },
        { label: 'Burn',         value: `${galToUnit(fuel.burn_gal, unit).toFixed(1)}${fuelLabel(unit)}` },
        { label: 'Reserve',      value: `${galToUnit(fuel.reserve_gal, unit).toFixed(1)}${fuelLabel(unit)}` },
        { label: 'Reserve time', value: `${Math.max(0, fuel.reserve_min).toFixed(0)}min` },
        { label: 'Required',     value: `${fuel.required_reserve_min}min` },
      ].map(({ label, value }) => (
        <div key={label} style={{ fontSize: 11, fontFamily: '"Courier New", monospace' }}>
          <span style={{ color: 'var(--text-muted)' }}>{label} </span>
          <span style={{ color: 'var(--text-primary)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

export default function FlightStats({ stats, departure, arrival, aircraftLabel, maxRangeNm, fuelUnit = 'GAL' }: Props) {
  const rangeExceeded = maxRangeNm != null && stats.distance_nm > maxRangeNm
  const hasSunrise = stats.sunrise_dep || stats.sunrise_arr

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="label">FLIGHT STATS</div>
        <div className="label">{departure} → {arrival}</div>
      </div>

      {/* primary stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Stat label="DISTANCE" value={`${stats.distance_nm.toFixed(0)} NM`} />
        <Stat label="BEARING" value={`${stats.bearing_deg.toFixed(0)}°`} sub={bearingToCompass(stats.bearing_deg)} />
        <Stat label="EST TIME" value={stats.flight_time_display} />
        <Stat label={`FUEL (+10%)`} value={`${galToUnit(stats.fuel_burn_gal, fuelUnit).toFixed(1)} ${fuelLabel(fuelUnit).toUpperCase()}`} />
      </div>

      {/* density altitude + sunrise rows */}
      {(stats.density_alt_dep != null || stats.density_alt_arr != null || hasSunrise) && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-card)',
        }}>
          {stats.density_alt_dep != null && (
            <Stat
              label="DEP DENSITY ALT"
              value={`${stats.density_alt_dep.toLocaleString()} ft`}
              warn={stats.density_alt_dep > 5000}
              sub={stats.density_alt_dep > 5000 ? 'High — check perf charts' : undefined}
            />
          )}
          {stats.density_alt_arr != null && (
            <Stat
              label="ARR DENSITY ALT"
              value={`${stats.density_alt_arr.toLocaleString()} ft`}
              warn={stats.density_alt_arr > 5000}
              sub={stats.density_alt_arr > 5000 ? 'High — check perf charts' : undefined}
            />
          )}
          {stats.sunrise_dep && (
            <Stat label="DEP SUNRISE" value={stats.sunrise_dep} sub="UTC" />
          )}
          {stats.sunset_dep && (
            <Stat label="DEP SUNSET" value={stats.sunset_dep} sub="UTC" />
          )}
        </div>
      )}

      {stats.sunrise_arr && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-card)',
        }}>
          {stats.sunrise_arr && <Stat label="ARR SUNRISE" value={stats.sunrise_arr} sub="UTC" />}
          {stats.sunset_arr  && <Stat label="ARR SUNSET"  value={stats.sunset_arr}  sub="UTC" />}
        </div>
      )}

      {rangeExceeded && (
        <div style={{
          marginTop: 14, padding: '8px 12px', borderRadius: 6,
          background: 'var(--yellow-bg)', border: '1px solid var(--yellow-border)',
          fontSize: 11, color: 'var(--yellow)', fontFamily: '"Courier New", monospace',
        }}>
          ⚠ {aircraftLabel ?? 'Selected aircraft'} max range ~{maxRangeNm!.toLocaleString()} NM — route is {stats.distance_nm.toFixed(0)} NM, fuel stop required
        </div>
      )}

      {stats.fuel_status && <FuelBadge fuel={stats.fuel_status} unit={fuelUnit} />}
    </div>
  )
}
