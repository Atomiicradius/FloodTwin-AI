// Counterfactuals, interaction (Shapley) analysis, ensembles, observation matching, and the GNN benchmark curve.
import { mulberry32, uniform, quantile, sortedCopy, spearman } from './util.js'
import { STEPS, centralScenario, cloneScenario, simulate } from './sim.js'
import { NX, NY, CELL } from '../data/terrain.js'

// ---- counterfactual modifications ----
export const NO_CF = { cap: 0, block: 0, rain: 1 }

export function applyMods(net, sc, mods) {
  const out = cloneScenario(sc)
  const h = net.hotSeg
  out.diam[h] = out.diam[h] + (1 - out.diam[h]) * mods.cap
  for (const k of net.disputedSegs) out.block[k] = out.block[k] * (1 - mods.block)
  out.rain = sc.rain * mods.rain
  return out
}

export const FACTORS = [
  { key: 'cap', label: 'Restore mapped capacity (S06)', short: 'Capacity', mods: { cap: 1, block: 0, rain: 1 } },
  { key: 'block', label: 'Clear blockage (disputed segments)', short: 'Blockage', mods: { cap: 0, block: 1, rain: 1 } },
  { key: 'rain', label: 'Normalise rainfall (−10 %)', short: 'Rainfall', mods: { cap: 0, block: 0, rain: 0.9 } },
]

export function modsFromSubset(subset) {
  const m = { cap: 0, block: 0, rain: 1 }
  if (subset.includes('cap')) m.cap = 1
  if (subset.includes('block')) m.block = 1
  if (subset.includes('rain')) m.rain = 0.9
  return m
}

// All 2^k combinations evaluated directly; v(S) = reduction in total flood volume relative to baseline.
export function interactionAnalysis(net, ev, base) {
  const baseTotal = simulate(net, ev, base).total
  const keys = FACTORS.map((f) => f.key)
  const subsets = []
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const subset = keys.filter((_, i) => mask & (1 << i))
    const total = simulate(net, ev, applyMods(net, base, modsFromSubset(subset))).total
    subsets.push({ mask, subset, total, reduction: baseTotal - total })
  }
  const v = (mask) => subsets[mask].reduction
  const n = keys.length
  const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1))
  const shapley = keys.map((_, i) => {
    let phi = 0
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << i)) continue
      let size = 0
      for (let b = 0; b < n; b++) if (mask & (1 << b)) size++
      phi += ((fact(size) * fact(n - size - 1)) / fact(n)) * (v(mask | (1 << i)) - v(mask))
    }
    return phi
  })
  const single = keys.map((_, i) => v(1 << i))
  const additive = single.reduce((a, b) => a + b, 0)
  const combined = v((1 << n) - 1)
  return { baseTotal, subsets, shapley, single, additive, combined, interaction: combined - additive }
}

// ---- uncertainty ensemble ----
export function sampleScenario(net, rng) {
  const sc = centralScenario(net)
  net.segs.forEach((s, k) => {
    sc.diam[k] = uniform(rng, s.range.diam[0], s.range.diam[1])
    sc.block[k] = uniform(rng, s.range.block[0], s.range.block[1])
  })
  sc.rain = uniform(rng, 0.88, 1.12)
  sc.nMult = uniform(rng, 0.85, 1.3)
  sc.storageMult = uniform(rng, 0.5, 1.5)
  return sc
}

export const ENSEMBLE_N = 300

