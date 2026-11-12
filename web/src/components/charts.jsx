import { STEPS, DT } from '../model/sim.js'
import { fmt } from './ui.jsx'

const C = {
  cyan: '#38bdf8',
  coral: '#fb7185',
  mint: '#34d399',
  amber: '#fbbf24',
  violet: '#a78bfa',
  grid: 'rgba(148,163,184,0.14)',
  axis: '#6b7a93',
  text: '#c7d2e4',
}

const hourLabels = [0, 1, 2, 3, 4]
const xOfStep = (t, x0, x1) => x0 + (t / (STEPS - 1)) * (x1 - x0)

function Axis({ x0, x1, y0, y1, yTicks, yFmt, xTicks = true }) {
  return (
    <g fontSize="10.5" fill={C.axis}>
      {yTicks.map((v) => {
        const y = y1 - ((v - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0] || 1)) * (y1 - y0)
        return (
          <g key={v}>
            <line x1={x0} x2={x1} y1={y} y2={y} stroke={C.grid} />
            <text x={x0 - 6} y={y + 3} textAnchor="end">
              {yFmt ? yFmt(v) : v}
            </text>
          </g>
        )
      })}
      {xTicks &&
        hourLabels.map((h) => {
          const x = x0 + ((h * 3600) / (DT * (STEPS - 1))) * (x1 - x0)
          return (
            <text key={h} x={x} y={y1 + 14} textAnchor="middle">
              {h} h
            </text>
          )
        })}
    </g>
  )
}

export function Hyetograph({ values, scale = 1, height = 130 }) {
  const w = 440
  const x0 = 34
  const x1 = w - 8
  const y0 = 24
  const y1 = height - 22
  const max = Math.ceil((Math.max(...values) * Math.max(1, scale)) / 20) * 20
  const ticks = [0, max / 2, max]
  const bw = ((x1 - x0) / STEPS) * 0.78
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label="Rainfall intensity over time">
      <Axis x0={x0} x1={x1} y0={y0} y1={y1} yTicks={ticks} />
      <text x={x0 - 6} y="10" textAnchor="end" fontSize="10.5" fill={C.axis}>
        mm/h
      </text>
      {Array.from(values).map((v, t) => {
        const h = ((v * scale) / max) * (y1 - y0)
        return (
          <rect
            key={t}
            x={xOfStep(t, x0, x1) - bw / 2}
            y={y1 - h}
            width={bw}
            height={h}
            rx="1.5"
            className="grow"
            fill="url(#gRain)"
          />
        )
      })}
      <defs>
        <linearGradient id="gRain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0.7" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Hydrograph({ qin, cap, flood, height = 150 }) {
  const w = 440
  const x0 = 34
  const x1 = w - 8
  const y0 = 26
  const y1 = height - 22
  const max = Math.max(cap * 1.25, ...qin) * 1.05
  const niceMax = Math.ceil(max / 2) * 2
  const ys = (v) => y1 - (v / niceMax) * (y1 - y0)
  const xs = (t) => xOfStep(t, x0, x1)
  const line = Array.from(qin, (v, t) => `${t ? 'L' : 'M'}${xs(t).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')
  const area = `${line} L${xs(STEPS - 1)},${y1} L${xs(0)},${y1} Z`
  const over = Array.from(qin, (v, t) => `${t ? 'L' : 'M'}${xs(t).toFixed(1)},${ys(Math.max(v, cap)).toFixed(1)}`).join(' ')
  const overArea = `${over} L${xs(STEPS - 1)},${ys(cap)} L${xs(0)},${ys(cap)} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label="Inflow against pipe capacity">
      <Axis x0={x0} x1={x1} y0={y0} y1={y1} yTicks={[0, niceMax / 2, niceMax]} />
      <text x={x0 - 6} y="10" textAnchor="end" fontSize="10.5" fill={C.axis}>
        m³/s
      </text>
      <path d={area} fill={C.cyan} opacity="0.16" className="fade" />
      <path d={overArea} fill={C.coral} opacity="0.55" className="fade" />
      <path d={line} fill="none" stroke={C.cyan} strokeWidth="2" strokeLinejoin="round" className="draw" />
      <line x1={x0} x2={x1} y1={ys(cap)} y2={ys(cap)} stroke={C.amber} strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={x1} y={ys(cap) - 5} textAnchor="end" fontSize="10.5" fill={C.amber}>
        outflow capacity {fmt(cap, 1)} m³/s
      </text>
      {flood > 0 && (
        <text x={x0 + 8} y={y0 + 12} fontSize="10.5" fill={C.coral} fontWeight="600">
          excess = {fmt(flood)} m³ flooded
        </text>
      )}
    </svg>
  )
}

export function Histogram({ base, cf, baseStats, cfStats, bins = 26 }) {
  const w = 440
  const h = 170
  const x0 = 12
  const x1 = w - 12
  const y1 = h - 26
  const y0 = 16
  const max = Math.max(base[base.length - 1], cf[cf.length - 1]) * 1.02
  const hist = (arr) => {
    const out = new Array(bins).fill(0)
    arr.forEach((v) => {
      out[Math.min(bins - 1, Math.floor((v / max) * bins))]++
    })
    return out
  }
  const hb = hist(base)
  const hc = hist(cf)
  const top = Math.max(...hb, ...hc)
  const bw = (x1 - x0) / bins
  const xv = (v) => x0 + (v / max) * (x1 - x0)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Distribution of total flood volume across scenarios">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={xv(max * f)} x2={xv(max * f)} y1={y0} y2={y1} stroke={C.grid} />
          <text x={xv(max * f)} y={y1 + 14} textAnchor="middle" fontSize="10.5" fill={C.axis}>
            {fmt((max * f) / 1000, 0)}k
          </text>
        </g>
      ))}
      <rect x={xv(baseStats.p5)} y={y0 - 4} width={xv(baseStats.p95) - xv(baseStats.p5)} height="5" rx="2.5" fill={C.coral} opacity="0.55" />
      <rect x={xv(cfStats.p5)} y={y0 - 4} width={xv(cfStats.p95) - xv(cfStats.p5)} height="5" rx="2.5" fill={C.mint} opacity="0.55" />
      {hb.map((c, i) => (
        <rect key={`b${i}`} x={x0 + i * bw + 0.5} y={y1 - (c / top) * (y1 - y0 - 8)} width={bw - 1} height={(c / top) * (y1 - y0 - 8)} fill={C.coral} opacity="0.55" rx="1.5" className="grow" />
      ))}
      {hc.map((c, i) => (
        <rect key={`c${i}`} x={x0 + i * bw + 0.5} y={y1 - (c / top) * (y1 - y0 - 8)} width={bw - 1} height={(c / top) * (y1 - y0 - 8)} fill={C.mint} opacity="0.6" rx="1.5" className="grow" />
      ))}
      <line x1={xv(baseStats.med)} x2={xv(baseStats.med)} y1={y0} y2={y1} stroke={C.coral} strokeWidth="1.6" strokeDasharray="4 3" />
      <line x1={xv(cfStats.med)} x2={xv(cfStats.med)} y1={y0} y2={y1} stroke={C.mint} strokeWidth="1.6" strokeDasharray="4 3" />
      <text x={x1} y={h - 2} textAnchor="end" fontSize="10.5" fill={C.axis}>
        total simulated flood volume (m³)
      </text>
    </svg>
  )
}

