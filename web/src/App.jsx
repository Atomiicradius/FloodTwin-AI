import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { buildNetwork } from './data/network.js'
import { buildEvents } from './data/events.js'
import {
  buildGrid,
  flowAccumulation,
  renderDeltaImage,
  renderDepthImage,
  renderFlowImage,
  renderTerrainImage,
} from './data/terrain.js'
import { centralScenario, simulate } from './model/sim.js'
import { floodStats, spreadFlood } from './model/spread.js'
import {
  BENCH_DEFAULTS,
  NO_CF,
  applyMods,
  interactionAnalysis,
  matchObservations,
  parityPoints,
  runEnsemble,
} from './model/analysis.js'
import { STEPS } from './copy.js'
import MapView from './components/MapView.jsx'
import {
  AiPanel,
  CounterfactualPanel,
  EventPanel,
  EvidencePanel,
  InteractionPanel,
  SimPanel,
  UncertaintyPanel,
} from './components/panels.jsx'
import { Badge, Icon } from './components/ui.jsx'

const LAYER_PRESETS = [
  { terrain: true, flow: false, drains: true, status: false, obs: true, flood: true },
  { terrain: true, flow: true, drains: true, status: true, obs: false, flood: false },
  { terrain: true, flow: false, drains: true, status: false, obs: true, flood: true },
  { terrain: true, flow: false, drains: true, status: false, obs: false, flood: true },
  { terrain: true, flow: false, drains: true, status: true, obs: false, flood: true },
  { terrain: true, flow: false, drains: true, status: false, obs: false, flood: false },
  { terrain: true, flow: false, drains: true, status: false, obs: false, flood: false },
]

const cfLabel = (cf) => {
  const parts = []
  if (cf.cap > 0) parts.push(`restore S06 ${Math.round(cf.cap * 100)} %`)
  if (cf.block > 0) parts.push(`clear blockage ${Math.round(cf.block * 100)} %`)
  if (cf.rain !== 1) parts.push(`rainfall ${Math.round(cf.rain * 100)} %`)
  return parts.length ? parts.join(' + ') : 'no change'
}

