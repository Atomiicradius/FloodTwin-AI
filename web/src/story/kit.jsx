import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { Reveal } from '@/motion/primitives.jsx'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet.jsx'
import { STEPS } from '../copy.js'

export function LimitsSheet({ step }) {
  const s = STEPS[step]
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="btn btn-ghost">
          <Info size={14} /> Limitations &amp; assumptions
        </button>
      </SheetTrigger>
      <SheetContent>
        <div className="kicker" style={{ color: '#fcd34d' }}>
          Limitations &amp; assumptions
        </div>
        <SheetTitle className="display" style={{ fontSize: 40 }}>
          {s.title}
        </SheetTitle>
        <SheetDescription className="muted" style={{ fontSize: 13 }}>
          Read these before quoting any number from this section.
        </SheetDescription>
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
          {s.limits.map((l) => (
            <li key={l} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 12, fontSize: 14, color: '#c3cfe2', lineHeight: 1.55 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fbbf24', marginTop: 8 }} />
              {l}
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

export function Chapter({ index, wide, children }) {
  const s = STEPS[index]
  return (
    <section className="chapter" data-chapter={index} id={`ch-${index}`}>
      <div className={`col ${wide ? 'col-wide' : ''}`}>
        <Reveal className="chapter-head" selector=".rv" stagger={0.1}>
          <div className="kicker rv">
            {String(index + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')} · {s.short}
          </div>
          <h2 className="display rv">{s.title}</h2>
          <p className="lead rv">{s.question}</p>
          <div className="chapter-tools rv">
            <LimitsSheet step={index} />
          </div>
        </Reveal>
        {children}
      </div>
    </section>
  )
}

export function Glass({ title, aside, children, className = '', ...rest }) {
  return (
    <Reveal className={`glass ${className}`} {...rest}>
      {(title || aside) && (
        <div className="card-title">
          <h3>{title}</h3>
          {aside}
        </div>
      )}
      {children}
    </Reveal>
  )
}

export function BigNum({ label, tone = '', unit, caption, children }) {
  return (
    <div className="bignum">
      <div className="label">{label}</div>
      <div className={`value ${tone}`}>
        {children}
        {unit && <small>{unit}</small>}
      </div>
      {caption && <p className="cap">{caption}</p>}
    </div>
  )
}

export function More({ label = 'More detail', children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`more ${open ? 'open' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
        <ChevronDown size={16} />
      </button>
      <div className="more-body">
        <div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  )
}

export function Stat({ label, value, unit, sub }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="v">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="s">{sub}</div>}
    </div>
  )
}

export function Note({ tone = 'info', title, children }) {
  return (
    <div className={`note ${tone === 'warn' ? 'note-warn' : ''}`}>
      {title && <b>{title}</b>}
      {children}
    </div>
  )
}

export function Pill({ tone, icon, children, title }) {
  return (
    <span className={`pill ${tone ? `pill-${tone}` : ''}`} title={title}>
      {icon}
      {children}
    </span>
  )
}
