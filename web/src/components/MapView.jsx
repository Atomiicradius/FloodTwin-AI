import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { STATUS } from '../data/network.js'
import { W, H, UNIT_M } from '../data/terrain.js'
import { Icon, fmt } from './ui.jsx'

const BASE_VB = { x: -24, y: -18, w: 1048, h: 733 }
const CLASS_W = { primary: 6.2, secondary: 4.2, tertiary: 2.8 }

function smoothClosed(pts) {
  const n = pts.length
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = ''
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]
    const p1 = pts[(i + 1) % n]
    const m0 = mid(pts[(i + n - 1) % n], p0)
    const m1 = mid(p0, p1)
    if (i === 0) d += `M${m0[0]},${m0[1]}`
    d += ` Q${p0[0]},${p0[1]} ${m1[0]},${m1[1]}`
  }
  return d + ' Z'
}

const LAYER_DEFS = [
  { key: 'terrain', label: 'Terrain', color: '#4a6a82' },
  { key: 'flow', label: 'Terrain flow', color: '#7dd3fc' },
  { key: 'drains', label: 'Official drains', color: '#7aa7d9' },
  { key: 'status', label: 'Evidence status', color: '#fbbf24' },
  { key: 'obs', label: 'Reports', color: '#f472b6' },
  { key: 'flood', label: 'Flooding', color: '#38bdf8' },
]

