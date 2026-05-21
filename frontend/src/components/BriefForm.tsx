import { useState, FormEvent } from 'react'
import type { FuelUnit } from '../types/brief'

const LBS_PER_GAL = 6.0
const L_PER_GAL = 3.785

function galToUnit(gal: number, unit: FuelUnit): number {
  if (unit === 'LBS') return gal * LBS_PER_GAL
  if (unit === 'L') return gal * L_PER_GAL
  return gal
}

function unitToGal(val: number, unit: FuelUnit): number {
  if (unit === 'LBS') return val / LBS_PER_GAL
  if (unit === 'L') return val / L_PER_GAL
  return val
}

export interface BriefFormData {
  departure: string
  arrival: string
  alternate?: string
  cruise_speed_kts: number
  fuel_flow_gph: number
  usable_fuel_gal?: number
  cruise_alt_ft?: number
  dep_runway_heading?: number
  arr_runway_heading?: number
  aircraft_label?: string
  max_range_nm?: number
  approach_type?: string
}

interface Props {
  onSubmit: (data: BriefFormData) => void
  loading: boolean
  onFuelUnitChange?: (unit: FuelUnit) => void
}

interface AircraftPreset {
  label: string
  speed: string
  fuel: string
  range: number | null
  usableFuel: number | null
  cruiseAlt: number
}

