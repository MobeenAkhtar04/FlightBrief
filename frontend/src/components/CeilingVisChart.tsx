import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { TafData, TafPeriod, CloudLayer } from '../types/brief'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  taf: TafData
  label: string
  flightTimeHrs?: number
  isDark: boolean
}

// same ceiling rule as MetarCard — lowest BKN or OVC only
function getTafCeiling(period: TafPeriod): number | null {
  const layers = (period.clouds ?? [] as CloudLayer[]).filter(c => c.coverage === 'BKN' || c.coverage === 'OVC')
  if (layers.length === 0) return null
  const alts = layers.map(c => c.altitude_ft).filter((a): a is number => a !== null)
  return alts.length > 0 ? Math.min(...alts) : null
}

// parse DDHHMM → UTC Date
function parseTafTime(ddhhmm: string): Date {
  if (!ddhhmm || ddhhmm.length < 6) return new Date()
  const day  = parseInt(ddhhmm.slice(0, 2), 10)
  const hour = parseInt(ddhhmm.slice(2, 4), 10)
  const min  = parseInt(ddhhmm.slice(4, 6), 10)
  const now  = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, min, 0))
  if (d.getTime() < now.getTime() - 20 * 3600 * 1000) {
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return d
}

function fmtUtc(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }) + 'Z'
}

function buildData(taf: TafData) {
  const now = new Date()
  const horizon = new Date(now.getTime() + 12 * 3600 * 1000)

  const main = taf.periods.filter(p => ['BASE', 'FM', 'BECMG'].includes(p.change_type))
  if (main.length === 0) return null

  const labels: string[] = []
  const ceilPts: (number | null)[] = []
  const visPts:  (number | null)[] = []

  for (let i = 0; i < main.length; i++) {
    const p = main[i]
    const t = p.change_type === 'BASE' ? now : parseTafTime(p.valid_from)
    if (t > horizon) break

    labels.push(p.change_type === 'BASE' ? 'NOW' : fmtUtc(t))

    const ceil = getTafCeiling(p)
    // cap ceiling display at 5000 (shown as UNLIM above that)
    ceilPts.push(ceil === null ? 5000 : Math.min(ceil, 5000))
    // cap vis at 10 — axis max is 14 so 10SM sits at ~71% height, not crammed at top
    visPts.push(p.visibility_sm === null ? null : Math.min(p.visibility_sm, 10))

    if (i < main.length - 1) {
      const nextT = parseTafTime(main[i + 1].valid_from)
      if (nextT > horizon) {
        labels.push(fmtUtc(horizon))
        ceilPts.push(ceilPts[ceilPts.length - 1])
        visPts.push(visPts[visPts.length - 1])
      }
    }
  }

  if (labels[labels.length - 1] !== fmtUtc(horizon)) {
    labels.push(fmtUtc(horizon))
    ceilPts.push(ceilPts[ceilPts.length - 1])
    visPts.push(visPts[visPts.length - 1])
  }

  return { labels, ceilPts, visPts }
}

function getConditionsAtEta(taf: TafData, flightTimeHrs: number): TafPeriod | null {
  const eta = new Date(Date.now() + flightTimeHrs * 3600 * 1000)
  const main = taf.periods.filter(p => ['BASE', 'FM', 'BECMG'].includes(p.change_type))
  let current: TafPeriod | null = null
  for (const p of main) {
    const from = p.change_type === 'BASE' ? new Date() : parseTafTime(p.valid_from)
    if (from <= eta) current = p
  }
  return current
}

function getIfrRisk(taf: TafData): { level: 'LOW' | 'MODERATE' | 'HIGH'; color: string } {
  const all = taf.periods.filter(p => ['BASE', 'FM', 'BECMG', 'TEMPO'].includes(p.change_type))
  for (const p of all) {
    const c = getTafCeiling(p)
    if (c !== null && c < 500) return { level: 'HIGH', color: 'var(--red)' }
  }
  for (const p of all) {
    const c = getTafCeiling(p)
    if (c !== null && c < 1000) return { level: 'MODERATE', color: 'var(--yellow)' }
  }
  return { level: 'LOW', color: 'var(--green)' }
}