export function runEnsemble(net, ev, mods, n = ENSEMBLE_N, seed = 4242) {
  const rng = mulberry32(seed)
  const nN = net.nodes.length
  const base = new Float64Array(n)
  const cf = new Float64Array(n)
  const freqBase = new Float64Array(nN)
  const freqCf = new Float64Array(nN)
  const hotBase = []
  const hotCf = []
  const params = {
    'Rainfall scale': new Float64Array(n),
    'Roughness (Manning n)': new Float64Array(n),
    'Node storage': new Float64Array(n),
    'S06 effective diameter': new Float64Array(n),
    'S06 blockage': new Float64Array(n),
  }
  const hot = net.hotNode
  const cum = (series) => {
    const out = new Float32Array(STEPS)
    let c = 0
    for (let t = 0; t < STEPS; t++) {
      c += series[hot * STEPS + t]
      out[t] = c
    }
    return out
  }
  for (let i = 0; i < n; i++) {
    const sc = sampleScenario(net, rng)
    const a = simulate(net, ev, sc, { series: true })
    const b = simulate(net, ev, applyMods(net, sc, mods), { series: true })
    base[i] = a.total
    cf[i] = b.total
    for (let k = 0; k < nN; k++) {
      if (a.floodVol[k] > 150) freqBase[k]++
      if (b.floodVol[k] > 150) freqCf[k]++
    }
    hotBase.push(cum(a.floodSeries))
    hotCf.push(cum(b.floodSeries))
    params['Rainfall scale'][i] = sc.rain
    params['Roughness (Manning n)'][i] = sc.nMult
    params['Node storage'][i] = sc.storageMult
    params['S06 effective diameter'][i] = sc.diam[net.hotSeg]
    params['S06 blockage'][i] = sc.block[net.hotSeg]
  }
  const delta = Float64Array.from(base, (v, i) => v - cf[i])
  const sBase = sortedCopy(base)
  const sCf = sortedCopy(cf)
  const sDelta = sortedCopy(delta)
  let reduced = 0
  for (const d of delta) if (d > 1) reduced++
  const band = (arrs) => {
    const lo = new Float32Array(STEPS)
    const md = new Float32Array(STEPS)
    const hi = new Float32Array(STEPS)
    const col = new Float64Array(arrs.length)
    for (let t = 0; t < STEPS; t++) {
      for (let i = 0; i < arrs.length; i++) col[i] = arrs[i][t]
      const s = Float64Array.from(col).sort()
      lo[t] = quantile(s, 0.05)
      md[t] = quantile(s, 0.5)
      hi[t] = quantile(s, 0.95)
    }
    return { lo, md, hi }
  }
  const sensitivity = Object.entries(params)
    .map(([name, vals]) => ({ name, rho: spearman(vals, base) }))
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
  return {
    n,
    seed,
    base,
    cf,
    sBase,
    sCf,
    baseStats: { p5: quantile(sBase, 0.05), med: quantile(sBase, 0.5), p95: quantile(sBase, 0.95) },
    cfStats: { p5: quantile(sCf, 0.05), med: quantile(sCf, 0.5), p95: quantile(sCf, 0.95) },
    deltaStats: { p5: quantile(sDelta, 0.05), med: quantile(sDelta, 0.5), p95: quantile(sDelta, 0.95) },
    reducedShare: reduced / n,
    reducedCount: reduced,
    freqBase: Array.from(freqBase, (v) => v / n),
    freqCf: Array.from(freqCf, (v) => v / n),
    hotBand: { base: band(hotBase), cf: band(hotCf) },
    sensitivity,
  }
}

// ---- comparison with synthetic observations ----
export function matchObservations(depth, obs, nodes, floodVol, radius = 60, thr = 0.05) {
  const rc = Math.ceil(radius / CELL)
  const reports = obs.map((o) => {
    const ci = Math.floor(o.x / CELL)
    const cj = Math.floor(o.y / CELL)
    let hit = false
    for (let dj = -rc; dj <= rc && !hit; dj++) {
      for (let di = -rc; di <= rc; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue
        if (Math.hypot((i + 0.5) * CELL - o.x, (j + 0.5) * CELL - o.y) > radius) continue
        if (depth[j * NX + i] >= thr) {
          hit = true
          break
        }
      }
    }
    return { ...o, matched: hit }
  })
  const sites = []
  floodVol.forEach((v, n) => {
    if (v > 260) {
      const node = nodes[n]
      const reported = obs.some((o) => Math.hypot(o.x - node.x, o.y - node.y) < 70)
      sites.push({ id: node.id, vol: v, reported })
    }
  })
  const matched = reports.filter((r) => r.matched).length
  return { reports, matched, total: obs.length, sites, unreported: sites.filter((s) => !s.reported).length }
}

// ---- GNN scalability benchmark (illustrative placeholders, not measured) ----
export const BENCH_DEFAULTS = { tSwmm: 4.2, nTrain: 2000, tTrain: 900, tInfer: 0.012, kVerify: 25 }

export function benchCurves(p) {
  const fixed = p.nTrain * p.tSwmm + p.tTrain + p.kVerify * p.tSwmm
  const breakEven = fixed / (p.tSwmm - p.tInfer)
  const pts = []
  for (let e = 0; e <= 6; e += 0.1) {
    const N = Math.pow(10, e)
    pts.push({ N, swmm: N * p.tSwmm, gnn: fixed + N * p.tInfer })
  }
  return { fixed, breakEven, pts }
}

export function parityPoints(seed = 99, n = 90) {
  const rng = mulberry32(seed)
  const out = []
  for (let i = 0; i < n; i++) {
    const truth = Math.exp(uniform(rng, Math.log(30), Math.log(24000)))
    const g1 = (rng() + rng() + rng() - 1.5) * 0.18
    const pred = Math.max(0, truth * (1 + g1) + (rng() - 0.5) * 60)
    out.push({ truth, pred })
  }
  let mae = 0
  let rel = 0
  let se = 0
  out.forEach((p) => {
    mae += Math.abs(p.pred - p.truth)
    se += (p.pred - p.truth) ** 2
    rel += Math.abs(p.pred - p.truth) / p.truth
  })
  return { points: out, mae: mae / n, rmse: Math.sqrt(se / n), relErr: rel / n }
}