export default function MapView({
  net,
  images,
  layers,
  setLayers,
  depthImg,
  deltaImg,
  floodMode, // 'none' | 'nodes' | 'full'
  showDelta,
  floodVol,
  freq,
  obsList,
  selSeg,
  onSelectSeg,
  selNode,
  onSelectNode,
  focus,
  highlightSegs = [],
  eventName,
  stageLabel,
}) {
  const wrap = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [vb, setVb] = useState(BASE_VB)
  const target = useRef(BASE_VB)
  const raf = useRef(0)
  const drag = useRef(null)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = wrap.current
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const vbRef = useRef(BASE_VB)
  const animate = useCallback(() => {
    cancelAnimationFrame(raf.current)
    const tick = () => {
      const cur = vbRef.current
      const t = target.current
      const k = 0.18
      const close = Math.abs(cur.x - t.x) + Math.abs(cur.y - t.y) + Math.abs(cur.w - t.w) < 0.4
      const next = close
        ? t
        : {
            x: cur.x + (t.x - cur.x) * k,
            y: cur.y + (t.y - cur.y) * k,
            w: cur.w + (t.w - cur.w) * k,
            h: cur.h + (t.h - cur.h) * k,
          }
      vbRef.current = next
      setVb(next)
      if (!close) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const setTarget = useCallback(
    (t) => {
      target.current = t
      animate()
    },
    [animate],
  )

  useEffect(() => {
    if (!focus) return
    if (focus.reset) {
      setTarget(BASE_VB)
      return
    }
    const w = BASE_VB.w / focus.zoom
    const h = BASE_VB.h / focus.zoom
    setTarget({ x: focus.x - w / 2, y: focus.y - h / 2, w, h })
  }, [focus, setTarget])

  // wheel zoom (non-passive so the page never scrolls)
  useEffect(() => {
    const svg = svgRef.current
    const onWheel = (e) => {
      e.preventDefault()
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const p = pt.matrixTransform(svg.getScreenCTM().inverse())
      const cur = target.current
      const f = Math.exp(e.deltaY * 0.0012)
      const w = Math.min(BASE_VB.w * 1.15, Math.max(160, cur.w * f))
      const h = (w / BASE_VB.w) * BASE_VB.h
      const nx = p.x - ((p.x - cur.x) / cur.w) * w
      const ny = p.y - ((p.y - cur.y) / cur.h) * h
      setTarget({ x: nx, y: ny, w, h })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [setTarget])

  const zoomBy = (f) => {
    const cur = target.current
    const w = Math.min(BASE_VB.w * 1.15, Math.max(160, cur.w * f))
    const h = (w / BASE_VB.w) * BASE_VB.h
    setTarget({ x: cur.x + (cur.w - w) / 2, y: cur.y + (cur.h - h) / 2, w, h })
  }

  const scale = Math.min(size.w / vb.w, size.h / vb.h)

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { sx: e.clientX, sy: e.clientY, vb: { ...target.current }, moved: false }
    svgRef.current.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) {
      const t = { ...d.vb, x: d.vb.x - dx / scale, y: d.vb.y - dy / scale }
      target.current = t
      vbRef.current = t
      setVb(t)
    }
  }
  const onPointerUp = () => {
    setTimeout(() => (drag.current = null), 0)
  }
  const clickGuard = (fn) => (e) => {
    e.stopPropagation()
    if (drag.current?.moved) return
    fn()
  }

  const perimeterPath = useMemo(() => smoothClosed(net.perimeter), [net])
  const maskPath = `M-400,-400 H1400 V1100 H-400 Z ${perimeterPath}`

  const showHover = (type, id, e) => {
    const r = wrap.current.getBoundingClientRect()
    setHover({ type, id, x: e.clientX - r.left, y: e.clientY - r.top })
  }

  const hoverBox = (() => {
    if (!hover) return null
    if (hover.type === 'seg') {
      const s = net.segs[hover.id]
      return (
        <>
          <b>
            {s.id} · {s.cls}
          </b>
          <span>
            {fmt(s.lenM)} m · mapped Ø {s.d0.toFixed(1)} m
          </span>
          <span className="tt-status" style={{ '--c': STATUS[s.status].color }}>
            <i />
            {STATUS[s.status].label}
          </span>
        </>
      )
    }
    if (hover.type === 'node') {
      const n = net.nodes[hover.id]
      const v = floodVol?.[hover.id] || 0
      return (
        <>
          <b>
            {n.id} · {n.kind}
          </b>
          <span>
            {n.kind === 'outfall' ? 'Network outlet' : `${n.area.toFixed(1)} ha drained`}
          </span>
          {v > 5 && floodMode !== 'none' && <span className="tt-flood">Simulated node flooding {fmt(v)} m³</span>}
        </>
      )
    }
    if (hover.type === 'obs') {
      const o = obsList.find((x) => x.id === hover.id)
      return (
        <>
          <b>Report {o.id}</b>
          <span>
            {o.type} · ~{o.depthCm} cm · {o.quality} quality
          </span>
          {o.matched !== undefined && (
            <span style={{ color: o.matched ? '#34d399' : '#f87171' }}>
              {o.matched ? 'Reproduced by simulation' : 'Not reproduced by simulation'}
            </span>
          )}
          <span className="tt-dim">Synthetic</span>
        </>
      )
    }
    return null
  })()

  const showDrains = layers.drains
  const hl = new Set(highlightSegs)

  return (
    <div className="map" ref={wrap}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (!drag.current?.moved) {
            onSelectSeg(null)
            onSelectNode(null)
          }
        }}
        onDoubleClick={() => setTarget(BASE_VB)}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="mapgrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="-400" y="-400" width="1800" height="1500" fill="#060b16" />
        <rect x="-400" y="-400" width="1800" height="1500" fill="url(#mapgrid)" />

        {layers.terrain && images.terrain && (
          <image href={images.terrain} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
        )}
        {!layers.terrain && <rect x="0" y="0" width={W} height={H} fill="#0a1424" />}
        {layers.flow && images.flow && (
          <image href={images.flow} x="0" y="0" width={W} height={H} preserveAspectRatio="none" opacity="0.95" />
        )}

        <path d={maskPath} fill="#060b16" opacity="0.72" fillRule="evenodd" pointerEvents="none" />
        <path d={perimeterPath} fill="none" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="9 6" pointerEvents="none" />

        {layers.flood && floodMode === 'full' && depthImg && (
          <image className="fade-in" href={depthImg} x="0" y="0" width={W} height={H} preserveAspectRatio="none" pointerEvents="none" />
        )}
        {layers.flood && floodMode === 'full' && showDelta && deltaImg && (
          <image className="fade-in" href={deltaImg} x="0" y="0" width={W} height={H} preserveAspectRatio="none" pointerEvents="none" />
        )}

        {showDrains &&
          net.segs.map((s, i) => {
            const a = net.nodes[s.from]
            const b = net.nodes[s.to]
            const color = layers.status ? STATUS[s.status].color : '#7aa7d9'
            const w = CLASS_W[s.cls]
            const isSel = selSeg === i
            return (
              <g key={s.id} className={hl.has(i) ? 'seg-hl' : ''}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#050912" strokeWidth={w + 3.4} strokeLinecap="round" />
                {isSel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeOpacity="0.85" strokeWidth={w + 6} strokeLinecap="round" />}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={w}
                  strokeLinecap="round"
                  strokeDasharray={layers.status && s.status === 'disputed' ? '11 6' : undefined}
                  filter={isSel ? 'url(#glow)' : undefined}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth="18"
                  strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onClick={clickGuard(() => onSelectSeg(i))}
                  onMouseMove={(e) => showHover('seg', i, e)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            )
          })}

        {showDrains &&
          net.nodes.map((n, i) => (
            <g key={n.id}>
              {n.kind === 'outfall' ? (
                <path d={`M${n.x - 9},${n.y - 8} L${n.x + 9},${n.y} L${n.x - 9},${n.y + 8} Z`} fill="#e2e8f0" stroke="#050912" strokeWidth="2" />
              ) : (
                <circle cx={n.x} cy={n.y} r={selNode === i ? 6.5 : 4.2} fill="#0b1220" stroke={selNode === i ? '#fff' : '#cbd5e1'} strokeWidth="1.8" />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r="12"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={clickGuard(() => onSelectNode(i))}
                onMouseMove={(e) => showHover('node', i, e)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}

        {layers.flood &&
          (floodMode === 'nodes' || floodMode === 'full') &&
          floodVol &&
          net.nodes.map((n, i) => {
            const v = floodVol[i]
            if (v < 150) return null
            const r = 9 + Math.sqrt(v) * 0.14
            return (
              <g key={`f${n.id}`} pointerEvents="none">
                <circle className="pulse" cx={n.x} cy={n.y} r={r} fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth="1.6" />
                <circle cx={n.x} cy={n.y} r="4.6" fill="#38bdf8" stroke="#050912" strokeWidth="1.6" />
              </g>
            )
          })}

        {freq &&
          net.nodes.map((n, i) => {
            const fb = freq.base[i]
            const fc = freq.cf[i]
            if (fb < 0.08) return null
            const R1 = 17
            const R2 = 11
            const c1 = 2 * Math.PI * R1
            const c2 = 2 * Math.PI * R2
            return (
              <g key={`q${n.id}`} pointerEvents="none" transform={`translate(${n.x} ${n.y}) rotate(-90)`}>
                <circle r={R1} fill="rgba(5,9,18,0.55)" stroke="rgba(148,163,184,0.2)" strokeWidth="4" />
                <circle r={R1} fill="none" stroke="#fb7185" strokeWidth="4" strokeDasharray={`${c1 * fb} ${c1}`} strokeLinecap="round" />
                <circle r={R2} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="3.5" />
                <circle r={R2} fill="none" stroke="#34d399" strokeWidth="3.5" strokeDasharray={`${c2 * fc} ${c2}`} strokeLinecap="round" />
              </g>
            )
          })}

        {layers.obs &&
          obsList.map((o) => (
            <g
              key={o.id}
              transform={`translate(${o.x} ${o.y})`}
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) => showHover('obs', o.id, e)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => e.stopPropagation()}
            >
              {o.matched !== undefined && (
                <circle r="13" fill="none" stroke={o.matched ? '#34d399' : '#f87171'} strokeWidth="2" strokeDasharray={o.matched ? undefined : '4 3'} className="fade-in" />
              )}
              <path d="M0,-8 L8,0 L0,8 L-8,0 Z" fill="#f472b6" stroke="#050912" strokeWidth="2" />
              <circle r="2" fill="#050912" />
            </g>
          ))}

        <g transform={`translate(${net.gauge.x} ${net.gauge.y})`} pointerEvents="none">
          <circle r="11" fill="rgba(125,211,252,0.12)" stroke="#7dd3fc" strokeWidth="1.4" className="pulse-slow" />
          <path d="M0,-6 C4,-1 5,2 0,5 C-5,2 -4,-1 0,-6Z" fill="#7dd3fc" />
          <text x="15" y="4" fontSize="11" fill="#9fb4d1" fontWeight="600">
            G-1 gauge (synthetic)
          </text>
        </g>

        {selSeg != null && (
          <g pointerEvents="none">
            {(() => {
              const s = net.segs[selSeg]
              const a = net.nodes[s.from]
              const b = net.nodes[s.to]
              const mx = (a.x + b.x) / 2
              const my = (a.y + b.y) / 2
              return (
                <g transform={`translate(${mx} ${my - 18})`}>
                  <rect x="-20" y="-11" width="40" height="19" rx="9.5" fill="#fff" />
                  <text y="3" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#0b1220">
                    {s.id}
                  </text>
                </g>
              )
            })()}
          </g>
        )}
      </svg>

      <div className="map-layers">
        {LAYER_DEFS.map((l) => (
          <button
            key={l.key}
            className={`chip ${layers[l.key] ? 'on' : ''}`}
            style={{ '--c': l.color }}
            onClick={() => setLayers({ ...layers, [l.key]: !layers[l.key] })}
          >
            <i />
            {l.label}
          </button>
        ))}
      </div>

      <div className="map-zoom">
        <button onClick={() => zoomBy(0.7)} aria-label="Zoom in">
          {Icon.plus}
        </button>
        <button onClick={() => zoomBy(1.4)} aria-label="Zoom out">
          {Icon.minus}
        </button>
        <button onClick={() => setTarget(BASE_VB)} aria-label="Reset view">
          {Icon.fit}
        </button>
      </div>

      <div className="map-title">
        <span className="dot" />
        <b>{eventName}</b>
        {stageLabel && <em>{stageLabel}</em>}
      </div>

      <Legend layers={layers} floodMode={floodMode} showDelta={showDelta} freq={!!freq} />

      <div className="map-scale">
        <div className="scalebar" style={{ width: Math.max(30, 250 / UNIT_M * scale) }} />
        <span>250 m</span>
        <span className="map-crs">Local grid · synthetic · not georeferenced</span>
      </div>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hoverBox}
        </div>
      )}
    </div>
  )
}

function Legend({ layers, floodMode, showDelta, freq }) {
  const showStatus = layers.status && layers.drains
  const showDepth = layers.flood && floodMode === 'full'
  if (!showStatus && !showDepth && !freq) return null
  return (
    <div className="legend">
      {showStatus && (
        <div className="legend-block">
          <div className="legend-title">Evidence status</div>
          {Object.entries(STATUS).map(([k, s]) => (
            <div key={k} className="legend-row">
              <i style={{ background: s.color, borderRadius: 2 }} />
              {s.label}
              {k === 'disputed' && <small>dashed</small>}
            </div>
          ))}
        </div>
      )}
      {showDepth && (
        <div className="legend-block">
          <div className="legend-title">Simulated surface depth</div>
          <div className="depth-ramp" />
          <div className="legend-scale">
            <span>0</span>
            <span>0.5</span>
            <span>1 m+</span>
          </div>
          {showDelta && (
            <>
              <div className="legend-row">
                <i style={{ background: '#34d399' }} />
                Less flooding than baseline
              </div>
              <div className="legend-row">
                <i style={{ background: '#f87171' }} />
                More flooding than baseline
              </div>
            </>
          )}
        </div>
      )}
      {freq && (
        <div className="legend-block">
          <div className="legend-title">Scenario frequency (ring)</div>
          <div className="legend-row">
            <i style={{ background: '#fb7185', borderRadius: 7 }} />
            Outer: baseline, share of scenarios flooding
          </div>
          <div className="legend-row">
            <i style={{ background: '#34d399', borderRadius: 7 }} />
            Inner: with intervention
          </div>
        </div>
      )}
    </div>
  )
}
