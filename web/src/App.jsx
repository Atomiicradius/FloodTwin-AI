import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { buildNetwork } from './data/network.js'
import { buildEvents } from './data/events.js'
import { buildGrid } from './data/terrain.js'
import { centralScenario, simulate } from './model/sim.js'
import { floodStats, spreadFlood } from './model/spread.js'
import {
  BENCH_DEFAULTS,
  applyMods,
  interactionAnalysis,
  matchObservations,
  parityPoints,
  runEnsemble,
} from './model/analysis.js'
import { STEPS } from './copy.js'
import { ScrollTrigger, destroySmoothScroll, initSmoothScroll, scrollToTarget, stageBus } from './motion/index.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip.jsx'
import Stage from './story/Stage.jsx'
import Hero from './story/Hero.jsx'
import { Pill } from './story/kit.jsx'
import { CfSection, EventSection, EvidenceSection, SimSection } from './story/sections1.jsx'
import { AiSection, InteractionSection, UncertaintySection } from './story/sections2.jsx'

const LABELS = ['Intro', ...STEPS.map((s) => s.title)]

const cfLabel = (cf) => {
  const parts = []
  if (cf.cap > 0) parts.push(`restore S06 ${Math.round(cf.cap * 100)} %`)
  if (cf.block > 0) parts.push(`clear blockage ${Math.round(cf.block * 100)} %`)
  if (cf.rain !== 1) parts.push(`rainfall ${Math.round(cf.rain * 100)} %`)
  return parts.length ? parts.join(' + ') : 'no change'
}

const INTRO_NARRATION =
  'Urban flood predictions are only as reliable as the drainage maps behind them. Scroll, or press the right arrow, to follow one investigation from storm to conclusion.'