function fmtCeil(ft: number | null): string {
  if (ft === null) return 'CLR'
  if (ft >= 99999 || ft >= 5000) return 'UNLIM'
  return `${ft.toLocaleString()}ft`
}

export default function CeilingVisChart({ taf, label, flightTimeHrs, isDark }: Props) {
  const data = buildData(taf)

  // build the bg-zones plugin here so it can read isDark
  const bgZonesPlugin = useMemo((): Plugin<'line'> => ({
    id: 'bgZones',
    beforeDraw(chart) {
      const { ctx, scales, chartArea } = chart
      const yScale = scales['ceiling']
      if (!yScale || !chartArea) return

      const { left, right, top } = chartArea
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

      const y0    = clamp(yScale.getPixelForValue(0),    top, chart.height)
      const y1000 = clamp(yScale.getPixelForValue(1000), top, chart.height)
      const y3000 = clamp(yScale.getPixelForValue(3000), top, chart.height)
      const yTop  = clamp(yScale.getPixelForValue(5200), top, chart.height)
      const width = right - left

      const alpha = isDark ? [0.10, 0.08, 0.06] : [0.30, 0.22, 0.14]

      ctx.fillStyle = `rgba(248, 81, 73, ${alpha[0]})`
      ctx.fillRect(left, y1000, width, y0 - y1000)

      ctx.fillStyle = `rgba(210, 153, 34, ${alpha[1]})`
      ctx.fillRect(left, y3000, width, y1000 - y3000)

      ctx.fillStyle = `rgba(63, 185, 80, ${alpha[2]})`
      ctx.fillRect(left, yTop, width, y3000 - yTop)
    },
  }), [isDark])

  if (!data) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="label">{label} — Ceiling / Visibility Trend</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
          No forecast periods available
        </p>
      </div>
    )
  }

  const textColor  = isDark ? '#8b949e' : '#57606a'
  const gridColor  = isDark ? '#21262d' : '#d8dde3'

  const chartData = {
    labels: data.labels,
    datasets: [
      // threshold lines drawn first (highest order = drawn on top, so these go under data)
      {
        label: 'IFR (1000ft)',
        data: Array(data.labels.length).fill(1000),
        borderColor: isDark ? 'rgba(248, 81, 73, 0.5)' : 'rgba(207, 34, 46, 0.7)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0,
        yAxisID: 'ceiling',
        order: 5,
      },
      {
        label: 'MVFR (3000ft)',
        data: Array(data.labels.length).fill(3000),
        borderColor: isDark ? 'rgba(210, 153, 34, 0.5)' : 'rgba(154, 103, 0, 0.7)',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0,
        yAxisID: 'ceiling',
        order: 5,
      },
      // Visibility drawn before ceiling so ceiling line sits on top
      {
        label: 'Visibility (SM)',
        data: data.visPts,
        borderColor: '#d29922',
        backgroundColor: 'rgba(210, 153, 34, 0.08)',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 3,
        pointBackgroundColor: '#d29922',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        yAxisID: 'visibility',
        order: 2,
        spanGaps: true,
      },
      // Ceiling on top
      {
        label: 'Ceiling (ft)',
        data: data.ceilPts,
        borderColor: '#388bfd',
        backgroundColor: 'rgba(56, 139, 253, 0.10)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#388bfd',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        yAxisID: 'ceiling',
        order: 1,
        spanGaps: true,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: textColor,
          font: { family: '"Courier New", monospace', size: 10 },
          boxWidth: 20,
          padding: 10,
          filter: (item) => !item.text.includes('IFR (') && !item.text.includes('MVFR ('),
        },
      },
      tooltip: {
        backgroundColor: isDark ? '#161b22' : '#ffffff',
        borderColor: isDark ? '#30363d' : '#d0d7de',
        borderWidth: 1,
        titleColor: isDark ? '#e6edf3' : '#1c2128',
        bodyColor: textColor,
        titleFont: { family: '"Courier New", monospace', size: 11 },
        bodyFont: { family: '"Courier New", monospace', size: 11 },
        callbacks: {
          label(ctx) {
            // skip threshold lines
            if (ctx.dataset.label?.includes('IFR (') || ctx.dataset.label?.includes('MVFR (')) return ''
            if (ctx.dataset.label === 'Ceiling (ft)') {
              const v = ctx.raw as number | null
              return v === null ? '' : `Ceiling: ${v >= 5000 ? 'UNLIM' : v.toLocaleString() + 'ft'}`
            }
            const v = ctx.raw as number | null
            return v === null ? '' : `Visibility: ${v >= 10 ? '10+' : v}SM`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
          font: { family: '"Courier New", monospace', size: 9 },
          maxRotation: 0,
          maxTicksLimit: 8,
        },
        grid: { color: gridColor, lineWidth: 0.5 },
        border: { color: gridColor },
      },
      ceiling: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 5200,
        ticks: {
          color: '#388bfd',
          font: { family: '"Courier New", monospace', size: 9 },
          callback: (v) => {
            const n = v as number
            if (n === 0) return '0'
            if (n % 1000 === 0 && n <= 5000) return n >= 1000 ? `${n / 1000}k` : String(n)
            return ''
          },
          stepSize: 1040,
        },
        grid: { color: gridColor, lineWidth: 0.5 },
        border: { display: false },
      },
      visibility: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 14,  // push 10SM down to 71% height so it doesn't overlap with ceiling at max
        ticks: {
          color: '#d29922',
          font: { family: '"Courier New", monospace', size: 9 },
          callback: (v) => {
            const n = v as number
            if (n > 10 || n % 2 !== 0) return ''
            return `${n}SM`
          },
          stepSize: 2,
        },
        grid: { drawOnChartArea: false },
        border: { display: false },
      },
    },
  }

  const risk = getIfrRisk(taf)
  const etaPeriod = flightTimeHrs ? getConditionsAtEta(taf, flightTimeHrs) : null
  const displayPeriod = etaPeriod ?? taf.periods[0] ?? null

  const frBadgeStyle = (fr: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      VFR:  { color: 'var(--green)',  background: 'var(--green-bg)',  border: '1px solid var(--green-border)' },
      MVFR: { color: 'var(--yellow)', background: 'var(--yellow-bg)', border: '1px solid var(--yellow-border)' },
      IFR:  { color: 'var(--red)',    background: 'var(--red-bg)',    border: '1px solid var(--red-border)' },
      LIFR: { color: 'var(--purple)', background: 'var(--purple-bg)', border: '1px solid var(--purple-border)' },
    }
    return map[fr] ?? map.VFR
  }

  return (
    <div className="card">
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-card)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span className="label">{label}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{taf.station_id}</span>
        <span className="label">— Ceiling / Visibility Trend (12h)</span>
      </div>

      <div style={{ height: 200, padding: '12px 14px 4px' }}>
        <Line
          key={isDark ? 'dark' : 'light'}
          data={chartData}
          options={options}
          plugins={[bgZonesPlugin]}
        />
      </div>

      {/* stat boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--border-card)' }}>
        <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border-card)' }}>
          <div className="label" style={{ marginBottom: 4 }}>IFR Risk</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: risk.color }}>{risk.level}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            based on forecast ceiling
          </div>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div className="label" style={{ marginBottom: 4 }}>
            {flightTimeHrs ? 'Conditions at ETA' : 'Conditions (base period)'}
          </div>
          {displayPeriod ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                ...frBadgeStyle(displayPeriod.flight_rules),
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 4,
                fontFamily: '"Courier New", monospace',
                letterSpacing: '0.06em',
              }}>
                {displayPeriod.flight_rules}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {fmtCeil(getTafCeiling(displayPeriod))}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {flightTimeHrs ? `ETA +${Math.round(flightTimeHrs * 60)}min` : 'current conditions'}
          </div>
        </div>
      </div>
    </div>
  )
}