const PRESETS: AircraftPreset[] = [
  { label: 'Cessna 172',              speed: '122',  fuel: '8.5',  range: 800,   usableFuel: 40,   cruiseAlt: 8000  },
  { label: 'Piper PA-28',             speed: '130',  fuel: '9.0',  range: 700,   usableFuel: 48,   cruiseAlt: 8000  },
  { label: 'Beechcraft King Air 350', speed: '310',  fuel: '95',   range: 1800,  usableFuel: 539,  cruiseAlt: 27000 },
  { label: 'Pilatus PC-12',           speed: '270',  fuel: '65',   range: 1800,  usableFuel: 412,  cruiseAlt: 28000 },
  { label: 'Bombardier Q400',         speed: '360',  fuel: '280',  range: 1500,  usableFuel: 6500, cruiseAlt: 25000 },
  { label: 'Airbus A320',             speed: '450',  fuel: '800',  range: 3700,  usableFuel: 6300, cruiseAlt: 35000 },
  { label: 'Boeing 737-800',          speed: '460',  fuel: '850',  range: 2900,  usableFuel: 6875, cruiseAlt: 35000 },
  { label: 'Custom',                  speed: '',     fuel: '',     range: null,  usableFuel: null, cruiseAlt: 5000  },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: 6,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: '"Courier New", monospace',
  fontSize: 12,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export default function BriefForm({ onSubmit, loading, onFuelUnitChange }: Props) {
  const [dep, setDep] = useState('')
  const [arr, setArr] = useState('')
  const [alt, setAlt] = useState('')
  const [speed, setSpeed] = useState('122')
  const [fuel, setFuel] = useState('8.5')
  const [usableFuel, setUsableFuel] = useState('40')
  const [cruiseAlt, setCruiseAlt] = useState('8000')
  const [depRwy, setDepRwy] = useState('')
  const [arrRwy, setArrRwy] = useState('')
  const [approachType, setApproachType] = useState('visual')
  const [showAdv, setShowAdv] = useState(false)
  const [presetIdx, setPresetIdx] = useState(0)
  const [fuelUnit, setFuelUnit] = useState<FuelUnit>('GAL')

  function handleUnitChange(unit: FuelUnit) {
    const ffGal = unitToGal(parseFloat(fuel) || 0, fuelUnit)
    const ufGal = unitToGal(parseFloat(usableFuel) || 0, fuelUnit)
    setFuel(galToUnit(ffGal, unit).toFixed(2))
    setUsableFuel(galToUnit(ufGal, unit).toFixed(1))
    setFuelUnit(unit)
    onFuelUnitChange?.(unit)
  }

  function handlePresetChange(idx: number) {
    setPresetIdx(idx)
    const p = PRESETS[idx]
    if (p.label !== 'Custom') {
      setSpeed(p.speed)
      setFuel(galToUnit(parseFloat(p.fuel), fuelUnit).toFixed(2))
      if (p.usableFuel != null) setUsableFuel(galToUnit(p.usableFuel, fuelUnit).toFixed(1))
      setCruiseAlt(String(p.cruiseAlt))
    }
  }

  function handleSpeedChange(val: string) {
    setSpeed(val)
    const match = PRESETS.findIndex((p, i) => i !== PRESETS.length - 1 && p.speed === val && p.fuel === fuel)
    setPresetIdx(match >= 0 ? match : PRESETS.length - 1)
  }

  function handleFuelChange(val: string) {
    setFuel(val)
    const match = PRESETS.findIndex((p, i) => i !== PRESETS.length - 1 && p.fuel === val && p.speed === speed)
    setPresetIdx(match >= 0 ? match : PRESETS.length - 1)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dep.trim() || !arr.trim()) return
    const p = PRESETS[presetIdx]
    onSubmit({
      departure: dep.trim().toUpperCase(),
      arrival: arr.trim().toUpperCase(),
      alternate: alt.trim() ? alt.trim().toUpperCase() : undefined,
      cruise_speed_kts: parseFloat(speed) || 122,
      fuel_flow_gph: unitToGal(parseFloat(fuel) || galToUnit(8.5, fuelUnit), fuelUnit),
      usable_fuel_gal: usableFuel ? unitToGal(parseFloat(usableFuel), fuelUnit) : undefined,
      cruise_alt_ft: cruiseAlt ? parseInt(cruiseAlt) : 5000,
      dep_runway_heading: depRwy ? parseFloat(depRwy) : undefined,
      arr_runway_heading: arrRwy ? parseFloat(arrRwy) : undefined,
      aircraft_label: p.label !== 'Custom' ? p.label : undefined,
      max_range_nm: p.range ?? undefined,
      approach_type: approachType,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: '18px 20px' }}>
      <div className="label" style={{ marginBottom: 12 }}>ROUTE</div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div className="label" style={{ marginBottom: 5 }}>DEPARTURE</div>
          <input
            type="text" value={dep}
            onChange={e => setDep(e.target.value.toUpperCase())}
            placeholder="KDEP" maxLength={4} required
            style={{ ...inputStyle, fontSize: 20, letterSpacing: '0.14em', padding: '9px 12px' }}
          />
        </div>

        <div style={{ color: 'var(--text-subtle)', fontSize: 18, paddingBottom: 9 }}>→</div>

        <div style={{ flex: 1, minWidth: 100 }}>
          <div className="label" style={{ marginBottom: 5 }}>ARRIVAL</div>
          <input
            type="text" value={arr}
            onChange={e => setArr(e.target.value.toUpperCase())}
            placeholder="KARR" maxLength={4} required
            style={{ ...inputStyle, fontSize: 20, letterSpacing: '0.14em', padding: '9px 12px' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 100 }}>
          <div className="label" style={{ marginBottom: 5 }}>ALTERNATE <span style={{ color: 'var(--text-subtle)' }}>(opt)</span></div>
          <input
            type="text" value={alt}
            onChange={e => setAlt(e.target.value.toUpperCase())}
            placeholder="KALT" maxLength={4}
            style={{ ...inputStyle, fontSize: 20, letterSpacing: '0.14em', padding: '9px 12px' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !dep || !arr}
          style={{
            padding: '9px 22px',
            background: loading || !dep || !arr ? 'var(--border-card)' : 'var(--blue)',
            color: loading || !dep || !arr ? 'var(--text-subtle)' : '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading || !dep || !arr ? 'not-allowed' : 'pointer',
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            whiteSpace: 'nowrap' as const,
            fontWeight: 700,
          }}
        >
          {loading ? 'LOADING...' : 'GET BRIEF'}
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setShowAdv(!showAdv)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: '"Courier New", monospace',
            fontSize: 10, letterSpacing: '0.08em', padding: 0,
          }}
        >
          {showAdv ? '▼' : '▶'} AIRCRAFT & PERFORMANCE
        </button>

        {showAdv && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>AIRCRAFT TYPE</div>
                <select
                  value={presetIdx}
                  onChange={e => handlePresetChange(Number(e.target.value))}
                  style={selectStyle}
                >
                  {PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>APPROACH TYPE</div>
                <select value={approachType} onChange={e => setApproachType(e.target.value)} style={selectStyle}>
                  <option value="visual">Visual</option>
                  <option value="rnav">RNAV / GPS</option>
                  <option value="ils">ILS</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'CRUISE SPEED (kts)', val: speed, set: handleSpeedChange, step: '1',   min: '50' },
                {
                  label: fuelUnit === 'GAL' ? 'FUEL FLOW (gph)' : fuelUnit === 'LBS' ? 'FUEL FLOW (lbs/hr)' : 'FUEL FLOW (L/hr)',
                  val: fuel, set: handleFuelChange, step: '0.1', min: '1',
                },
                { label: 'CRUISE ALT (ft)',    val: cruiseAlt, set: setCruiseAlt,  step: '500', min: '1000' },
              ].map(({ label, val, set, ...rest }) => (
                <div key={label}>
                  <div className="label" style={{ marginBottom: 5 }}>{label}</div>
                  <input type="number" {...rest} value={val} onChange={e => set(e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div className="label">
                    USABLE FUEL ({fuelUnit === 'GAL' ? 'gal' : fuelUnit === 'LBS' ? 'lbs' : 'L'})
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {(['GAL', 'LBS', 'L'] as FuelUnit[]).map(u => (
                      <button
                        key={u} type="button"
                        onClick={() => handleUnitChange(u)}
                        style={{
                          background: fuelUnit === u ? 'var(--blue)' : 'var(--bg-input)',
                          border: '1px solid var(--border-input)',
                          borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
                          color: fuelUnit === u ? '#fff' : 'var(--text-muted)',
                          fontFamily: '"Courier New", monospace', fontSize: 9,
                          letterSpacing: '0.06em',
                        }}
                      >{u}</button>
                    ))}
                  </div>
                </div>
                <input
                  type="number" step="0.5" min="1"
                  value={usableFuel} onChange={e => setUsableFuel(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>DEP RUNWAY HDG (°)</div>
                <input
                  type="number" step="1" min="0" max="360"
                  value={depRwy} onChange={e => setDepRwy(e.target.value)}
                  placeholder="e.g. 270" style={inputStyle}
                />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 5 }}>ARR RUNWAY HDG (°)</div>
                <input
                  type="number" step="1" min="0" max="360"
                  value={arrRwy} onChange={e => setArrRwy(e.target.value)}
                  placeholder="e.g. 090" style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
