import { FlaskConical } from 'lucide-react'
import { FACTORS, benchCurves, BENCH_DEFAULTS } from '../model/analysis.js'
import { Slider } from '@/components/ui/slider.jsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx'
import { ChartReveal, CountUp, Reveal } from '@/motion/primitives.jsx'
import { fmt, fmtVol } from '../components/ui.jsx'
import { BenchChart, EffectBars, FanChart, Histogram, Parity, ShapleyBars, Tornado } from '../components/charts.jsx'
import { BigNum, Chapter, Glass, More, Note, Pill, Stat } from './kit.jsx'

/* ───────── 5 · Interactions ───────── */
export function InteractionSection({ inter }) {
  const interPct = (Math.abs(inter.interaction) / Math.max(1, Math.abs(inter.additive))) * 100
  const interacts = interPct > 10
  return (
    <Chapter index={4}>
      <Glass title="Effect on simulated flood volume" aside={<Pill>all 2³ = 8 runs</Pill>}>
        <BigNum
          label={interacts ? 'Share of the summed single effects that does not add up' : 'Difference between summed and combined effects'}
          tone={interacts ? 'warn' : ''}
          unit="% of the sum"
        >
          <CountUp value={interPct} />
        </BigNum>
        <div style={{ margin: '26px 0 22px' }}>
          <ChartReveal>
            <EffectBars single={inter.single} additive={inter.additive} combined={inter.combined} factors={FACTORS} />
          </ChartReveal>
        </div>
        <div className={`verdict ${interacts ? '' : 'ok'}`}>
          <b>{interacts ? 'The factors interact.' : 'The factors are roughly additive.'}</b>
          <span>
            Together they remove {fmt(inter.combined)} m³, but the single effects add up to {fmt(inter.additive)} m³: a
            difference of {fmt(Math.abs(inter.interaction))} m³ ({fmt(interPct, 0)} % of the sum).
            {interacts && ' The effects overlap, so no single root cause is named.'}
          </span>
        </div>
      </Glass>

      <Glass title="Fair share of the combined effect" aside={<span className="muted">Shapley values</span>}>
        <ShapleyBars values={inter.shapley} factors={FACTORS} />
        <div style={{ marginTop: 18 }}>
          <Note>
            Shapley values split the combined effect by averaging over all orderings. They describe contribution in this
            model, not causal proof.
          </Note>
        </div>
      </Glass>

      <Glass title="All combinations" aside={<span className="muted">flooded volume, m³</span>}>
        <More label="Show the eight runs">
          <table className="t">
            <thead>
              <tr>
                <th>Capacity</th>
                <th>Blockage</th>
                <th>Rainfall</th>
                <th style={{ textAlign: 'right' }}>Flooded</th>
                <th style={{ textAlign: 'right' }}>Reduction</th>
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
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(s.total)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{s.reduction > 1 ? `−${fmt(s.reduction)}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </More>
      </Glass>
    </Chapter>
  )
}

/* ───────── 6 · Uncertainty ───────── */
export function UncertaintySection({ ens, cfLabel }) {
  const pctReduced = Math.round(ens.reducedShare * 100)
  return (
    <Chapter index={5}>
      <Glass title="Across plausible scenarios" aside={<Pill>Class B · n = {ens.n} · seed {ens.seed}</Pill>}>
        <BigNum label={`of ${ens.n} scenarios show less simulated flooding with the intervention`} tone="good" unit="%">
          <CountUp value={pctReduced} />
        </BigNum>
        <p style={{ marginTop: 18, fontSize: 14.5, lineHeight: 1.6, color: '#b9c6db', maxWidth: 520 }}>
          Intervention: {cfLabel}. Median reduction{' '}
          <b className="num" style={{ color: '#fff', fontWeight: 500 }}>{fmt(ens.deltaStats.med)} m³</b>, with a scenario envelope of{' '}
          <b className="num" style={{ color: '#fff', fontWeight: 500 }}>
            {fmt(ens.deltaStats.p5)} – {fmt(ens.deltaStats.p95)} m³
          </b>{' '}
          (5th – 95th percentile).
        </p>
        <More label="Baseline and intervention medians">
          <div className="stats">
            <Stat label="Baseline median" value={fmtVol(ens.baseStats.med)} unit="m³" sub={`${fmtVol(ens.baseStats.p5)} – ${fmtVol(ens.baseStats.p95)}`} />
            <Stat label="With intervention" value={fmtVol(ens.cfStats.med)} unit="m³" sub={`${fmtVol(ens.cfStats.p5)} – ${fmtVol(ens.cfStats.p95)}`} />
          </div>
        </More>
        <div style={{ marginTop: 14 }}>
          <Note tone="warn" title="Scenario envelope, not bounds.">
            The band is the spread of sampled scenarios. It is not a guaranteed lower or upper limit on real risk.
          </Note>
        </div>
      </Glass>

      <Glass title="Look at the spread">
        <Tabs defaultValue="dist">
          <TabsList>
            <TabsTrigger value="dist">Distribution</TabsTrigger>
            <TabsTrigger value="time">Through the event</TabsTrigger>
            <TabsTrigger value="params">Parameters</TabsTrigger>
          </TabsList>
          <TabsContent value="dist">
            <div className="chart-title">Total flooding · coral = baseline · green = intervention</div>
            <ChartReveal>
              <Histogram base={ens.sBase} cf={ens.sCf} baseStats={ens.baseStats} cfStats={ens.cfStats} />
            </ChartReveal>
          </TabsContent>
          <TabsContent value="time">
            <div className="chart-title">Flooding at J06 through the event · median and 5–95 % band</div>
            <ChartReveal>
              <FanChart band={ens.hotBand} />
            </ChartReveal>
          </TabsContent>
          <TabsContent value="params">
            <div className="chart-title">Which parameters matter? · sensitivity</div>
            <ChartReveal>
              <Tornado items={ens.sensitivity} />
            </ChartReveal>
            <div style={{ marginTop: 14 }}>
              <Note>
                Strongly correlated parameters are well constrained by flood response; weak ones (for example node
                storage) cannot be identified from flooding alone.
              </Note>
            </div>
          </TabsContent>
        </Tabs>
      </Glass>
    </Chapter>
  )
}

/* ───────── 7 · AI scalability ───────── */
export function AiSection({ bench, setBench, parity }) {
  const curves = benchCurves(bench)
  const speedup = bench.tSwmm / bench.tInfer
  const reset = () => setBench({ ...BENCH_DEFAULTS })
  const hr = (s) => (s < 120 ? `${fmt(s)} s` : s < 7200 ? `${fmt(s / 60)} min` : s < 172800 ? `${fmt(s / 3600, 1)} h` : `${fmt(s / 86400, 1)} d`)
  const at = (N) => ({ swmm: N * bench.tSwmm, gnn: curves.fixed + N * bench.tInfer })
  return (
    <Chapter index={6} wide>
      <Reveal className="row" style={{ padding: '14px 18px', borderRadius: 16, border: '1px dashed rgba(251,191,36,.5)', background: 'rgba(251,191,36,.06)', fontSize: 13.5, color: '#c3cfe2', gap: 14 }}>
        <Pill tone="amber" icon={<FlaskConical size={12} />}>Illustrative placeholders</Pill>
        <span>
          Nothing on this page has been measured or trained. It shows the shape of the Phase 5 benchmark: runtime, error,
          training cost and break-even.
        </span>
      </Reveal>

      <div className="ai-grid">
        <Glass title="Total time against number of scenarios">
          <BigNum label="Break-even: beyond this many scenarios the surrogate is cheaper" unit="scenarios" tone="good">
            <span style={{ fontSize: '0.55em', verticalAlign: '0.2em', marginRight: '0.12em' }}>≈</span>
            <CountUp value={curves.breakEven} />
          </BigNum>
          <div style={{ marginTop: 22 }}>
            <ChartReveal>
              <BenchChart curves={curves} p={bench} />
            </ChartReveal>
          </div>
          <div className="strip">
            {[100, 1000, 10000, 100000].map((N) => {
              const t = at(N)
              return (
                <div key={N} className={t.gnn < t.swmm ? 'win' : ''}>
                  <b className="num">{fmt(N)} scenarios</b>
                  <span className="num">direct {hr(t.swmm)}</span>
                  <span className="num">surrogate {hr(t.gnn)}</span>
                </div>
              )
            })}
          </div>
          <More label="Per-run speed, up-front cost and accuracy">
            <div className="stats">
              <Stat label="Direct simulation" value={bench.tSwmm.toFixed(1)} unit="s / run" sub="reference physical model" />
              <Stat label="Surrogate inference" value={fmt(bench.tInfer * 1000)} unit="ms / run" sub={`${fmt(speedup)}× faster per run`} />
              <Stat label="Up-front cost" value={hr(curves.fixed)} sub={`${fmt(bench.nTrain)} training runs + training + verification`} />
            </div>
            <div className="ai-grid" style={{ gridTemplateColumns: '240px 1fr', alignItems: 'center' }}>
              <Parity points={parity.points} />
              <div className="stats">
                <Stat label="MAE" value={fmt(parity.mae)} unit="m³" />
                <Stat label="Mean rel. error" value={fmt(parity.relErr * 100, 1)} unit="%" />
                <div className="muted" style={{ fontSize: 12, gridColumn: '1 / -1' }}>
                  Surrogate vs reference on held-out scenarios (illustrative).
                </div>
              </div>
            </div>
          </More>
        </Glass>

        <div style={{ display: 'grid', gap: 22 }}>
          <Glass title="Assumptions" aside={<button className="btn btn-ghost" onClick={reset}>Reset</button>}>
            <div style={{ display: 'grid', gap: 22 }}>
              <BenchSlider label="Direct run time" hint="Grows with network size" value={bench.tSwmm} min={0.5} max={30} step={0.1} display={`${bench.tSwmm.toFixed(1)} s`} onChange={(v) => setBench({ ...bench, tSwmm: v })} />
              <BenchSlider label="Training scenarios" value={bench.nTrain} min={200} max={10000} step={100} display={fmt(bench.nTrain)} onChange={(v) => setBench({ ...bench, nTrain: v })} />
              <BenchSlider label="Training time" value={bench.tTrain / 60} min={2} max={180} step={1} display={`${fmt(bench.tTrain / 60)} min`} onChange={(v) => setBench({ ...bench, tTrain: v * 60 })} />
            </div>
          </Glass>
          <Glass>
            <Note title="The GNN screens; the physical model decides.">
              Shortlisted scenarios are always re-run in SWMM before any engineering claim. A faster model with
              unacceptable error is not useful, so error is always reported next to speed.
            </Note>
          </Glass>
        </div>
      </div>
    </Chapter>
  )
}

function BenchSlider({ label, hint, value, min, max, step, display, onChange }) {
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
