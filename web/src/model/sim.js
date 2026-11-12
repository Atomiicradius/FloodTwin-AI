// Simplified 1D network routing used only for the demo ("SWMM-lite"). Not EPA SWMM.
import { manningQ } from '../data/network.js'

export const DT = 300 // s
export const STEPS = 48 // 4 h

export function centralScenario(net) {
  return {
    rain: 1,
    nMult: 1,
    storageMult: 1,
    diam: Float64Array.from(net.segs, (s) => s.range.centralDiam),
    block: Float64Array.from(net.segs, (s) => s.range.centralBlock),
  }
}

export function cloneScenario(sc) {
  return { ...sc, diam: Float64Array.from(sc.diam), block: Float64Array.from(sc.block) }
}

export function segCapacity(seg, diamMult, block, nMult = 1) {
  const D = seg.d0 * diamMult
  return manningQ(D, seg.slope, 0.013 * nMult) * (1 - block)
}

export function simulate(net, ev, sc, opts = {}) {
  const { nodes, segs, order, outSeg } = net
  const nN = nodes.length
  const qcap = segs.map((s, k) => segCapacity(s, sc.diam[k], sc.block[k], sc.nMult))
  const stored = new Float64Array(nN)
  const floodVol = new Float64Array(nN)
  const qinSeries = opts.series ? new Float32Array(nN * STEPS) : null
  const floodSeries = opts.series ? new Float32Array(nN * STEPS) : null
  const qin = new Float64Array(nN)

  for (let t = 0; t < STEPS; t++) {
    const i = ev.intensity[t] * sc.rain
    qin.fill(0)
    for (let o = 0; o < order.length; o++) {
      const n = order[o]
      const node = nodes[n]
      qin[n] += (node.imperv * node.area * i) / 360
      const sg = outSeg[n]
      if (sg < 0) {
        if (qinSeries) qinSeries[n * STEPS + t] = qin[n]
        continue
      }
      const avail = qin[n] + stored[n] / DT
      const out = Math.min(avail, qcap[sg])
      const rem = (avail - out) * DT
      const vs = node.storage * sc.storageMult
      const keep = Math.min(rem, vs)
      stored[n] = keep
      const flood = rem - keep
      floodVol[n] += flood
      qin[segs[sg].to] += out
      if (qinSeries) {
        qinSeries[n * STEPS + t] = qin[n]
        floodSeries[n * STEPS + t] = flood
      }
    }
  }
  let total = 0
  for (let n = 0; n < nN; n++) total += floodVol[n]
  return { floodVol, total, qcap, qinSeries, floodSeries }
}
