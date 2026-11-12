import { Check, Minus, Play, X } from 'lucide-react'
import { STATUS } from '../data/network.js'
import { EVIDENCE_LABELS } from '../copy.js'
import { segCapacity, STEPS as SIM_STEPS } from '../model/sim.js'
import { Slider } from '@/components/ui/slider.jsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.jsx'
import { ChartReveal, CountUp, Reveal } from '@/motion/primitives.jsx'
import { StatusBadge, Tag, fmt, fmtVol } from '../components/ui.jsx'
import { Hydrograph, Hyetograph } from '../components/charts.jsx'
import { BigNum, Chapter, Glass, More, Note, Pill, Stat } from './kit.jsx'

const roleTag = (role) =>
  role === 'held-out' ? <Tag kind="violet">held out</Tag> : <Tag kind="neutral">calibration</Tag>

/* ───────── 1 · Event & location ───────── */
export function EventSection({ net, events, evIdx, setEvIdx, ev }) {
  return (
    <Chapter index={0}>
      <Glass title="Storm event" aside={<Pill tone="amber">Synthetic</Pill>}>
        <Tabs value={String(evIdx)} onValueChange={(v) => setEvIdx(Number(v))}>
          <TabsList>
            {events.map((e, i) => (
              <TabsTrigger key={e.id} value={String(i)}>
                {e.id}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="row" style={{ margin: '14px 0 22px' }}>
          {roleTag(ev.role)}
          <span className="muted" style={{ fontSize: 13 }}>
            {ev.blurb}
          </span>
        </div>
        <BigNum label="Total rainfall at gauge G-1 · 4 h · 5-min steps" unit="mm">
          <CountUp value={ev.totalMm} />
        </BigNum>
        <div style={{ margin: '26px 0 6px' }}>
          <ChartReveal key={ev.id}>
            <Hyetograph values={ev.intensity} />
          </ChartReveal>
        </div>
        <More label="Storm and catchment detail">
          <div className="stats">
            <Stat label="Peak intensity" value={fmt(ev.peakMmH)} unit="mm/h" />
            <Stat label="Duration" value="4" unit="h" />
            <Stat label="Catchment S-1" value={fmt(net.areaHa)} unit="ha" />
            <Stat label="Mapped drains" value={net.totalLenKm.toFixed(1)} unit="km" />
            <Stat label="Segments / nodes" value={`${net.segs.length} / ${net.nodes.length}`} />
          </div>
        </More>
      </Glass>

      <Glass title={`Reported flooding · ${ev.obs.length} reports`} aside={<Pill>Class B</Pill>}>
        <div key={ev.id}>
          {ev.obs.map((o) => (
            <div className="obs-row" key={o.id}>
              <span className="diamond" />
              <span>
                <b style={{ fontWeight: 600 }}>{o.id}</b>
                <small>{o.type}</small>
              </span>
              <span className="num muted">~{o.depthCm} cm</span>
              <Tag kind={o.quality === 'good' ? 'ok' : 'warn'}>{o.quality}</Tag>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Note>Reports are approximate locations, not measurements. No report does not mean no flooding.</Note>
        </div>
      </Glass>
    </Chapter>
  )
}

/* ───────── 2 · Infrastructure evidence ───────── */
const ico = { agree: <Check size={14} />, disagree: <X size={14} />, neutral: <Minus size={14} /> }

export function EvidenceSection({ net, selSeg, setSelSeg }) {
  const counts = Object.keys(STATUS).map((k) => ({ k, n: net.segs.filter((s) => s.status === k).length }))
  const disputed = counts.find((c) => c.k === 'disputed').n
  const s = net.segs[selSeg]
  const rows = [
    ['Official map', 'Segment is mapped (geometry only; no hydraulic attributes provided)', 'neutral'],
    ['Terrain', ...EVIDENCE_LABELS.terrain[s.evidence.terrain]],
    ['Imagery', ...EVIDENCE_LABELS.imagery[s.evidence.imagery]],
    ['Historical behaviour', ...EVIDENCE_LABELS.hist[s.evidence.hist]],
    ['Connectivity', ...EVIDENCE_LABELS.conn[s.evidence.conn]],
    ['Field observation', ...EVIDENCE_LABELS.obs[s.evidence.obs]],
  ]
  const qLo = segCapacity(s, s.range.diam[0], s.range.block[1])
  const qHi = segCapacity(s, s.range.diam[1], s.range.block[0])
  return (
    <Chapter index={1}>
      <Glass title="Reconciliation status" aside={<span className="muted">{net.segs.length} segments</span>}>
        <BigNum label="Segments where independent evidence disagrees with the official map" tone="warn" unit={`of ${net.segs.length}`}>
          <CountUp value={disputed} />
        </BigNum>
        <div style={{ margin: '24px 0 14px' }}>
          <div className="seg-bar">
            {counts.map(({ k, n }) => (
              <div key={k} style={{ flex: n, background: STATUS[k].color }} title={`${STATUS[k].label}: ${n}`} />
            ))}
          </div>
        </div>
        <div className="legend-dots">
          {counts.map(({ k, n }) => (
            <span key={k}>
              <i style={{ background: STATUS[k].color }} />
              {STATUS[k].label} <b className="num" style={{ color: '#fff', fontWeight: 500 }}>{n}</b>
            </span>
          ))}
        </div>
        <div className="chart-title" style={{ margin: '24px 0 10px' }}>
          Select a drain segment
        </div>
        <Reveal className="seg-matrix" selector="button" stagger={0.02} y={10}>
          {net.segs.map((sg, i) => (
            <button
              key={sg.id}
              className={`seg-cell ${selSeg === i ? 'on' : ''}`}
              style={{ '--c': STATUS[sg.status].color }}
              onClick={() => setSelSeg(i)}
              aria-pressed={selSeg === i}
              aria-label={`${sg.id}, ${STATUS[sg.status].label}`}
            >
              {sg.id}
            </button>
          ))}
        </Reveal>
      </Glass>

      <Glass title={`${s.id} · ${s.cls} drain`} aside={<StatusBadge status={s.status} />}>
        <div key={s.id} style={{ display: 'grid', gap: 18 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="kicker">Independent sources</div>
              <div className="num" style={{ fontSize: 26, marginTop: 4 }}>
                <span className="good">{s.agree.length} agree</span>
                <span className="muted"> · </span>
                <span className="bad">{s.disagree.length} disagree</span>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pill" tabIndex={0}>
                  evidence index · not a probability
                </span>
              </TooltipTrigger>
              <TooltipContent>Counts of agreeing sources. Not a probability.</TooltipContent>
            </Tooltip>
          </div>
          <Reveal as="ul" className="ev-list" selector="li" stagger={0.07} y={14}>
            {rows.map(([label, text, tone]) => (
              <li key={label} className={`ev-${tone}`}>
                <span className="ev-ico">{ico[tone]}</span>
                <div>
                  <b>{label}</b>
                  <small>{text}</small>
                </div>
              </li>
            ))}
          </Reveal>
          {(s.evidence.terrain === 'inconsistent' || s.status === 'disputed') && (
            <Note tone="warn" title="Terrain-scale evidence only.">
              A 30 m DEM cannot resolve individual roadside drains. This flags the segment as inconsistent and worth
              investigating. It does not show the drain is missing or blocked.
            </Note>
          )}
          <More label="Hydraulic parameters · ranges, not exact values">
            <table className="t">
              <tbody>
                <tr>
                  <td className="muted">Mapped equivalent Ø</td>
                  <td className="num">{s.d0.toFixed(1)} m</td>
                  <td style={{ textAlign: 'right' }}><Tag kind="src">sourced (synthetic map)</Tag></td>
                </tr>
                <tr>
                  <td className="muted">Effective Ø factor</td>
                  <td className="num">{s.range.diam[0].toFixed(2)} – {s.range.diam[1].toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}><Tag kind="assumed">assumed</Tag></td>
                </tr>
                <tr>
                  <td className="muted">Blockage fraction</td>
                  <td className="num">{s.range.block[0].toFixed(2)} – {s.range.block[1].toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Tag kind={s.evidence.obs === 'verified_impaired' ? 'est' : 'assumed'}>
                      {s.evidence.obs === 'verified_impaired' ? 'estimated (field audit)' : 'assumed'}
                    </Tag>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Roughness n</td>
                  <td className="num">0.013 × 0.85 – 1.30</td>
                  <td style={{ textAlign: 'right' }}><Tag kind="assumed">assumed</Tag></td>
                </tr>
                <tr>
                  <td>Flow capacity</td>
                  <td className="num">{qLo.toFixed(1)} – {qHi.toFixed(1)} m³/s</td>
                  <td style={{ textAlign: 'right' }}><Tag kind="derived">derived range</Tag></td>
                </tr>
              </tbody>
            </table>
            <Note>Every parameter carries a provenance tag. Nothing here is presented as a measured fact.</Note>
          </More>
        </div>
      </Glass>
    </Chapter>
  )
}

/* ───────── 3 · Baseline simulation ───────── */
const PIPE = ['Rainfall', 'Runoff', 'Drainage model', 'Surface spreading', 'Compare']
const fmtK = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)}k` : fmt(v))

export function SimSection({ ctx }) {
  const { net, ev, events, simStage, runSim, baseRun, baseSpread, spreadStats, match, evalAll, selNode, setSelNode } = ctx
  const floodNodes = net.nodes
    .map((n, i) => ({ n, i, v: baseRun.floodVol[i] }))
    .filter((x) => x.v > 150)
    .sort((a, b) => b.v - a.v)
  const node = selNode != null && net.outSeg[selNode] >= 0 ? selNode : net.hotNode
  const qin = baseRun.qinSeries.slice(node * SIM_STEPS, node * SIM_STEPS + SIM_STEPS)
  const cap = baseRun.qcap[net.outSeg[node]]
  const done = simStage >= 4
  const conserved = (baseSpread.spreadVol / Math.max(1, baseSpread.inputVol)) * 100
  return (
    <Chapter index={2}>
      <Glass
        title="Simulation pipeline"
        aside={
          <button className="btn btn-primary" onClick={runSim} disabled={simStage > 0 && simStage < 5}>
            <Play size={13} fill="currentColor" /> {simStage === 0 ? 'Run simulation' : simStage < 5 ? 'Running…' : 'Run again'}
          </button>
        }
      >
        <ol className="pipeline">
          {PIPE.map((p, i) => (
            <li key={p} className={simStage > i ? 'done' : simStage === i ? 'active' : ''}>
              <span>{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 22 }}>
          <Note title="Node flooding is not a flood map.">
            Volume leaving the drainage model at each node is placed on the terrain by an explicit surface-spreading step
            before any comparison.
          </Note>
        </div>
      </Glass>

      <Glass title="Simulated flooding" aside={<Pill>Class B · baseline</Pill>}>
        <div style={{ opacity: done ? 1 : 0.18, filter: done ? 'none' : 'blur(6px)', transition: 'all 0.8s' }}>
          <BigNum label="Total node flooding, baseline" unit="m³">
            <CountUp value={baseRun.total} format={fmtK} />
          </BigNum>
          <div className="num muted" style={{ fontSize: 12, marginTop: 10 }}>
            Volume conserved by spreading: {conserved.toFixed(1)} %
          </div>
          <More label="Area and depth">
            <div className="stats">
              <Stat label="Surface area" value={spreadStats.areaHa.toFixed(1)} unit="ha" />
              <Stat label="Max depth" value={spreadStats.maxDepth.toFixed(2)} unit="m" />
              <Stat label="Flooded sites" value={floodNodes.length} />
            </div>
          </More>
        </div>
      </Glass>

      <Glass title="Where the model floods">
        <div className="row" style={{ marginBottom: 18 }}>
          {floodNodes.map(({ n, i, v }) => (
            <button key={n.id} className={`chip ${node === i ? 'on' : ''}`} onClick={() => setSelNode(i)}>
              {n.id} <small>{fmtVol(v)} m³</small>
            </button>
          ))}
        </div>
        <div className="chart-title">
          Inflow at <b>{net.nodes[node].id}</b> against capacity of its outgoing pipe <b>{net.segs[net.outSeg[node]].id}</b>
        </div>
        <ChartReveal key={`${ev.id}-${node}`}>
          <Hydrograph qin={qin} cap={cap} flood={baseRun.floodVol[node]} />
        </ChartReveal>
      </Glass>

      <Glass title="Comparison with reports" aside={<Pill>location level</Pill>}>
        <table className="t">
          <thead>
            <tr>
              <th>Event</th>
              <th>Reports reproduced</th>
              <th style={{ textAlign: 'right' }}>Sites without a report</th>
            </tr>
          </thead>
          <tbody>
            {evalAll.map((r, i) => (
              <tr key={r.id} className={events[i].id === ev.id ? 'on' : ''}>
                <td>
                  <b style={{ fontWeight: 600 }}>{r.id}</b> {roleTag(r.role)}
                </td>
                <td className="num">
                  {r.matched} / {r.total}
                  <span className="bar-mini">
                    <i style={{ width: `${(r.matched / r.total) * 100}%` }} />
                  </span>
                </td>
                <td className="num" style={{ textAlign: 'right' }}>{r.unreported}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <Note tone="warn" title="Resolution caveat.">
            Matching uses a ~120 m radius. A site without a report is not proof of no flooding. SYN-3 was never used to
            tune the model.
          </Note>
          <div className="muted" style={{ fontSize: 12 }}>
            Current event {ev.id}: {match.matched} of {match.total} reports reproduced.
          </div>
        </div>
      </Glass>
    </Chapter>
  )
}

/* ───────── 4 · Counterfactual ───────── */
function SliderRow({ label, value, min, max, step, display, hint, onChange }) {
  return (
    <div className="slider-row">
      <div className="top">
        <span>{label}</span>
        <b>{display}</b>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} aria-label={label} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function CfSection({ ctx }) {
  const { net, cf, setCf, baseRun, cfRun, spreadStats, cfStats } = ctx
  const delta = baseRun.total - cfRun.total
  const pct = (delta / Math.max(1, baseRun.total)) * 100
  const none = Math.abs(delta) < 0.5
  const sign = none ? '' : delta >= 0 ? '−' : '+'
  const rows = net.nodes
    .map((n, i) => ({ n, i, b: baseRun.floodVol[i], c: cfRun.floodVol[i] }))
    .filter((r) => r.b > 120 || r.c > 120)
    .sort((a, b) => b.b - a.b)
  const worse = rows.filter((r) => r.c - r.b > 60)
  const isDefault = cf.cap === 0 && cf.block === 0 && cf.rain === 1
  return (
    <Chapter index={3}>
      <Glass title="Change one factor" aside={<button className="btn btn-ghost" onClick={() => setCf({ cap: 0, block: 0, rain: 1 })}>Reset</button>}>
        <div className="row" style={{ marginBottom: 22 }}>
          <button className="chip" onClick={() => setCf({ cap: 1, block: 0, rain: 1 })}>Restore S06 capacity</button>
          <button className="chip" onClick={() => setCf({ cap: 0, block: 1, rain: 1 })}>Clear blockages</button>
          <button className="chip" onClick={() => setCf({ cap: 1, block: 1, rain: 1 })}>Both</button>
        </div>
        <div style={{ display: 'grid', gap: 22 }}>
          <SliderRow
            label="Restore S06 to mapped capacity"
            value={cf.cap}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(cf.cap * 100)} %`}
            onChange={(v) => setCf({ ...cf, cap: v })}
            hint="Disputed segment. Moves its assumed effective diameter back to the official size."
          />
          <SliderRow
            label="Clear blockage on disputed segments"
            value={cf.block}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(cf.block * 100)} %`}
            onChange={(v) => setCf({ ...cf, block: v })}
          />
          <SliderRow
            label="Event rainfall scale"
            value={cf.rain}
            min={0.6}
            max={1.1}
            step={0.05}
            display={`${Math.round(cf.rain * 100)} %`}
            onChange={(v) => setCf({ ...cf, rain: v })}
          />
        </div>
      </Glass>

      <Glass title="Simulated effect" aside={<Pill>Class B · counterfactual</Pill>}>
        <BigNum
          label="ΔFlood = baseline − counterfactual"
          tone={delta >= 0 ? 'good' : 'warn'}
          unit={none ? 'm³ · 0 %' : `m³ · ${delta >= 0 ? '' : '+'}${fmt(-pct, 0)} %`}
        >
          <CountUp value={Math.abs(delta)} format={(v) => `${sign}${fmt(v)}`} />
        </BigNum>
        <div style={{ display: 'grid', gap: 12, margin: '26px 0 8px' }}>
          {[
            ['Baseline', 100, '#fb7185', baseRun.total],
            ['Counterfactual', Math.min(110, (cfRun.total / Math.max(1, baseRun.total)) * 100), '#34d399', cfRun.total],
          ].map(([l, w, c, v]) => (
            <div key={l} style={{ display: 'grid', gridTemplateColumns: '108px 1fr 92px', gap: 14, alignItems: 'center', fontSize: 13 }}>
              <span className="muted">{l}</span>
              <div className="cbar"><i style={{ width: `${w}%`, background: c }} /></div>
              <b className="num" style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(v)} m³</b>
            </div>
          ))}
        </div>
        {worse.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Note tone="warn" title="Non-monotonic response.">
              Flooding increases at {worse.map((w) => w.n.id).join(', ')}. Relief upstream can move water downstream.
            </Note>
          </div>
        )}
        {isDefault && (
          <div style={{ marginTop: 14 }}>
            <Note>Move a slider to run a counterfactual. All values are re-simulated live.</Note>
          </div>
        )}
        <More label="Area, depth and by-site detail">
          <div className="stats">
            <Stat label="Flooded area" value={cfStats.areaHa.toFixed(1)} unit="ha" sub={`was ${spreadStats.areaHa.toFixed(1)}`} />
            <Stat label="Max depth" value={cfStats.maxDepth.toFixed(2)} unit="m" sub={`was ${spreadStats.maxDepth.toFixed(2)}`} />
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Site</th>
                <th style={{ textAlign: 'right' }}>Baseline</th>
                <th style={{ textAlign: 'right' }}>Counterfactual</th>
                <th style={{ textAlign: 'right' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.c - r.b
                return (
                  <tr key={r.n.id}>
                    <td><b style={{ fontWeight: 600 }}>{r.n.id}</b></td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(r.b)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{fmt(r.c)}</td>
                    <td className={`num ${d <= -60 ? 'good' : d >= 60 ? 'bad' : 'flat'}`} style={{ textAlign: 'right' }}>
                      {Math.abs(d) < 5 ? '–' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </More>
        <div style={{ marginTop: 16 }}>
          <Note>Final counterfactual claims come from the physical model, never from a machine-learning surrogate.</Note>
        </div>
      </Glass>
    </Chapter>
  )
}

