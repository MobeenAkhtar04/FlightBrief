import { useRef, useEffect } from 'react'
import type { MetarData } from '../types/brief'

interface Props {
  depMetar: MetarData | null
  arrMetar: MetarData | null
  depRunwayHeading: number | null
  arrRunwayHeading: number | null
  isDark: boolean
}

const SIZE = 220  // canvas logical px

function toRad(deg: number) { return deg * Math.PI / 180 }

// crosswind = windSpeed * sin(wind_dir - runway_heading)
function xwKts(windDir: number, windSpeed: number, rwyHdg: number): number {
  return windSpeed * Math.sin(toRad(windDir - rwyHdg))
}
function hwKts(windDir: number, windSpeed: number, rwyHdg: number): number {
  return windSpeed * Math.cos(toRad(windDir - rwyHdg))
}

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  metar: MetarData,
  rwyHdg: number,
) {
  const w = SIZE, h = SIZE
  const cx = w / 2, cy = h / 2
  const R = w / 2 - 22   // compass rose radius

  // ── background — always dark ──
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, w, h)

  // ── compass rose circle ──
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, 2 * Math.PI)
  ctx.strokeStyle = '#30363d'
  ctx.lineWidth = 1
  ctx.stroke()

  // ── tick marks every 10° ──
  for (let deg = 0; deg < 360; deg += 10) {
    const a = toRad(deg - 90)
    const isMajor = deg % 30 === 0
    const inner = R - (isMajor ? 10 : 5)
    ctx.beginPath()
    ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a))
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a))
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = isMajor ? 1.5 : 0.7
    ctx.stroke()
  }

  // ── cardinal labels ──
  ctx.font = 'bold 10px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cardinals = [{ l: 'N', b: 0 }, { l: 'E', b: 90 }, { l: 'S', b: 180 }, { l: 'W', b: 270 }]
  for (const { l, b } of cardinals) {
    const a = toRad(b - 90)
    ctx.fillStyle = l === 'N' ? '#e6edf3' : '#8b949e'
    ctx.fillText(l, cx + (R + 13) * Math.cos(a), cy + (R + 13) * Math.sin(a))
  }

  // ── runway rectangle ──
  const rwyLen = 82, rwyWidth = 15
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(toRad(rwyHdg))
  ctx.fillStyle = '#21262d'
  ctx.fillRect(-rwyWidth / 2, -rwyLen / 2, rwyWidth, rwyLen)
  // threshold bars
  ctx.strokeStyle = '#e6edf3'
  ctx.lineWidth = 2
  ;[-1, 1].forEach(sign => {
    ctx.beginPath()
    ctx.moveTo(-rwyWidth / 2 + 2, sign * (rwyLen / 2 - 3))
    ctx.lineTo(rwyWidth / 2 - 2, sign * (rwyLen / 2 - 3))
    ctx.stroke()
  })
  // centerline dashes
  ctx.strokeStyle = '#e6edf3'
  ctx.lineWidth = 1
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(0, -rwyLen / 2 + 8)
  ctx.lineTo(0, rwyLen / 2 - 8)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // ── approach indicator — triangle at outer compass ring only ──
  {
    const apchAngle = toRad(((rwyHdg + 180) % 360) - 90)
    const landAngle = toRad(rwyHdg - 90)
    ctx.save()
    ctx.translate(cx + (R - 6) * Math.cos(apchAngle), cy + (R - 6) * Math.sin(apchAngle))
    ctx.rotate(landAngle + Math.PI / 2)
    ctx.fillStyle = '#c9d1d9'
    ctx.beginPath()
    ctx.moveTo(0, -7)
    ctx.lineTo(5,  5)
    ctx.lineTo(-5, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // ── wind arrow + components ──
  const windDir = metar.wind_dir ?? 0
  const windSpd = metar.wind_speed
  const windGust = metar.wind_gust
  const isCalm = metar.wind_variable || windSpd === 0

  if (!isCalm) {
    const maxLen = R * 0.78
    const arrowLen = Math.min(windSpd * 3.8, maxLen)

    // wind blows FROM windDir, so arrow goes TO (windDir + 180) direction
    const windToCompass = (windDir + 180) % 360
    const windToA = toRad(windToCompass - 90)
    const wx = cx + arrowLen * Math.cos(windToA)
    const wy = cy + arrowLen * Math.sin(windToA)

    // wind vector in canvas coords (relative to center)
    const wvx = wx - cx
    const wvy = wy - cy

    // runway unit vector in canvas coords
    // heading 0 = vertical = canvas angle (0-90)*PI/180 = -90° = up
    // runway unit vector for heading H: same formula as a point at bearing H from center
    const rwyA = toRad(rwyHdg - 90)
    const rux = Math.cos(rwyA)
    const ruy = Math.sin(rwyA)

    // headwind projection along runway axis
    const dot = wvx * rux + wvy * ruy
    const hwvx = dot * rux
    const hwvy = dot * ruy

    // crosswind component (perpendicular)
    const cxvx = wvx - hwvx
    const cxvy = wvy - hwvy

    // draw headwind component (green dashed along runway)
    ctx.strokeStyle = '#3fb950'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.55
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + hwvx, cy + hwvy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // draw crosswind component (yellow dashed perpendicular)
    ctx.strokeStyle = '#d29922'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.75
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(cx + hwvx, cy + hwvy)
    ctx.lineTo(wx, wy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // main wind arrow (blue, solid)
    ctx.strokeStyle = '#388bfd'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(wx, wy)
    ctx.stroke()

    // arrowhead
    const headLen = 11
    const headAngle = Math.PI / 6
    const arrowAngle = Math.atan2(wy - cy, wx - cx)
    ctx.fillStyle = '#388bfd'
    ctx.beginPath()
    ctx.moveTo(wx, wy)
    ctx.lineTo(
      wx - headLen * Math.cos(arrowAngle - headAngle),
      wy - headLen * Math.sin(arrowAngle - headAngle)
    )
    ctx.lineTo(
      wx - headLen * Math.cos(arrowAngle + headAngle),
      wy - headLen * Math.sin(arrowAngle + headAngle)
    )
    ctx.closePath()
    ctx.fill()

    // gust ring (dashed, if gusting)
    if (windGust && windGust > windSpd) {
      const gustLen = Math.min(windGust * 3.8, maxLen)
      ctx.strokeStyle = '#388bfd'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.3
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.arc(cx, cy, gustLen, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  } else {
    // calm — just draw a small X at center
    ctx.strokeStyle = '#484f58'
    ctx.lineWidth = 1.5
    const r = 8
    ;[[-r, -r, r, r], [-r, r, r, -r]].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath(); ctx.moveTo(cx + x1, cy + y1); ctx.lineTo(cx + x2, cy + y2); ctx.stroke()
    })
  }

  // center dot
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI)
  ctx.fillStyle = '#8b949e'
  ctx.fill()
}

interface AirportCanvasProps {
  metar: MetarData
  rwyHdg: number
  label: string
  isDark: boolean
}

function AirportCanvas({ metar, rwyHdg, label, isDark }: AirportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    canvas.style.width = SIZE + 'px'
    canvas.style.height = SIZE + 'px'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    drawDiagram(ctx, metar, rwyHdg)
  }, [metar, rwyHdg, isDark])

  const windDir = metar.wind_dir ?? 0
  const windSpd = metar.wind_speed
  const windGust = metar.wind_gust
  const isCalm = metar.wind_variable || windSpd === 0

  const xw = isCalm ? 0 : Math.abs(xwKts(windDir, windSpd, rwyHdg))
  const hw = isCalm ? 0 : hwKts(windDir, windSpd, rwyHdg)
  const xwGust = windGust ? Math.abs(xwKts(windDir, windGust, rwyHdg)) : null
  const hwGust = windGust ? hwKts(windDir, windGust, rwyHdg) : null

  function xwColor(kts: number) {
    if (kts > 15) return 'var(--red)'
    if (kts > 10) return 'var(--yellow)'
    return 'var(--green)'
  }
  function hwColor(kts: number) {
    if (kts < -5) return 'var(--yellow)'
    if (kts > 25) return 'var(--red)'
    return 'var(--green)'
  }

  const windStr = metar.wind_variable
    ? `VRB${windSpd}KT`
    : isCalm
      ? 'CALM'
      : `${String(windDir).padStart(3, '0')}°/${windSpd}${windGust ? `G${windGust}` : ''}KT`

  return (
    <div className="runway-canvas-item" style={{
      flex: 1,
      background: 'var(--bg-input)',
      border: '1px solid var(--border-card)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-card)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label">{label}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{metar.station_id}</span>
        </div>
        <span className="label">
          RWY HDG {String(rwyHdg).padStart(3, '0')}° · {windStr}
        </span>
      </div>

      {/* canvas */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>

      {/* legend */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 12, justifyContent: 'center' }}>
        {[
          { color: '#388bfd', label: 'wind vector',       dashed: false, triangle: false },
          { color: '#3fb950', label: 'headwind',           dashed: true,  triangle: false },
          { color: '#d29922', label: 'crosswind',          dashed: true,  triangle: false },
          { color: '#c9d1d9', label: 'aircraft direction', dashed: false, triangle: true },
        ].map(({ color, label: lbl, dashed, triangle }) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {triangle ? (
              <div style={{
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: `9px solid ${color}`,
              }} />
            ) : (
              <div style={{
                width: 18, height: 1.5,
                background: dashed ? 'none' : color,
                borderTop: dashed ? `2px dashed ${color}` : 'none',
              }} />
            )}
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lbl}</span>
          </div>
        ))}
      </div>

      {/* metric boxes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderTop: '1px solid var(--border-card)',
      }}>
        <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border-card)' }}>
          <div className="label" style={{ marginBottom: 4 }}>Headwind</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: isCalm ? 'var(--text-muted)' : hwColor(hw) }}>
            {isCalm ? '—' : `${Math.abs(hw).toFixed(0)}`}
            {!isCalm && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3 }}>KT</span>}
          </div>
          {hwGust !== null && !isCalm && (
            <div style={{ fontSize: 11, color: hwColor(hwGust) }}>G{Math.abs(hwGust).toFixed(0)}KT</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {isCalm ? 'calm' : hw >= 0 ? 'headwind' : 'tailwind'}
          </div>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div className="label" style={{ marginBottom: 4 }}>Crosswind</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: isCalm ? 'var(--text-muted)' : xwColor(xw) }}>
            {isCalm ? '—' : `${xw.toFixed(0)}`}
            {!isCalm && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3 }}>KT</span>}
          </div>
          {xwGust !== null && !isCalm && (
            <div style={{ fontSize: 11, color: xwColor(xwGust) }}>G{xwGust.toFixed(0)}KT</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {isCalm ? 'calm' : xwKts(windDir, windSpd, rwyHdg) >= 0 ? 'from right' : 'from left'}
          </div>
        </div>
      </div>
    </div>
  )
}

function NoHeadingCard({ label, icao }: { label: string; icao: string }) {
  return (
    <div className="runway-canvas-item" style={{
      flex: 1,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      minHeight: 180,
      gap: 8,
    }}>
      <div style={{ fontSize: 28, opacity: 0.3 }}>⊕</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        Enter runway heading above<br />to see {label.toLowerCase()} wind diagram
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{icao}</div>
    </div>
  )
}

function NoMetarCard({ label, icao }: { label: string; icao: string }) {
  return (
    <div className="runway-canvas-item" style={{
      flex: 1,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      minHeight: 180,
      gap: 8,
    }}>
      <div style={{ fontSize: 24, opacity: 0.25 }}>—</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        No METAR available for {icao}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 2, textAlign: 'center' }}>
        {label} weather data not found in AWC
      </div>
    </div>
  )
}

interface RunwayDiagramProps extends Props {
  departure: string
  arrival: string
}

export default function RunwayDiagram({ depMetar, arrMetar, depRunwayHeading, arrRunwayHeading, isDark, departure, arrival }: RunwayDiagramProps) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 10 }}>Runway Wind Diagram</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }} className="runway-diagram-row">
        {depMetar
          ? depRunwayHeading !== null
            ? <AirportCanvas metar={depMetar} rwyHdg={depRunwayHeading} label="Departure" isDark={isDark} />
            : <NoHeadingCard label="Departure" icao={depMetar.station_id} />
          : <NoMetarCard label="Departure" icao={departure} />
        }
        {arrMetar
          ? arrRunwayHeading !== null
            ? <AirportCanvas metar={arrMetar} rwyHdg={arrRunwayHeading} label="Arrival" isDark={isDark} />
            : <NoHeadingCard label="Arrival" icao={arrMetar.station_id} />
          : <NoMetarCard label="Arrival" icao={arrival} />
        }
      </div>
    </div>
  )
}
