import { useState, useEffect, useRef, useMemo } from 'react'
import BriefForm, { type BriefFormData } from './components/BriefForm'
import GoNoGo from './components/GoNoGo'
import MetarCard from './components/MetarCard'
import TafTimeline from './components/TafTimeline'
import NotamList from './components/NotamList'
import FlightStats from './components/FlightStats'
import RunwayDiagram from './components/RunwayDiagram'
import CeilingVisChart from './components/CeilingVisChart'
import BriefHistory from './components/BriefHistory'
import SigmetAirmet from './components/SigmetAirmet'
import PirepList from './components/PirepList'
import WindsAloft from './components/WindsAloft'
import { useBriefApi } from './hooks/useBriefApi'
import { useAuth } from './hooks/useAuth'
import Login from './components/Login'
import type { BriefResponse, FuelUnit } from './types/brief'

type Tab = 'brief' | 'history'

function UnavailableCard({ label, icao }: { label: string; icao: string }) {
  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', minHeight: 80 }}>
      <div className="label">{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        No data available for <span style={{ fontFamily: '"Courier New", monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{icao}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>AWC does not carry weather data for this station</div>
    </div>
  )
}

const btnBase: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border-input)', borderRadius: 6,
  padding: '3px 10px', cursor: 'pointer', color: 'var(--text-muted)',
  fontSize: 11, letterSpacing: '0.08em', fontFamily: '"Courier New", monospace',
}