function bandPath(lo, hi, x0, x1, ys) {
  const up = Array.from(hi, (v, t) => `${t ? 'L' : 'M'}${xOfStep(t, x0, x1).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')
  const down = Array.from(lo, (_, k) => {
    const t = STEPS - 1 - k
    return `L${xOfStep(t, x0, x1).toFixed(1)},${ys(lo[t]).toFixed(1)}`
  }).join(' ')
  return `${up} ${down} Z`
}

export function FanChart({ band, height = 180 }) {
  const w = 440
  const x0 = 38
  const x1 = w - 8
  const y0 = 28
  const y1 = height - 22
  const max = Math.ceil(Math.max(...band.base.hi) / 5000) * 5000
  const ys = (v) => y1 - (v / max) * (y1 - y0)
  const med = (m) => Array.from(m, (v, t) => `${t ? 'L' : 'M'}${xOfStep(t, x0, x1).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label="Cumulative flood volume at the hotspot across scenarios">
      <Axis x0={x0} x1={x1} y0={y0} y1={y1} yTicks={[0, max / 2, max]} yFmt={(v) => `${fmt(v / 1000, 0)}k`} />
      <text x={x0 - 6} y="10" textAnchor="end" fontSize="10.5" fill={C.axis}>
        m³ at J06
      </text>
      <path d={bandPath(band.base.lo, band.base.hi, x0, x1, ys)} fill={C.coral} opacity="0.22" className="fade" />
      <path d={bandPath(band.cf.lo, band.cf.hi, x0, x1, ys)} fill={C.mint} opacity="0.26" className="fade" />
      <path d={med(band.base.md)} fill="none" stroke={C.coral} strokeWidth="2" className="draw" />
      <path d={med(band.cf.md)} fill="none" stroke={C.mint} strokeWidth="2" className="draw" />
    </svg>
  )
}

export function Tornado({ items }) {
  const w = 440
  const rowH = 30
  const h = items.length * rowH + 22
  const cx = 250
  const span = 150
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Rank correlation of parameters with flood volume">
      <line x1={cx} x2={cx} y1="6" y2={h - 16} stroke={C.axis} />
      {items.map((it, i) => {
        const y = 10 + i * rowH
        const len = Math.abs(it.rho) * span
        const x = it.rho >= 0 ? cx : cx - len
        const strong = Math.abs(it.rho) > 0.4
        const weak = Math.abs(it.rho) < 0.15
        return (
          <g key={it.name}>
            <text x="4" y={y + 14} fontSize="11" fill={C.text}>
              {it.name}
            </text>
            <rect x={x} y={y + 3} width={Math.max(2, len)} height="16" rx="4" fill={it.rho >= 0 ? C.coral : C.cyan} opacity={weak ? 0.35 : 0.85} />
            <text x={it.rho >= 0 ? cx + len + 6 : cx + 8} y={y + 15} fontSize="11" fill={C.text} textAnchor="start" className="num">
              {it.rho > 0 ? '+' : ''}
              {it.rho.toFixed(2)} {strong ? '· strong' : weak ? '· weak' : ''}
            </text>
          </g>
        )
      })}
      <text x={cx} y={h - 3} textAnchor="middle" fontSize="10.5" fill={C.axis}>
        rank correlation with total flood volume
      </text>
    </svg>
  )
}