export default function App() {
  const net = useMemo(buildNetwork, [])
  const events = useMemo(() => buildEvents(net), [net])
  const grid = useMemo(buildGrid, [])

  const [active, setActive] = useState(0) // 0 = hero, 1..7 = chapters
  const [evIdx, setEvIdx] = useState(0)
  const [selSeg, setSelSeg] = useState(net.hotSeg)
  const [selNode, setSelNode] = useState(net.hotNode)
  const [simStage, setSimStage] = useState(0)
  const [cf, setCf] = useState({ cap: 1, block: 0, rain: 1 })
  const [bench, setBench] = useState({ ...BENCH_DEFAULTS })
  const [presenter, setPresenter] = useState(false)
  const timers = useRef([])
  const heroRef = useRef(null)
  const simStarted = useRef(false)

  const ev = events[evIdx]
  const cfDeferred = useDeferredValue(cf)
  const base = useMemo(() => centralScenario(net), [net])

  const toFloods = useCallback(
    (run) => Array.from(run.floodVol, (vol, i) => ({ x: net.nodes[i].x, y: net.nodes[i].y, vol })),
    [net],
  )

  // ---- model results (logic unchanged) ----
  const baseRun = useMemo(() => simulate(net, ev, base, { series: true }), [net, ev, base])
  const baseSpread = useMemo(() => spreadFlood(grid, toFloods(baseRun)), [grid, baseRun, toFloods])
  const spreadStats = useMemo(() => floodStats(baseSpread.depth), [baseSpread])
  const match = useMemo(
    () => matchObservations(baseSpread.depth, ev.obs, net.nodes, baseRun.floodVol),
    [baseSpread, ev, net, baseRun],
  )
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
  const cfRun = useMemo(() => simulate(net, ev, applyMods(net, base, cfDeferred)), [net, ev, base, cfDeferred])
  const cfSpread = useMemo(() => spreadFlood(grid, toFloods(cfRun)), [grid, cfRun, toFloods])
  const cfStats = useMemo(() => floodStats(cfSpread.depth), [cfSpread])
  const inter = useMemo(() => interactionAnalysis(net, ev, base), [net, ev, base])
  const ens = useMemo(() => runEnsemble(net, ev, cfDeferred), [net, ev, cfDeferred])
  const parity = useMemo(() => parityPoints(), [])

  // ---- simulation reveal ----
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

  // the pipeline plays the first time the baseline chapter is reached
  useEffect(() => {
    if (active === 3 && !simStarted.current) {
      simStarted.current = true
      runSim()
    }
  }, [active, runSim])

  const changeEvent = (i) => {
    setEvIdx(i)
    clearTimers()
    setSimStage(0)
    if (simStarted.current) setTimeout(runSim, 200)
  }

  // ---- scroll: smooth scroll, active chapter, hero -> story crossfade ----
  useLayoutEffect(() => {
    initSmoothScroll()
    const hero = heroRef.current
    const chapters = [...document.querySelectorAll('[data-chapter]')]
    const triggers = [
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom 30%',
        scrub: true,
        onUpdate: (self) => (stageBus.mix = self.progress),
      }),
      ScrollTrigger.create({
        trigger: hero,
        start: 'top 60%',
        end: 'bottom 60%',
        onToggle: (self) => self.isActive && setActive(0),
      }),
      ...chapters.map((el, i) =>
        ScrollTrigger.create({
          trigger: el,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: (self) => self.isActive && setActive(i + 1),
        }),
      ),
    ]
    ScrollTrigger.refresh()
    return () => {
      triggers.forEach((t) => t.kill())
      destroySmoothScroll()
    }
  }, [])

  const goTo = useCallback((i) => {
    const n = Math.max(0, Math.min(STEPS.length, i))
    if (n === 0) scrollToTarget(0, { duration: 1.6 })
    else scrollToTarget(document.getElementById(`ch-${n - 1}`), { duration: 1.6 })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [role="dialog"], [role="slider"]')) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(active + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(active - 1)
      } else if (e.key.toLowerCase() === 'p') setPresenter((v) => !v)
      else if (/^[1-7]$/.test(e.key)) goTo(Number(e.key))
      else if (e.key === '0') goTo(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, goTo])

  const sectionTitle = active === 0 ? '' : STEPS[active - 1].title
  const narration = active === 0 ? INTRO_NARRATION : STEPS[active - 1].narration

  return (
    <TooltipProvider delayDuration={120}>
      <div className="banner">
        <i />
        Prototype · synthetic demo data · invented catchment, storms and reports · illustrates the workflow, not a real result
      </div>

      <header className={`topbar ${active > 0 ? 'solid' : ''}`}>
        <div className="brandmark">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#0b1424" stroke="rgba(255,255,255,.18)" />
            <path d="M6 19c3-4 5 4 8 0s5 4 8 0 3-2 4-1" stroke="#38bdf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M6 12c3-4 5 4 8 0s5 4 8 0 3-2 4-1" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".75" />
          </svg>
          FloodTwin-AI
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pill pill-live" onClick={() => goTo(1)} title="Change storm event">
            <span className="dot" style={{ width: 6, height: 6 }} />
            {ev.id} · {ev.role === 'held-out' ? 'held out' : 'calibration'}
          </button>
          <Pill tone="amber" icon={<FlaskConical size={12} />}>Synthetic data</Pill>
          <Pill title="Experiment class B: synthetic scenario experiment">Class B</Pill>
          <Pill>Prototype v0</Pill>
          <label className="toggle-switch" style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={presenter} onChange={(e) => setPresenter(e.target.checked)} />
            <span className="track" />
            Presenter
          </label>
        </div>
      </header>

      <Stage active={active} sectionTitle={sectionTitle} presenter={presenter} wide={active === 7} />

      <nav className="progress" aria-label="Sections">
        {LABELS.map((l, i) => (
          <Tooltip key={l}>
            <TooltipTrigger asChild>
              <button className={i === active ? 'on' : ''} onClick={() => goTo(i)} aria-label={l} aria-current={i === active}>
                <i />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{l}</TooltipContent>
          </Tooltip>
        ))}
      </nav>
      <div className="counter">
        <b>{String(active).padStart(2, '0')}</b> / {String(STEPS.length).padStart(2, '0')}
      </div>

      {presenter && (
        <div className="caption" key={active}>
          <div className="n">{active === 0 ? 'INTRO' : `${active} / ${STEPS.length}`}</div>
          <p>{narration}</p>
        </div>
      )}

      <main className="story">
        <Hero ref={heroRef} />
        <EventSection net={net} events={events} evIdx={evIdx} setEvIdx={changeEvent} ev={ev} />
        <EvidenceSection net={net} selSeg={selSeg} setSelSeg={setSelSeg} />
        <SimSection
          ctx={{ net, ev, events, simStage, runSim, baseRun, baseSpread, spreadStats, match, evalAll, selNode, setSelNode }}
        />
        <CfSection ctx={{ net, cf, setCf, baseRun, cfRun, spreadStats, cfStats }} />
        <InteractionSection inter={inter} />
        <UncertaintySection ens={ens} cfLabel={cfLabel(cfDeferred)} />
        <AiSection bench={bench} setBench={setBench} parity={parity} />
        <footer className="footer-end">
          <div className="kicker">End of the walkthrough</div>
          <div className="display" style={{ fontSize: 'clamp(40px,5vw,84px)' }}>
            Synthetic today. <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>Real data next.</span>
          </div>
          <button className="btn" onClick={() => goTo(0)}>
            Back to the start
          </button>
        </footer>
      </main>
    </TooltipProvider>
  )
}
