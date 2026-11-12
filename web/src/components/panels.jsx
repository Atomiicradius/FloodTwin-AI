import { STATUS } from '../data/network.js'
import { EVIDENCE_LABELS } from '../copy.js'
import { segCapacity, STEPS, DT } from '../model/sim.js'
import { FACTORS, benchCurves, BENCH_DEFAULTS } from '../model/analysis.js'
import {
  Badge,
  Card,
  Icon,
  Note,
  Slider,
  Stat,
  StatusBadge,
  Tag,
  fmt,
  fmtVol,
} from './ui.jsx'
import {
  BenchChart,
  EffectBars,
  FanChart,
  Histogram,
  Hydrograph,
  Hyetograph,
  Parity,
  ShapleyBars,
  Tornado,
} from './charts.jsx'

const roleBadge = (role) =>
  role === 'held-out' ? (
    <Badge tone="violet" icon={Icon.lock}>
      Held out
    </Badge>
  ) : (
    <Badge tone="neutral">Calibration</Badge>
  )

/* ───────────────────────── 1 · Event & location ───────────────────────── */
export function EventPanel({ net, events, evIdx, setEvIdx, ev, focusOn }) {
  return (
    <>
      <Card title="Select a storm event" aside={<Badge tone="amber" icon={Icon.flask}>Synthetic</Badge>}>
        <div className="event-cards">
          {events.map((e, i) => (
            <button key={e.id} className={`event-card ${i === evIdx ? 'on' : ''}`} onClick={() => setEvIdx(i)}>
              <div className="event-card-top">
                <b>{e.id}</b>
                {roleBadge(e.role)}
              </div>
              <div className="event-card-blurb">{e.blurb}</div>
              <div className="event-card-stats num">
                {fmt(e.totalMm)} mm · peak {fmt(e.peakMmH)} mm/h
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Rainfall at gauge G-1" aside={<span className="muted">4 h · 5-min steps</span>}>
        <Hyetograph values={ev.intensity} />
        <div className="stat-row">
          <Stat label="Total" value={fmt(ev.totalMm)} unit="mm" />
          <Stat label="Peak intensity" value={fmt(ev.peakMmH)} unit="mm/h" />
          <Stat label="Duration" value="4" unit="h" />
        </div>
      </Card>

      <Card title="Catchment S-1" aside={<Badge tone="neutral">Class B</Badge>}>
        <div className="stat-row">
          <Stat label="Area" value={fmt(net.areaHa)} unit="ha" />
          <Stat label="Mapped drains" value={net.totalLenKm.toFixed(1)} unit="km" />
          <Stat label="Segments / nodes" value={`${net.segs.length} / ${net.nodes.length}`} />
        </div>
      </Card>

      <Card title={`Reported flooding · ${ev.obs.length} reports`} aside={<span className="muted">tap to locate</span>}>
        <ul className="obs-list">
          {ev.obs.map((o) => (
            <li key={o.id}>
              <button onClick={() => focusOn(o.x, o.y, 2.6)}>
                <span className="obs-dot" />
                <span className="obs-main">
                  <b>{o.id}</b>
                  <small>{o.type}</small>
                </span>
                <span className="num obs-depth">~{o.depthCm} cm</span>
                <Tag kind={o.quality === 'good' ? 'ok' : 'warn'}>{o.quality}</Tag>
              </button>
            </li>
          ))}
        </ul>
        <Note>Reports are approximate locations, not measurements. No report does not mean no flooding.</Note>
      </Card>
    </>
  )
}

/* ───────────────────────── 2 · Evidence ───────────────────────── */
const icoFor = { agree: Icon.check, disagree: Icon.cross, neutral: Icon.dash }

export function EvidencePanel({ net, selSeg, setSelSeg, focusSeg }) {
  const counts = Object.keys(STATUS).map((k) => ({ k, n: net.segs.filter((s) => s.status === k).length }))
  const s = selSeg != null ? net.segs[selSeg] : null
  const rows = s
    ? [
        ['Official map', 'Segment is mapped (geometry only; no hydraulic attributes provided)', 'neutral'],
        ['Terrain', ...EVIDENCE_LABELS.terrain[s.evidence.terrain]],
        ['Imagery', ...EVIDENCE_LABELS.imagery[s.evidence.imagery]],
        ['Historical behaviour', ...EVIDENCE_LABELS.hist[s.evidence.hist]],
        ['Connectivity', ...EVIDENCE_LABELS.conn[s.evidence.conn]],
        ['Field observation', ...EVIDENCE_LABELS.obs[s.evidence.obs]],
      ]
    : []
  const qLo = s ? segCapacity(s, s.range.diam[0], s.range.block[1]) : 0
  const qHi = s ? segCapacity(s, s.range.diam[1], s.range.block[0]) : 0
  return (
    <>
      <Card title="Reconciliation status" aside={<span className="muted">{net.segs.length} segments</span>}>
        <div className="seg-bar">
          {counts.map(({ k, n }) => (
            <div key={k} style={{ flex: n, background: STATUS[k].color }} title={`${STATUS[k].label}: ${n}`} />
          ))}
        </div>
        <div className="count-row">
          {counts.map(({ k, n }) => (
            <span key={k}>
              <i style={{ background: STATUS[k].color }} />
              {STATUS[k].label} <b className="num">{n}</b>
            </span>
          ))}
        </div>
        <div className="quick">
          <span className="muted">Disputed:</span>
          {net.disputedSegs.map((i) => (
            <button key={i} className={`mini ${selSeg === i ? 'on' : ''}`} onClick={() => focusSeg(i)}>
              {net.segs[i].id}
            </button>
          ))}
        </div>
      </Card>

      {s ? (
        <>
          <Card
            title={`${s.id} · ${s.cls} drain`}
            aside={<StatusBadge status={s.status} />}
            className="seg-card"
          >
            <div className="evidence-index">
              <div>
                <span className="muted">Independent sources</span>
                <b className="num">
                  <em className="g">{s.agree.length} agree</em> · <em className="r">{s.disagree.length} disagree</em>
                </b>
              </div>
              <Badge tone="neutral" title="Counts of agreeing sources. Not a probability.">
                evidence index · not a probability
              </Badge>
            </div>
            <ul className="evidence-list">
              {rows.map(([label, text, tone]) => (
                <li key={label} className={`ev-${tone}`}>
                  <span className="ev-ico">{icoFor[tone]}</span>
                  <div>
                    <b>{label}</b>
                    <small>{text}</small>
                  </div>
                </li>
              ))}
            </ul>
            {(s.evidence.terrain === 'inconsistent' || s.status === 'disputed') && (
              <Note tone="warn" title="Terrain-scale evidence only.">
                A 30 m DEM cannot resolve individual roadside drains. This flags the segment as inconsistent and worth
                investigating. It does not show the drain is missing or blocked.
              </Note>
            )}
          </Card>

          <Card title="Hydraulic parameters" aside={<span className="muted">ranges, not exact values</span>}>
            <table className="param-table">
              <tbody>
                <tr>
                  <td>Mapped equivalent Ø</td>
                  <td className="num">{s.d0.toFixed(1)} m</td>
                  <td>
                    <Tag kind="src">sourced (synthetic map)</Tag>
                  </td>
                </tr>
                <tr>
                  <td>Effective Ø factor</td>
                  <td className="num">
                    {s.range.diam[0].toFixed(2)} – {s.range.diam[1].toFixed(2)}
                  </td>
                  <td>
                    <Tag kind="assumed">assumed</Tag>
                  </td>
                </tr>
                <tr>
                  <td>Blockage fraction</td>
                  <td className="num">
                    {s.range.block[0].toFixed(2)} – {s.range.block[1].toFixed(2)}
                  </td>
                  <td>
                    <Tag kind={s.evidence.obs === 'verified_impaired' ? 'est' : 'assumed'}>
                      {s.evidence.obs === 'verified_impaired' ? 'estimated (field audit)' : 'assumed'}
                    </Tag>
                  </td>
                </tr>
                <tr>
                  <td>Roughness n</td>
                  <td className="num">0.013 × 0.85 – 1.30</td>
                  <td>
                    <Tag kind="assumed">assumed</Tag>
                  </td>
                </tr>
                <tr className="strong">
                  <td>Flow capacity</td>
                  <td className="num">
                    {qLo.toFixed(1)} – {qHi.toFixed(1)} m³/s
                  </td>
                  <td>
                    <Tag kind="derived">derived range</Tag>
                  </td>
                </tr>
              </tbody>
            </table>
            <Note>Every parameter carries a provenance tag. Nothing here is presented as a measured fact.</Note>
          </Card>
        </>
      ) : (
        <Card>
          <div className="empty">Select a drain segment on the map to see its evidence.</div>
        </Card>
      )}
    </>
  )
}

/* ───────────────────────── 3 · Baseline simulation ───────────────────────── */
const PIPE = ['Rainfall', 'Runoff', 'Drainage model', 'Surface spreading', 'Compare']

export function SimPanel({ ctx }) {
  const { net, ev, simStage, runSim, baseRun, baseSpread, spreadStats, match, evalAll, selNode, setSelNode, focusOn, events } = ctx
  const floodNodes = net.nodes
    .map((n, i) => ({ n, i, v: baseRun.floodVol[i] }))
    .filter((x) => x.v > 150)
    .sort((a, b) => b.v - a.v)
  const node = selNode != null && net.outSeg[selNode] >= 0 ? selNode : net.hotNode
  const qin = baseRun.qinSeries.slice(node * STEPS, node * STEPS + STEPS)
  const cap = baseRun.qcap[net.outSeg[node]]
  const done = simStage >= 4
  const conserved = (baseSpread.spreadVol / Math.max(1, baseSpread.inputVol)) * 100
  return (
    <>
      <Card
        title="Simulation pipeline"
        aside={
          <button className="btn btn-primary" onClick={runSim} disabled={simStage > 0 && simStage < 5}>
            {Icon.play} {simStage === 0 ? 'Run simulation' : simStage < 5 ? 'Running…' : 'Run again'}
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
        <Note tone="info" title="Node flooding is not a flood map.">
          Volume leaving the drainage model at each node is placed on the terrain by an explicit surface-spreading step
          before any comparison.
        </Note>
      </Card>

      <div className={done ? 'reveal' : 'pending'}>
        <Card title="Simulated flooding" aside={<Badge tone="neutral">Class B · baseline</Badge>}>
          <div className="stat-row">
            <Stat label="Node flooding" value={fmtVol(baseRun.total)} unit="m³" tone="accent" />
            <Stat label="Surface area" value={spreadStats.areaHa.toFixed(1)} unit="ha" />
            <Stat label="Max depth" value={spreadStats.maxDepth.toFixed(2)} unit="m" />
          </div>
          <div className="mini-note num">Volume conserved by spreading: {conserved.toFixed(1)} %</div>
        </Card>

        <Card title="Where the model floods" aside={<span className="muted">tap a site</span>}>
          <div className="quick">
            {floodNodes.map(({ n, i, v }) => (
              <button
                key={n.id}
                className={`mini ${node === i ? 'on' : ''}`}
                onClick={() => {
                  setSelNode(i)
                  focusOn(n.x, n.y, 2.4)
                }}
              >
                {n.id} <small className="num">{fmtVol(v)} m³</small>
              </button>
            ))}
          </div>
          <div className="chart-title">
            Inflow at <b>{net.nodes[node].id}</b> against capacity of its outgoing pipe{' '}
            <b>{net.segs[net.outSeg[node]].id}</b>
          </div>
          <Hydrograph qin={qin} cap={cap} flood={baseRun.floodVol[node]} />
        </Card>

        <Card title="Comparison with reports" aside={<Badge tone="neutral">location level</Badge>}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Reports reproduced</th>
                <th>Sites without a report</th>
              </tr>
            </thead>
            <tbody>
              {evalAll.map((r, i) => (
                <tr key={r.id} className={events[i].id === ev.id ? 'on' : ''}>
                  <td>
                    <b>{r.id}</b> {r.role === 'held-out' ? <Tag kind="violet">held out</Tag> : <Tag kind="neutral">cal.</Tag>}
                  </td>
                  <td className="num">
                    {r.matched} / {r.total}
                    <span className="bar">
                      <i style={{ width: `${(r.matched / r.total) * 100}%` }} />
                    </span>
                  </td>
                  <td className="num">{r.unreported}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note tone="warn" title="Resolution caveat.">
            Matching uses a ~120 m radius. A site without a report is not proof of no flooding. SYN-3 was never used to
            tune the model.
          </Note>
          <div className="mini-note">
            Current event {ev.id}: {match.matched} of {match.total} reports reproduced.
          </div>
        </Card>
      </div>
    </>
  )
}

/* ───────────────────────── 4 · Counterfactual ───────────────────────── */
export function CounterfactualPanel({ ctx }) {
  const { net, cf, setCf, baseRun, cfRun, cfSpread, spreadStats, cfStats, showDelta, setShowDelta, focusOn } = ctx
  const delta = baseRun.total - cfRun.total
  const pct = (delta / Math.max(1, baseRun.total)) * 100
  const rows = net.nodes
    .map((n, i) => ({ n, i, b: baseRun.floodVol[i], c: cfRun.floodVol[i] }))
    .filter((r) => r.b > 120 || r.c > 120)
    .sort((a, b) => b.b - a.b)
  const worse = rows.filter((r) => r.c - r.b > 60)
  const preset = (p) => setCf(p)
  const isDefault = cf.cap === 0 && cf.block === 0 && cf.rain === 1
  return (
    <>
      <Card title="Change one factor" aside={<button className="btn btn-ghost" onClick={() => setCf({ cap: 0, block: 0, rain: 1 })}>Reset</button>}>
        <div className="presets">
          <button className="mini" onClick={() => preset({ cap: 1, block: 0, rain: 1 })}>Restore S06 capacity</button>
          <button className="mini" onClick={() => preset({ cap: 0, block: 1, rain: 1 })}>Clear blockages</button>
          <button className="mini" onClick={() => preset({ cap: 1, block: 1, rain: 1 })}>Both</button>
        </div>
        <Slider
          label="Restore S06 to mapped capacity"
          value={cf.cap}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(cf.cap * 100)} %`}
          onChange={(v) => setCf({ ...cf, cap: v })}
          hint="Disputed segment. Moves its assumed effective diameter back to the official size."
        />
        <Slider
          label="Clear blockage on disputed segments"
          value={cf.block}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(cf.block * 100)} %`}
          onChange={(v) => setCf({ ...cf, block: v })}
        />
        <Slider
          label="Event rainfall scale"
          value={cf.rain}
          min={0.6}
          max={1.1}
          step={0.05}
          display={`${Math.round(cf.rain * 100)} %`}
          onChange={(v) => setCf({ ...cf, rain: v })}
        />
      </Card>

      <Card title="Simulated effect" aside={<Badge tone="neutral">Class B · counterfactual</Badge>}>
        <div className="delta-hero">
          <div>
            <span className="muted">ΔFlood = baseline − counterfactual</span>
            <div className="delta-value num">
              {delta >= 0 ? '−' : '+'}
              {fmt(Math.abs(delta))} <small>m³</small>
              <em className={delta >= 0 ? 'good' : 'bad'}>{delta >= 0 ? '' : '+'}{fmt(-pct, 0)} %</em>
            </div>
          </div>
        </div>
        <div className="compare-bars">
          <div>
            <span>Baseline</span>
            <div className="cbar">
              <i style={{ width: '100%', background: '#fb7185' }} />
            </div>
            <b className="num">{fmt(baseRun.total)} m³</b>
          </div>
          <div>
            <span>Counterfactual</span>
            <div className="cbar">
              <i style={{ width: `${Math.min(110, (cfRun.total / Math.max(1, baseRun.total)) * 100)}%`, background: '#34d399' }} />
            </div>
            <b className="num">{fmt(cfRun.total)} m³</b>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={showDelta} onChange={(e) => setShowDelta(e.target.checked)} />
          <span /> Show change on map
        </label>
        <div className="stat-row">
          <Stat label="Flooded area" value={cfStats.areaHa.toFixed(1)} unit="ha" sub={`was ${spreadStats.areaHa.toFixed(1)}`} />
          <Stat label="Max depth" value={cfStats.maxDepth.toFixed(2)} unit="m" sub={`was ${spreadStats.maxDepth.toFixed(2)}`} />
        </div>
        {worse.length > 0 && (
          <Note tone="warn" title="Non-monotonic response.">
            Flooding increases at {worse.map((w) => w.n.id).join(', ')}. Relief upstream can move water downstream.
          </Note>
        )}
        {isDefault && <Note>Move a slider to run a counterfactual. All values are re-simulated live.</Note>}
      </Card>

      <Card title="By site" aside={<span className="muted">m³ flooded</span>}>
        <table className="site-table">
          <tbody>
            {rows.map((r) => {
              const d = r.c - r.b
              return (
                <tr key={r.n.id} onClick={() => focusOn(r.n.x, r.n.y, 2.4)}>
                  <td>
                    <b>{r.n.id}</b>
                  </td>
                  <td className="num">{fmt(r.b)}</td>
                  <td className="arrow">→</td>
                  <td className="num">{fmt(r.c)}</td>
                  <td className={`num ${d <= -60 ? 'good' : d >= 60 ? 'bad' : 'flat'}`}>{Math.abs(d) < 5 ? '–' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Note>Final counterfactual claims come from the physical model, never from a machine-learning surrogate.</Note>
      </Card>
    </>
  )
}

/* ───────────────────────── 5 · Interactions ───────────────────────── */
export function InteractionPanel({ inter }) {
  const interPct = Math.abs(inter.interaction) / Math.max(1, Math.abs(inter.additive)) * 100
  const interacts = interPct > 10
  return (
    <>
      <Card title="Effect on simulated flood volume" aside={<Badge tone="neutral">all 2³ = 8 runs</Badge>}>
        <EffectBars single={inter.single} additive={inter.additive} combined={inter.combined} factors={FACTORS} />
        <div className={`verdict ${interacts ? 'warn' : 'ok'}`}>
          <b>{interacts ? 'The factors interact.' : 'The factors are roughly additive.'}</b>
          <span>
            Together they remove {fmt(inter.combined)} m³, but the single effects add up to {fmt(inter.additive)} m³: a
            difference of {fmt(Math.abs(inter.interaction))} m³ ({fmt(interPct, 0)} % of the sum).
            {interacts && ' The effects overlap, so no single root cause is named.'}
          </span>
        </div>
      </Card>

      <Card title="Fair share of the combined effect" aside={<span className="muted">Shapley values</span>}>
        <ShapleyBars values={inter.shapley} factors={FACTORS} />
        <Note>
          Shapley values split the combined effect by averaging over all orderings. They describe contribution in this
          model, not causal proof.
        </Note>
      </Card>

      <Card title="All combinations" aside={<span className="muted">flooded volume, m³</span>}>
        <table className="combo-table">
          <thead>
            <tr>
              <th>Capacity</th>
              <th>Blockage</th>
              <th>Rainfall</th>
              <th>Flooded</th>
              <th>Reduction</th>
            </tr>
          </thead>
          <tbody>
            {inter.subsets.map((s) => (
              <tr key={s.mask}>
                {FACTORS.map((f) => (
                  <td key={f.key}>
                    <span className={`dotf ${s.subset.includes(f.key) ? 'on' : ''}`} />
                  </td>
                ))}
                <td className="num">{fmt(s.total)}</td>
                <td className="num">{s.reduction > 1 ? `−${fmt(s.reduction)}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

/* ───────────────────────── 6 · Uncertainty ───────────────────────── */
export function UncertaintyPanel({ ens, cfLabel }) {
  const pctReduced = Math.round(ens.reducedShare * 100)
  return (
    <>
      <Card
        title="Across plausible scenarios"
        aside={
          <Badge tone="neutral">
            Class B · n = {ens.n} · seed {ens.seed}
          </Badge>
        }
      >
        <div className="headline">
          <div className="headline-num num">{pctReduced}%</div>
          <p>
            of {ens.n} scenarios show <b>less simulated flooding</b> with the intervention ({cfLabel}). Median reduction{' '}
            <b className="num">{fmt(ens.deltaStats.med)} m³</b>, with a scenario envelope of{' '}
            <b className="num">
              {fmt(ens.deltaStats.p5)} – {fmt(ens.deltaStats.p95)} m³
            </b>{' '}
            (5th – 95th percentile).
          </p>
        </div>
        <div className="stat-row">
          <Stat label="Baseline median" value={fmtVol(ens.baseStats.med)} unit="m³" sub={`${fmtVol(ens.baseStats.p5)} – ${fmtVol(ens.baseStats.p95)}`} />
          <Stat label="With intervention" value={fmtVol(ens.cfStats.med)} unit="m³" sub={`${fmtVol(ens.cfStats.p5)} – ${fmtVol(ens.cfStats.p95)}`} tone="good" />
        </div>
        <Note tone="warn" title="Scenario envelope, not bounds.">
          The band is the spread of sampled scenarios. It is not a guaranteed lower or upper limit on real risk.
        </Note>
      </Card>

      <Card title="Distribution of total flooding" aside={<span className="muted">coral = baseline · green = intervention</span>}>
        <Histogram base={ens.sBase} cf={ens.sCf} baseStats={ens.baseStats} cfStats={ens.cfStats} />
      </Card>

      <Card title="Flooding at J06 through the event" aside={<span className="muted">median and 5–95 % band</span>}>
        <FanChart band={ens.hotBand} />
      </Card>

      <Card title="Which parameters matter?" aside={<span className="muted">sensitivity</span>}>
        <Tornado items={ens.sensitivity} />
        <Note>
          Strongly correlated parameters are well constrained by flood response; weak ones (for example node storage)
          cannot be identified from flooding alone.
        </Note>
      </Card>
    </>
  )
}

/* ───────────────────────── 7 · AI scalability (full width) ───────────────────────── */
export function AiPanel({ bench, setBench, parity }) {
  const curves = benchCurves(bench)
  const gnnTotal = curves.fixed
  const speedup = bench.tSwmm / bench.tInfer
  const reset = () => setBench({ ...BENCH_DEFAULTS })
  const at = (N) => ({ swmm: N * bench.tSwmm, gnn: curves.fixed + N * bench.tInfer })
  const hr = (s) => (s < 120 ? `${fmt(s)} s` : s < 7200 ? `${fmt(s / 60)} min` : s < 172800 ? `${fmt(s / 3600, 1)} h` : `${fmt(s / 86400, 1)} d`)
  return (
    <div className="ai-grid">
      <div className="ai-banner">
        <Badge tone="amber" icon={Icon.flask}>Illustrative placeholders</Badge>
        <span>
          Nothing on this page has been measured or trained. It shows the shape of the Phase 5 benchmark: runtime, error,
          training cost and break-even.
        </span>
      </div>

      <div className="ai-kpis">
        <Stat label="Direct simulation" value={bench.tSwmm.toFixed(1)} unit="s / run" sub="reference physical model" />
        <Stat label="Surrogate inference" value={fmt(bench.tInfer * 1000)} unit="ms / run" sub={`${fmt(speedup)}× faster per run`} tone="accent" />
        <Stat label="Up-front cost" value={hr(gnnTotal)} sub={`${fmt(bench.nTrain)} training runs + training + verification`} />
        <Stat label="Break-even" value={`≈ ${fmt(curves.breakEven)}`} unit="scenarios" sub="beyond this the surrogate is cheaper" tone="good" />
      </div>

      <Card title="Total time against number of scenarios" className="ai-chart">
        <BenchChart curves={curves} p={bench} />
        <div className="compare-strip">
          {[100, 1000, 10000, 100000].map((N) => {
            const t = at(N)
            const win = t.gnn < t.swmm
            return (
              <div key={N} className={win ? 'win' : ''}>
                <b className="num">{fmt(N)} scenarios</b>
                <span className="num">direct {hr(t.swmm)}</span>
                <span className="num">surrogate {hr(t.gnn)}</span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="ai-side">
        <Card title="Assumptions" aside={<button className="btn btn-ghost" onClick={reset}>Reset</button>}>
          <Slider label="Direct run time" value={bench.tSwmm} min={0.5} max={30} step={0.1} display={`${bench.tSwmm.toFixed(1)} s`} onChange={(v) => setBench({ ...bench, tSwmm: v })} hint="Grows with network size" />
          <Slider label="Training scenarios" value={bench.nTrain} min={200} max={10000} step={100} display={fmt(bench.nTrain)} onChange={(v) => setBench({ ...bench, nTrain: v })} />
          <Slider label="Training time" value={bench.tTrain / 60} min={2} max={180} step={1} display={`${fmt(bench.tTrain / 60)} min`} onChange={(v) => setBench({ ...bench, tTrain: v * 60 })} />
        </Card>
        <Card title="Surrogate vs reference" aside={<span className="muted">held-out scenarios</span>}>
          <Parity points={parity.points} />
          <div className="stat-row tight">
            <Stat label="MAE" value={fmt(parity.mae)} unit="m³" />
            <Stat label="Mean rel. error" value={fmt(parity.relErr * 100, 1)} unit="%" />
          </div>
        </Card>
      </div>

      <div className="ai-foot">
        <Note tone="info" title="The GNN screens; the physical model decides.">
          Shortlisted scenarios are always re-run in SWMM before any engineering claim. A faster model with unacceptable
          error is not useful, so error is always reported next to speed.
        </Note>
      </div>
    </div>
  )
}
