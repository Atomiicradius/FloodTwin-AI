// Synthetic rainfall events and synthetic "observed" flood reports. All invented (class B).
import { mulberry32, uniform } from '../model/util.js'
import { STEPS, DT, centralScenario, cloneScenario, simulate } from '../model/sim.js'

function hyetograph(seed, peak, centre, width, base) {
  const rng = mulberry32(seed)
  const out = new Float64Array(STEPS)
  for (let t = 0; t < STEPS; t++) {
    const g = Math.exp(-((t - centre) ** 2) / (2 * width * width))
    const burst = Math.exp(-((t - centre - 6) ** 2) / (2 * (width * 0.6) ** 2))
    out[t] = Math.max(0, base + peak * (0.8 * g + 0.35 * burst) * uniform(rng, 0.86, 1.1))
  }
  return out
}

export const EVENT_DEFS = [
  { id: 'SYN-1', name: 'Event SYN-1', role: 'calibration', peak: 74, centre: 18, width: 5.5, base: 2, seed: 11, blurb: 'Intense afternoon burst', skip: ['J22'], extra: [] },
  { id: 'SYN-2', name: 'Event SYN-2', role: 'calibration', peak: 62, centre: 24, width: 9, base: 3, seed: 23, blurb: 'Long, moderate storm', skip: [], extra: ['J11'] },
  { id: 'SYN-3', name: 'Event SYN-3', role: 'held-out', peak: 82, centre: 15, width: 4.2, base: 1.5, seed: 37, blurb: 'Short, sharp cell', skip: [], extra: ['J04'] },
]

// The "truth" used to generate synthetic observations: a plausible member of the uncertainty ranges.
function truthScenario(net) {
  const sc = cloneScenario(centralScenario(net))
  sc.diam[net.hotSeg] = 0.8
  sc.block[net.hotSeg] = 0.3
  const s13 = net.segs.findIndex((s) => s.id === 'S13')
  sc.diam[s13] = 0.8
  sc.block[s13] = 0.3
  sc.rain = 1.03
  return sc
}

const REPORT_TYPES = ['Citizen report', 'Field photo', 'Complaint log', 'Citizen report']

export function buildEvents(net) {
  const truth = truthScenario(net)
  return EVENT_DEFS.map((def) => {
    const intensity = hyetograph(def.seed, def.peak, def.centre, def.width, def.base)
    let total = 0
    let max = 0
    for (const v of intensity) {
      total += (v * DT) / 3600
      if (v > max) max = v
    }
    const ev = { ...def, intensity, totalMm: total, peakMmH: max }
    const res = simulate(net, ev, truth)
    const rng = mulberry32(def.seed * 7 + 3)
    const obs = []
    res.floodVol.forEach((vol, n) => {
      if (vol > 260 && !def.skip.includes(net.nodes[n].id)) {
        const node = net.nodes[n]
        obs.push({
          id: `${def.id}-R${obs.length + 1}`,
          x: node.x + uniform(rng, -18, 18),
          y: node.y + uniform(rng, -18, 18),
          type: REPORT_TYPES[obs.length % REPORT_TYPES.length],
          depthCm: Math.round(Math.min(80, 8 + (vol / 140) * (0.6 + rng() * 0.5))),
          quality: rng() < 0.65 ? 'good' : 'fair',
        })
      }
    })
    // reports the baseline model does not reproduce (kept so the comparison is not trivially perfect)
    def.extra.forEach((id) => {
      const node = net.nodes[net.nodeIdx[id]]
      obs.push({
        id: `${def.id}-R${obs.length + 1}`,
        x: node.x + uniform(rng, -14, 14),
        y: node.y + uniform(rng, -14, 14),
        type: 'Citizen report',
        depthCm: Math.round(uniform(rng, 8, 20)),
        quality: 'fair',
      })
    })
    return { ...ev, obs }
  })
}