export function EffectBars({ single, additive, combined, factors }) {
  const w = 440
  const rows = [
    ...factors.map((f, i) => ({ label: f.short, v: single[i], color: C.cyan })),
    { label: 'Sum of single effects', v: additive, color: C.amber, hatch: true },
    { label: 'All three together', v: combined, color: C.mint },
  ]
  const max = Math.max(...rows.map((r) => r.v), 1) * 1.08
  const rowH = 30
  const h = rows.length * rowH + 8
  const x0 = 130
  const x1 = w - 60
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Single and combined effects on flood volume">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="6" fill={C.amber} />
        </pattern>
      </defs>
      {rows.map((r, i) => {
        const y = 4 + i * rowH
        const len = (r.v / max) * (x1 - x0)
        return (
          <g key={r.label}>
            <text x={x0 - 10} y={y + 17} fontSize="11" fill={C.text} textAnchor="end">
              {r.label}
            </text>
            <rect x={x0} y={y + 4} width={Math.max(2, len)} height="18" rx="4" fill={r.hatch ? 'url(#hatch)' : r.color} opacity={r.hatch ? 0.55 : 0.85} />
            <text x={x0 + len + 8} y={y + 17} fontSize="11" fill={C.text} className="num">
              {fmt(r.v)} m³
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function ShapleyBars({ values, factors }) {
  const total = values.reduce((a, b) => a + b, 0) || 1
  const colors = [C.cyan, C.violet, C.amber]
  return (
    <div className="shap">
      <div className="shap-bar">
        {values.map((v, i) => (
          <div key={i} style={{ flex: Math.max(0.02, v / total), background: colors[i] }} title={`${factors[i].short}: ${fmt(v)} m³`}>
            <span>{Math.round((v / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <div className="shap-legend">
        {values.map((v, i) => (
          <span key={i}>
            <i style={{ background: colors[i] }} />
            {factors[i].short} <b className="num">{fmt(v)} m³</b>
          </span>
        ))}
      </div>
    </div>
  )
}

const timeLabel = (s) => {
  if (s < 90) return `${fmt(s)} s`
  if (s < 5400) return `${fmt(s / 60)} min`
  if (s < 129600) return `${fmt(s / 3600, s < 36000 ? 1 : 0)} h`
  return `${fmt(s / 86400, 1)} d`
}

export function BenchChart({ curves, p }) {
  const w = 520
  const h = 270
  const x0 = 54
  const x1 = w - 16
  const y0 = 16
  const y1 = h - 34
  const xl = (N) => x0 + (Math.log10(N) / 6) * (x1 - x0)
  const yMin = 0
  const yMax = 7.3
  const yl = (s) => y1 - ((Math.log10(Math.max(1, s)) - yMin) / (yMax - yMin)) * (y1 - y0)
  const path = (key) => curves.pts.map((p2, i) => `${i ? 'L' : 'M'}${xl(p2.N).toFixed(1)},${yl(p2[key]).toFixed(1)}`).join(' ')
  const be = curves.breakEven
  const yTicks = [1, 60, 3600, 86400, 604800, 6048000]
  const showBE = be >= 1 && be <= 1e6
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Total time versus number of scenarios, direct SWMM against GNN surrogate">
      {yTicks.map((s) => (
        <g key={s}>
          <line x1={x0} x2={x1} y1={yl(s)} y2={yl(s)} stroke={C.grid} />
          <text x={x0 - 8} y={yl(s) + 3} textAnchor="end" fontSize="10.5" fill={C.axis}>
            {timeLabel(s)}
          </text>
        </g>
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((e) => (
        <g key={e}>
          <line x1={xl(10 ** e)} x2={xl(10 ** e)} y1={y0} y2={y1} stroke={C.grid} />
          <text x={xl(10 ** e)} y={y1 + 14} textAnchor="middle" fontSize="10.5" fill={C.axis}>
            {e === 0 ? '1' : e < 3 ? 10 ** e : e === 3 ? '1k' : e === 4 ? '10k' : e === 5 ? '100k' : '1M'}
          </text>
        </g>
      ))}
      <text x={(x0 + x1) / 2} y={h - 4} textAnchor="middle" fontSize="10" fill={C.axis}>
        number of scenarios N
      </text>
      {showBE && (
        <rect x={xl(be)} y={y0} width={x1 - xl(be)} height={y1 - y0} fill={C.mint} opacity="0.07" />
      )}
      <path d={path('swmm')} fill="none" stroke={C.coral} strokeWidth="2.4" strokeLinecap="round" className="draw" />
      <path d={path('gnn')} fill="none" stroke={C.cyan} strokeWidth="2.4" strokeLinecap="round" className="draw" />
      {showBE && (
        <g>
          <line x1={xl(be)} x2={xl(be)} y1={y0} y2={y1} stroke={C.mint} strokeDasharray="4 4" />
          <circle cx={xl(be)} cy={yl(be * p.tSwmm)} r="5.5" fill="#0b1220" stroke={C.mint} strokeWidth="2.4" />
          <text x={xl(be) - 8} y={y0 + 12} textAnchor="end" fontSize="11" fill={C.mint} fontWeight="650">
            break-even ≈ {fmt(be)} runs
          </text>
        </g>
      )}
      <g fontSize="11.5">
        <text x={x0 + 84} y={yl(Math.pow(10, (6 * 84) / (x1 - x0)) * p.tSwmm) + 26} fill={C.coral} stroke="#0a1220" strokeWidth="4" paintOrder="stroke">
          direct SWMM
        </text>
        <text x={x0 + 10} y={yl(curves.fixed) - 10} fill={C.cyan} stroke="#0a1220" strokeWidth="4" paintOrder="stroke">
          GNN incl. training + verification
        </text>
      </g>
    </svg>
  )
}

export function Parity({ points }) {
  const w = 250
  const h = 230
  const x0 = 36
  const x1 = w - 10
  const y0 = 10
  const y1 = h - 30
  const lo = Math.log10(20)
  const hi = Math.log10(30000)
  const sx = (v) => x0 + ((Math.log10(Math.max(20, v)) - lo) / (hi - lo)) * (x1 - x0)
  const sy = (v) => y1 - ((Math.log10(Math.max(20, v)) - lo) / (hi - lo)) * (y1 - y0)
  const ticks = [100, 1000, 10000]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Surrogate prediction against reference simulation">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} stroke={C.grid} />
          <line x1={sx(t)} x2={sx(t)} y1={y0} y2={y1} stroke={C.grid} />
          <text x={x0 - 5} y={sy(t) + 3} textAnchor="end" fontSize="10" fill={C.axis}>
            {t >= 1000 ? `${t / 1000}k` : t}
          </text>
          <text x={sx(t)} y={y1 + 12} textAnchor="middle" fontSize="10" fill={C.axis}>
            {t >= 1000 ? `${t / 1000}k` : t}
          </text>
        </g>
      ))}
      <line x1={sx(20)} y1={sy(20)} x2={sx(30000)} y2={sy(30000)} stroke={C.axis} strokeDasharray="4 4" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.truth)} cy={sy(p.pred)} r="2.8" fill={C.cyan} opacity="0.7" />
      ))}
      <text x={(x0 + x1) / 2} y={h - 6} textAnchor="middle" fontSize="10.5" fill={C.axis}>
        reference flood volume (m³)
      </text>
      <text x="10" y={h / 2 - 8} fontSize="10.5" fill={C.axis} transform={`rotate(-90 10 ${h / 2 - 8})`} textAnchor="middle">
        surrogate (m³)
      </text>
    </svg>
  )
}