export default function App() {
  const net = useMemo(buildNetwork, [])
  const events = useMemo(() => buildEvents(net), [net])
  const grid = useMemo(buildGrid, [])
  const images = useMemo(() => {
    const { acc, parent } = flowAccumulation(grid)
    return { terrain: renderTerrainImage(), flow: renderFlowImage(acc, parent) }
  }, [grid])

  const [step, setStep] = useState(0)
  const [evIdx, setEvIdx] = useState(0)
  const [selSeg, setSelSeg] = useState(null)
  const [selNode, setSelNode] = useState(null)
  const [layers, setLayers] = useState(LAYER_PRESETS[0])
  const [simStage, setSimStage] = useState(0)
  const [cf, setCf] = useState({ cap: 1, block: 0, rain: 1 })
  const [showDelta, setShowDelta] = useState(true)
  const [bench, setBench] = useState({ ...BENCH_DEFAULTS })
  const [presenter, setPresenter] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [focus, setFocus] = useState(null)
  const timers = useRef([])

  const ev = events[evIdx]
  const cfDeferred = useDeferredValue(cf)
  const base = useMemo(() => centralScenario(net), [net])

  const toFloods = useCallback(
    (run) => Array.from(run.floodVol, (vol, i) => ({ x: net.nodes[i].x, y: net.nodes[i].y, vol })),
    [net],
  )

  // baseline run for the selected event
  const baseRun = useMemo(() => simulate(net, ev, base, { series: true }), [net, ev, base])
  const baseSpread = useMemo(() => spreadFlood(grid, toFloods(baseRun)), [grid, baseRun, toFloods])
  const spreadStats = useMemo(() => floodStats(baseSpread.depth), [baseSpread])
  const match = useMemo(
    () => matchObservations(baseSpread.depth, ev.obs, net.nodes, baseRun.floodVol),
    [baseSpread, ev, net, baseRun],
  )
  const baseDepthImg = useMemo(() => renderDepthImage(baseSpread.depth), [baseSpread])

  // same frozen baseline model evaluated on every event (SYN-3 is held out of any tuning)
  const evalAll = useMemo(
    () =>
      events.map((e) => {
        const run = simulate(net, e, base)
        const sp = spreadFlood(grid, toFloods(run))
        const m = matchObservations(sp.depth, e.obs, net.nodes, run.floodVol)
        return { id: e.id, role: e.role, matched: m.matched, total: m.total, unreported: m.unreported }
      }),
    [events, net, base, grid, toFloods],
  )

  // counterfactual
  const cfRun = useMemo(() => simulate(net, ev, applyMods(net, base, cfDeferred)), [net, ev, base, cfDeferred])
  const cfSpread = useMemo(() => spreadFlood(grid, toFloods(cfRun)), [grid, cfRun, toFloods])
  const cfStats = useMemo(() => floodStats(cfSpread.depth), [cfSpread])
  const cfDepthImg = useMemo(() => renderDepthImage(cfSpread.depth), [cfSpread])
  const deltaImg = useMemo(() => renderDeltaImage(baseSpread.depth, cfSpread.depth), [baseSpread, cfSpread])

  const needInter = step >= 4
  const needEns = step >= 5
  const inter = useMemo(() => (needInter ? interactionAnalysis(net, ev, base) : null), [needInter, net, ev, base])
  const ens = useMemo(() => (needEns ? runEnsemble(net, ev, cfDeferred) : null), [needEns, net, ev, cfDeferred])
  const parity = useMemo(() => parityPoints(), [])

  // simulation reveal animation
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const runSim = useCallback(() => {
    clearTimers()
    setSimStage(1)
    ;[1, 2, 3, 4].forEach((s, i) => {
      timers.current.push(setTimeout(() => setSimStage(s + 1), 650 * (i + 1)))
    })
  }, [])
  useEffect(() => clearTimers, [])

  const focusOn = useCallback((x, y, zoom = 2) => setFocus({ x, y, zoom, key: Math.random() }), [])
  const focusSeg = useCallback(
    (i) => {
      const s = net.segs[i]
      const a = net.nodes[s.from]
      const b = net.nodes[s.to]
      setSelSeg(i)
      focusOn((a.x + b.x) / 2, (a.y + b.y) / 2, 2.3)
    },
    [net, focusOn],
  )

  // step transitions
  const goStep = useCallback(
    (n) => {
      const next = Math.max(0, Math.min(STEPS.length - 1, n))
      setStep(next)
      setLayers(LAYER_PRESETS[next])
      setLimitsOpen(false)
      if (next === 1) {
        setSelNode(null)
        focusSeg(net.hotSeg)
      } else if (next === 2) {
        setSelSeg(null)
        setSelNode(net.hotNode)
        setFocus({ reset: true, key: Math.random() })
        setSimStage((s) => {
          if (s === 0) setTimeout(runSim, 350)
          return s
        })
      } else if (next === 3) {
        setSelSeg(null)
        const n = net.nodes[net.hotNode]
        focusOn(n.x, n.y, 1.6)
      } else {
        setSelSeg(null)
        setSelNode(null)
        setFocus({ reset: true, key: Math.random() })
      }
    },
    [net, focusSeg, focusOn, runSim],
  )

  // switching event restarts the reveal if we are on the simulation step
  const changeEvent = (i) => {
    setEvIdx(i)
    clearTimers()
    setSimStage(0)
    if (step === 2) setTimeout(runSim, 150)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.key === 'ArrowRight') goStep(step + 1)
      else if (e.key === 'ArrowLeft') goStep(step - 1)
      else if (e.key.toLowerCase() === 'p') setPresenter((v) => !v)
      else if (/^[1-7]$/.test(e.key)) goStep(Number(e.key) - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, goStep])

  // ---- what the map shows at each step ----
  let floodMode = 'none'
  let depthImg = null
  let showD = false
  let obsList = ev.obs
  let highlight = []
  let freq = null
  let stageLabel = null
  if (step === 2) {
    floodMode = simStage >= 4 ? 'full' : simStage >= 3 ? 'nodes' : 'none'
    depthImg = baseDepthImg
    if (simStage >= 5) obsList = match.reports
    stageLabel = simStage === 0 ? 'Ready' : simStage < 5 ? `Step ${simStage} of 5 · ${['', 'Rainfall', 'Runoff', 'Drainage model', 'Surface spreading'][simStage]}` : 'Baseline complete'
  } else if (step === 3) {
    floodMode = 'full'
    depthImg = cfDepthImg
    showD = showDelta
    stageLabel = `Counterfactual: ${cfLabel(cf)}`
  } else if (step === 4) {
    floodMode = 'full'
    depthImg = baseDepthImg
    highlight = net.disputedSegs
    stageLabel = 'Disputed segments highlighted'
  } else if (step === 5 && ens) {
    freq = { base: ens.freqBase, cf: ens.freqCf }
    stageLabel = `${ens.n} scenarios`
  }

  const stepDef = STEPS[step]
  const wide = step === 6

  let panel = null
  if (step === 0)
    panel = <EventPanel net={net} events={events} evIdx={evIdx} setEvIdx={changeEvent} ev={ev} focusOn={focusOn} />
  else if (step === 1) panel = <EvidencePanel net={net} selSeg={selSeg} setSelSeg={setSelSeg} focusSeg={focusSeg} />
  else if (step === 2)
    panel = (
      <SimPanel
        ctx={{ net, ev, events, simStage, runSim, baseRun, baseSpread, spreadStats, match, evalAll, selNode, setSelNode, focusOn }}
      />
    )
  else if (step === 3)
    panel = (
      <CounterfactualPanel
        ctx={{ net, cf, setCf, baseRun, cfRun, cfSpread, spreadStats, cfStats, showDelta, setShowDelta, focusOn }}
      />
    )
  else if (step === 4 && inter) panel = <InteractionPanel inter={inter} />
  else if (step === 5 && ens) panel = <UncertaintyPanel ens={ens} cfLabel={cfLabel(cfDeferred)} />
  else if (step === 6) panel = <AiPanel bench={bench} setBench={setBench} parity={parity} />

  return (
    <div className="shell">
      <div className="ribbon">
        <span className="ribbon-dot" />
        Prototype · synthetic demo data · invented catchment, storms and reports · illustrates the workflow, not a real result
      </div>

      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#0f1a2e" stroke="rgba(148,163,184,.25)" />
            <path d="M6 19c3-4 5 4 8 0s5 4 8 0 3-2 4-1" stroke="#38bdf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M6 12c3-4 5 4 8 0s5 4 8 0 3-2 4-1" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".75" />
          </svg>
          <div>
            <b>FloodTwin-AI</b>
            <span>Uncertainty-aware urban flood simulation</span>
          </div>
        </div>

        <div className="events" role="tablist" aria-label="Storm event">
          {events.map((e, i) => (
            <button key={e.id} role="tab" aria-selected={i === evIdx} className={i === evIdx ? 'on' : ''} onClick={() => changeEvent(i)}>
              {e.id}
              <small>{e.role === 'held-out' ? 'held out' : 'calibration'}</small>
            </button>
          ))}
        </div>

        <div className="top-badges">
          <Badge tone="amber" icon={Icon.flask}>Synthetic data</Badge>
          <Badge tone="neutral" title="Experiment class B: synthetic scenario experiment">Class B</Badge>
          <Badge tone="neutral">Prototype v0</Badge>
        </div>
      </header>

      <nav className="rail" aria-label="Investigation steps">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.key} className={`${i === step ? 'on' : ''} ${i < step ? 'past' : ''}`}>
              <button onClick={() => goStep(i)}>
                <span className="rail-n">{i < step ? Icon.check : i + 1}</span>
                <span className="rail-t">
                  <b>{s.title}</b>
                  <small>{s.short}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="rail-foot">
          <label className="switch">
            <input type="checkbox" checked={presenter} onChange={(e) => setPresenter(e.target.checked)} />
            <span />
            Presenter mode
          </label>
          <div className="keys">
            <kbd>←</kbd> <kbd>→</kbd> steps · <kbd>P</kbd> presenter
          </div>
        </div>
      </nav>

      <main className={`main ${wide ? 'wide' : ''}`}>
        {!wide && (
          <section className="map-wrap">
            <MapView
              net={net}
              images={images}
              layers={layers}
              setLayers={setLayers}
              depthImg={depthImg}
              deltaImg={deltaImg}
              floodMode={floodMode}
              showDelta={showD}
              floodVol={step === 3 ? cfRun.floodVol : baseRun.floodVol}
              freq={freq}
              obsList={obsList}
              selSeg={selSeg}
              onSelectSeg={(i) => {
                setSelSeg(i)
                if (i != null && step !== 1) setSelNode(null)
              }}
              selNode={selNode}
              onSelectNode={setSelNode}
              focus={focus}
              highlightSegs={highlight}
              eventName={`${ev.name} · ${ev.role === 'held-out' ? 'held out' : 'calibration'}`}
              stageLabel={stageLabel}
            />
            {presenter && (
              <div className="caption" key={step}>
                <div className="caption-step">
                  {step + 1} / {STEPS.length}
                </div>
                <p>{stepDef.narration}</p>
                <div className="caption-nav">
                  <button onClick={() => goStep(step - 1)} disabled={step === 0} aria-label="Previous step">
                    ←
                  </button>
                  <button onClick={() => goStep(step + 1)} disabled={step === STEPS.length - 1} aria-label="Next step">
                    →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <aside className="panel">
          <header className="panel-head">
            <span className="panel-n">{step + 1}</span>
            <div>
              <h2>{stepDef.title}</h2>
              <p>{stepDef.question}</p>
            </div>
          </header>
          <div className="panel-body" key={step}>
            {panel}
            {wide && presenter && (
              <div className="caption caption-inline">
                <div className="caption-step">
                  {step + 1} / {STEPS.length}
                </div>
                <p>{stepDef.narration}</p>
              </div>
            )}
          </div>
          <footer className="panel-foot">
            <button className="limits-btn" onClick={() => setLimitsOpen((v) => !v)} aria-expanded={limitsOpen}>
              {Icon.info} Limitations &amp; assumptions
              <span className={limitsOpen ? 'flip' : ''}>{Icon.chevron}</span>
            </button>
            <div className="step-nav">
              <button onClick={() => goStep(step - 1)} disabled={step === 0}>
                Back
              </button>
              <button className="next" onClick={() => goStep(step + 1)} disabled={step === STEPS.length - 1}>
                Next
              </button>
            </div>
          </footer>
          {limitsOpen && (
            <div className="limits">
              <b>{stepDef.title}</b>
              <ul>
                {stepDef.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
