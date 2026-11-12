import { STATUS } from '../data/network.js'

export const fmt = (v, d = 0) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fmtVol = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)}k` : fmt(v))

export function Badge({ children, tone = 'neutral', icon, title }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {icon}
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const s = STATUS[status]
  return (
    <span className="status-badge" style={{ '--c': s.color }}>
      <i />
      {s.label}
    </span>
  )
}

export function Tag({ kind, children }) {
  return <span className={`tag tag-${kind}`}>{children}</span>
}

export function Stat({ label, value, unit, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, aside, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          <h3>{title}</h3>
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, display, hint }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="slider">
      <div className="slider-top">
        <span>{label}</span>
        <b className="num">{display ?? value}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <div className="slider-hint">{hint}</div>}
    </label>
  )
}

export function Note({ tone = 'info', title, children }) {
  return (
    <div className={`note note-${tone}`}>
      {title && <b>{title}</b>}
      <span>{children}</span>
    </div>
  )
}

export const Icon = {
  play: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
      <path d="M6 4l10 6-10 6z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  ),
  cross: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  ),
  dash: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M5 10h10" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l5 5 5-5" />
    </svg>
  ),
  flask: (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h4M9 3v5l-4.5 7.5A1.2 1.2 0 005.5 17h9a1.2 1.2 0 001-1.8L11 8V3" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.2v.1" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  ),
  minus: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 10h12" />
    </svg>
  ),
  fit: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />
    </svg>
  ),
}