export default function App() {
  const { token, login, register, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('brief')
  const [isDark, setIsDark] = useState(true)
  const { fetchBrief, loadBrief, loadPublic, loading, error, brief } = useBriefApi()
  const [runwayHeadings, setRunwayHeadings] = useState<{ dep: number | null; arr: number | null }>({ dep: null, arr: null })
  const [aircraftMeta, setAircraftMeta] = useState<{ label?: string; maxRangeNm?: number }>({})
  const [cruiseAltFt, setCruiseAltFt] = useState<number>(5000)
  const [fuelUnit, setFuelUnit] = useState<FuelUnit>('GAL')
  const [copied, setCopied] = useState(false)
  const goNoGoRef = useRef<HTMLDivElement>(null)

  const sharedBriefId = useMemo(() => new URLSearchParams(window.location.search).get('brief'), [])

  useEffect(() => {
    if (sharedBriefId) loadPublic(sharedBriefId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark)
  }, [isDark])

  useEffect(() => {
    if (brief && !loading && goNoGoRef.current && window.innerWidth < 768) {
      goNoGoRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [brief, loading])

  // No token and no shared brief link → show login
  if (!token && !sharedBriefId) {
    return <Login onLogin={login} onRegister={register} />
  }

  function handleShare() {
    if (!brief) return
    navigator.clipboard.writeText(`${window.location.origin}/?brief=${brief.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSubmit(data: BriefFormData) {
    setRunwayHeadings({ dep: data.dep_runway_heading ?? null, arr: data.arr_runway_heading ?? null })
    setAircraftMeta({ label: data.aircraft_label, maxRangeNm: data.max_range_nm })
    setCruiseAltFt(data.cruise_alt_ft ?? 5000)
    const { dep_runway_heading, arr_runway_heading, aircraft_label, max_range_nm, ...apiData } = data
    fetchBrief(apiData)
  }

  function handleHistorySelect(b: BriefResponse) {
    loadBrief(b)
    setActiveTab('brief')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const usingCpp = brief?.flight_stats?.using_cpp ?? null

  const briefContent = brief && !loading && (
    <>
      {/* Print-only header */}
      <div className="print-header">
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.1em' }}>
            {brief.departure} → {brief.arrival}{brief.alternate ? ` (ALT: ${brief.alternate})` : ''}
          </div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>BRIEF ID: {brief.id}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.12em' }}>FLIGHTBRIEF.APP</div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
            {new Date(brief.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
      </div>

      <div ref={goNoGoRef}>
        <GoNoGo
          decision={
            aircraftMeta.maxRangeNm != null && brief.flight_stats.distance_nm > aircraftMeta.maxRangeNm
              ? 'NOGO'
              : brief.decision
          }
          reasons={
            aircraftMeta.maxRangeNm != null && brief.flight_stats.distance_nm > aircraftMeta.maxRangeNm
              ? [
                  `${aircraftMeta.label ?? 'Aircraft'} max range ~${aircraftMeta.maxRangeNm.toLocaleString()} NM — route is ${brief.flight_stats.distance_nm.toFixed(0)} NM`,
                  ...brief.decision_reasons,
                ]
              : brief.decision_reasons
          }
        />
      </div>
      <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', margin: '-8px 0 0', lineHeight: 1.6 }}>
        Go/no-go decisions are based on current METAR conditions and are intended for general aviation reference only. Not a certified EFB. Always consult official sources and a qualified pilot.
      </p>

      <FlightStats
        stats={brief.flight_stats}
        departure={brief.departure}
        arrival={brief.arrival}
        aircraftLabel={aircraftMeta.label}
        maxRangeNm={aircraftMeta.maxRangeNm}
        fuelUnit={fuelUnit}
      />

      {brief.sigmets_airmets.length > 0 && (
        <SigmetAirmet items={brief.sigmets_airmets} />
      )}

      {brief.pireps.length > 0 && (
        <PirepList pireps={brief.pireps} />
      )}

      <WindsAloft
        dep={brief.flight_stats.winds_aloft_dep}
        arr={brief.flight_stats.winds_aloft_arr}
        departure={brief.departure}
        arrival={brief.arrival}
        cruiseAltFt={cruiseAltFt}
      />

      <RunwayDiagram
        depMetar={brief.departure_metar}
        arrMetar={brief.arrival_metar}
        depRunwayHeading={runwayHeadings.dep}
        arrRunwayHeading={runwayHeadings.arr}
        isDark={isDark}
        departure={brief.departure}
        arrival={brief.arrival}
      />

      <div className="metar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {brief.departure_metar
          ? <MetarCard metar={brief.departure_metar} label="DEPARTURE" taf={brief.departure_taf ?? undefined} />
          : <UnavailableCard label="DEPARTURE METAR" icao={brief.departure} />
        }
        {brief.arrival_metar
          ? <MetarCard metar={brief.arrival_metar} label="ARRIVAL" taf={brief.arrival_taf ?? undefined} />
          : <UnavailableCard label="ARRIVAL METAR" icao={brief.arrival} />
        }
        {brief.alternate && (
          brief.alternate_metar
            ? <MetarCard metar={brief.alternate_metar} label="ALTERNATE" taf={brief.alternate_taf ?? undefined} />
            : <UnavailableCard label="ALTERNATE METAR" icao={brief.alternate} />
        )}
      </div>

      <div className="metar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {brief.departure_taf
          ? <CeilingVisChart taf={brief.departure_taf} label="DEPARTURE" flightTimeHrs={0} isDark={isDark} />
          : <UnavailableCard label="DEPARTURE TAF" icao={brief.departure} />
        }
        {brief.arrival_taf
          ? <CeilingVisChart taf={brief.arrival_taf} label="ARRIVAL" flightTimeHrs={brief.flight_stats.flight_time_hrs} isDark={isDark} />
          : <UnavailableCard label="ARRIVAL TAF" icao={brief.arrival} />
        }
        {brief.alternate && brief.alternate_taf && (
          <CeilingVisChart taf={brief.alternate_taf} label="ALTERNATE" flightTimeHrs={brief.flight_stats.flight_time_hrs} isDark={isDark} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {brief.departure_taf && <TafTimeline taf={brief.departure_taf} label="DEPARTURE TAF" />}
        {brief.arrival_taf && <TafTimeline taf={brief.arrival_taf} label="ARRIVAL TAF" />}
        {brief.alternate_taf && <TafTimeline taf={brief.alternate_taf} label="ALTERNATE TAF" />}
      </div>

      {brief.notams.length > 0 && (
        <div className="notam-section">
          <NotamList notams={brief.notams} flightTimeHrs={brief.flight_stats.flight_time_hrs} />
        </div>
      )}

      {/* Print-only footer */}
      <div className="print-footer">
        NOT FOR ACTUAL NAVIGATION — flightbrief.app — Brief {brief.id.slice(0, 8)}
      </div>
    </>
  )

  // Public (unauthenticated) view for shared brief links
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
        <header style={{
          borderBottom: '1px solid var(--border-card)',
          padding: '0 24px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>✈</span>
            <span style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 13 }}>FLIGHTBRIEF</span>
            <span className="label" style={{ marginLeft: 4 }}>SHARED BRIEF</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setIsDark(!isDark)} style={btnBase}>
              {isDark ? '☀ DAY MODE' : '☽ NIGHT MODE'}
            </button>
            <button
              onClick={() => { window.location.href = window.location.origin }}
              style={{ ...btnBase, background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700 }}
            >
              SIGN IN
            </button>
          </div>
        </header>

        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
          <div style={{
            borderRadius: 8, border: '1px solid var(--border-card)', background: 'var(--bg-card)',
            padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Read-only shared brief.{' '}
              <span style={{ color: 'var(--text-primary)' }}>Sign in to create your own.</span>
            </span>
            <button
              onClick={() => { window.location.href = window.location.origin }}
              style={{ ...btnBase, background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700 }}
            >
              SIGN IN / REGISTER
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid var(--border-input)', borderTopColor: 'var(--text-muted)',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                loading brief...
              </div>
            )}
            {error && (
              <div style={{
                borderRadius: 8, border: '1px solid var(--red-border)', background: 'var(--red-bg)',
                padding: '12px 16px', color: 'var(--red)', fontSize: 12,
              }}>
                <strong>ERROR:</strong> {error}
              </div>
            )}
            {briefContent}
          </div>
        </main>

        <footer style={{
          borderTop: '1px solid var(--border-card)', padding: '14px 24px',
          textAlign: 'center', marginTop: 60,
        }}>
          <span className="label">
            NOT FOR ACTUAL NAVIGATION — always get an official briefing from 1800wxbrief.com or DUATS
          </span>
        </footer>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>

      <header className="no-print" style={{
        borderBottom: '1px solid var(--border-card)',
        padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>✈</span>
          <div>
            <span style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 13, color: 'var(--text-primary)' }}>
              FLIGHTBRIEF
            </span>
            <span className="label" style={{ marginLeft: 12 }}>PRE-FLIGHT BRIEFING</span>
          </div>
          {usingCpp !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px',
              border: '1px solid', borderRadius: 4,
              borderColor: usingCpp ? 'var(--green-border)' : 'var(--yellow-border)',
              background: usingCpp ? 'var(--green-bg)' : 'var(--yellow-bg)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: usingCpp ? 'var(--green)' : 'var(--yellow)' }} />
              <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: usingCpp ? 'var(--green)' : 'var(--yellow)' }}>
                {usingCpp ? 'NAVENGINE C++ ACTIVE' : 'PYTHON FALLBACK'}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {brief && !loading && (
            <>
              <button
                onClick={handleShare}
                style={{
                  ...btnBase,
                  color: copied ? 'var(--green)' : 'var(--text-muted)',
                  borderColor: copied ? 'var(--green-border)' : 'var(--border-input)',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {copied ? 'COPIED!' : 'SHARE BRIEF'}
              </button>
              <button onClick={() => window.print()} style={btnBase}>
                PRINT BRIEF
              </button>
            </>
          )}
          <button onClick={logout} style={btnBase}>SIGN OUT</button>
          <button onClick={() => setIsDark(!isDark)} style={{ ...btnBase, display: 'flex', alignItems: 'center', gap: 5 }}>
            {isDark ? '☀ DAY MODE' : '☽ NIGHT MODE'}
          </button>
          {(['brief', 'history'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--border-input)' : 'none',
                border: '1px solid', borderColor: activeTab === tab ? 'var(--border-input)' : 'transparent',
                borderRadius: 6, padding: '3px 12px', cursor: 'pointer',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontFamily: '"Courier New", monospace',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
        {activeTab === 'brief' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="no-print">
              <BriefForm onSubmit={handleSubmit} loading={loading} onFuelUnitChange={setFuelUnit} />
            </div>

            {error && (
              <div style={{
                borderRadius: 8, border: '1px solid var(--red-border)', background: 'var(--red-bg)',
                padding: '12px 16px', color: 'var(--red)', fontSize: 12,
              }}>
                <strong>ERROR:</strong> {error}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid var(--border-input)', borderTopColor: 'var(--text-muted)',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                fetching live weather data...
              </div>
            )}

            {briefContent}
          </div>
        )}

        {activeTab === 'history' && <BriefHistory onSelect={handleHistorySelect} />}
      </main>

      <footer className="no-print" style={{
        borderTop: '1px solid var(--border-card)', padding: '14px 24px',
        textAlign: 'center', marginTop: 60,
      }}>
        <span className="label">
          NOT FOR ACTUAL NAVIGATION — always get an official briefing from 1800wxbrief.com or DUATS
        </span>
      </footer>
    </div>
  )
}
