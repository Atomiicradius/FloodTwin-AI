// Synthetic drainage network + evidence table. Everything here is invented for the demo (class B).
import { mulberry32, uniform } from '../model/util.js'
import { elevation, slopeCoord, UNIT_M } from './terrain.js'

const NODE_SPEC = [
  // main channel (primary)
  ['J01', 900, 110], ['J02', 800, 170], ['J03', 700, 250], ['J04', 610, 290], ['J05', 520, 370],
  ['J06', 430, 420], ['J07', 340, 470], ['J08', 240, 520], ['J09', 150, 570], ['OF1', 60, 620],
  // branch A (north)
  ['J10', 650, 70], ['J11', 640, 180],
  // branch B (east)
  ['J12', 880, 500], ['J13', 780, 470], ['J14', 680, 440], ['J15', 590, 410],
  // branch C (north-west of main)
  ['J16', 520, 110], ['J17', 480, 200], ['J18', 440, 290], ['J19', 420, 360],
  // branch D (south)
  ['J20', 430, 650], ['J21', 340, 640], ['J22', 250, 610],
  // tertiary tributaries
  ['J23', 260, 410], ['J24', 120, 440], ['J25', 900, 260],
]

// id, from, to, class
const SEG_SPEC = [
  ['S01', 'J01', 'J02', 'primary'], ['S02', 'J02', 'J03', 'primary'], ['S03', 'J03', 'J04', 'primary'],
  ['S04', 'J04', 'J05', 'primary'], ['S05', 'J05', 'J06', 'primary'], ['S06', 'J06', 'J07', 'primary'],
  ['S07', 'J07', 'J08', 'primary'], ['S08', 'J08', 'J09', 'primary'], ['S09', 'J09', 'OF1', 'primary'],
  ['S10', 'J10', 'J11', 'secondary'], ['S11', 'J11', 'J04', 'secondary'],
  ['S12', 'J12', 'J13', 'secondary'], ['S13', 'J13', 'J14', 'secondary'], ['S14', 'J14', 'J15', 'secondary'],
  ['S15', 'J15', 'J05', 'secondary'],
  ['S16', 'J16', 'J17', 'secondary'], ['S17', 'J17', 'J18', 'secondary'], ['S18', 'J18', 'J19', 'secondary'],
  ['S19', 'J19', 'J06', 'secondary'],
  ['S20', 'J20', 'J21', 'secondary'], ['S21', 'J21', 'J22', 'secondary'], ['S22', 'J22', 'J09', 'secondary'],
  ['S23', 'J23', 'J08', 'tertiary'], ['S24', 'J24', 'J09', 'tertiary'], ['S25', 'J25', 'J03', 'tertiary'],
]

// Independent evidence per segment. terrain: consistent | inconsistent | weak
// imagery: visible | not_visible | unavailable ; hist: consistent | suggests_restriction | no_data
// conn: ok | dead_end | unclear ; obs: none | verified_ok | verified_impaired
const E = (terrain, imagery, hist, conn, obs) => ({ terrain, imagery, hist, conn, obs })
const EVIDENCE = {
  S01: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S02: E('consistent', 'visible', 'consistent', 'ok', 'none'),
  S03: E('consistent', 'unavailable', 'consistent', 'ok', 'none'),
  S04: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S05: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
  S06: E('inconsistent', 'not_visible', 'suggests_restriction', 'ok', 'none'),
  S07: E('consistent', 'visible', 'consistent', 'ok', 'none'),
  S08: E('consistent', 'visible', 'consistent', 'ok', 'verified_ok'),
  S09: E('consistent', 'unavailable', 'no_data', 'ok', 'none'),
  S10: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S11: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
  S12: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S13: E('inconsistent', 'visible', 'suggests_restriction', 'ok', 'none'),
  S14: E('consistent', 'visible', 'consistent', 'ok', 'none'),
  S15: E('consistent', 'visible', 'suggests_restriction', 'ok', 'verified_impaired'),
  S16: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S17: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
  S18: E('consistent', 'not_visible', 'no_data', 'unclear', 'none'),
  S19: E('consistent', 'visible', 'consistent', 'ok', 'none'),
  S20: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
  S21: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S22: E('inconsistent', 'unavailable', 'no_data', 'dead_end', 'none'),
  S23: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
  S24: E('consistent', 'visible', 'no_data', 'ok', 'none'),
  S25: E('weak', 'unavailable', 'no_data', 'ok', 'none'),
}

export const STATUS = {
  observed: { label: 'Observed / verified', color: '#a78bfa' },
  supported: { label: 'Supported', color: '#34d399' },
  disputed: { label: 'Disputed', color: '#fbbf24' },
  unverified: { label: 'Unverified', color: '#94a3b8' },
}

// Deterministic rule: direct observation > any independent disagreement > >=2 agreeing sources.
export function evidenceSummary(ev) {
  const agree = []
  const disagree = []
  if (ev.terrain === 'consistent') agree.push('terrain')
  if (ev.terrain === 'inconsistent') disagree.push('terrain')
  if (ev.imagery === 'visible') agree.push('imagery')
  if (ev.imagery === 'not_visible') disagree.push('imagery')
  if (ev.hist === 'consistent') agree.push('historical behaviour')
  if (ev.hist === 'suggests_restriction') disagree.push('historical behaviour')
  if (ev.conn === 'dead_end' || ev.conn === 'unclear') disagree.push('connectivity')
  if (ev.conn === 'ok') agree.push('connectivity')
  let status = 'unverified'
  if (ev.obs !== 'none') status = 'observed'
  else if (disagree.length >= 1) status = 'disputed'
  else if (agree.length >= 2) status = 'supported'
  return { status, agree, disagree }
}

// Uncertain-parameter ranges by status. diam = multiplier on mapped size, blockage = fraction of area lost.
function rangesFor(status, ev) {
  if (status === 'disputed') return { diam: [0.55, 1.0], block: [0.1, 0.6], centralDiam: 0.88, centralBlock: 0.24 }
  if (status === 'observed' && ev.obs === 'verified_impaired')
    return { diam: [0.85, 1.0], block: [0.25, 0.5], centralDiam: 0.95, centralBlock: 0.38 }
  if (status === 'observed') return { diam: [0.95, 1.0], block: [0, 0.05], centralDiam: 1, centralBlock: 0.02 }
  if (status === 'supported') return { diam: [0.9, 1.0], block: [0, 0.15], centralDiam: 0.97, centralBlock: 0.06 }
  return { diam: [0.75, 1.0], block: [0, 0.3], centralDiam: 0.9, centralBlock: 0.12 }
}

const MANNING_N = 0.013
const DESIGN_I = 55 // mm/h, synthetic design intensity used only to size the mapped pipes
const SIZING = 1.55

export function manningQ(D, slope, n = MANNING_N) {
  return (1 / n) * (Math.PI / 4) * D * D * Math.pow(D / 4, 2 / 3) * Math.sqrt(slope)
}

export function buildNetwork() {
  const rng = mulberry32(20241104)
  const nodes = NODE_SPEC.map(([id, x, y]) => ({
    id,
    x,
    y,
    z: elevation(x, y),
    kind: id.startsWith('OF') ? 'outfall' : 'junction',
    area: id.startsWith('OF') ? 0 : uniform(rng, 6, 12),
    imperv: id.startsWith('OF') ? 0 : uniform(rng, 0.55, 0.82),
    storage: id.startsWith('OF') ? 0 : uniform(rng, 250, 650),
  }))
  const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n.id, i]))

  const segs = SEG_SPEC.map(([id, from, to, cls]) => {
    const a = nodes[nodeIdx[from]]
    const b = nodes[nodeIdx[to]]
    const lenU = Math.hypot(a.x - b.x, a.y - b.y)
    const lenM = lenU * UNIT_M
    const ds = slopeCoord(a.x, a.y) - slopeCoord(b.x, b.y)
    const slope = Math.max(0.0015, (0.008 * ds) / lenM) // pipe invert follows regional slope
    return { id, from: nodeIdx[from], to: nodeIdx[to], fromId: from, toId: to, cls, lenU, lenM, slope }
  })

  // routing order: upstream first
  const outSeg = new Int32Array(nodes.length).fill(-1)
  const indeg = new Int32Array(nodes.length)
  segs.forEach((s, k) => {
    outSeg[s.from] = k
    indeg[s.to]++
  })
  const order = []
  const queue = []
  nodes.forEach((_, i) => {
    if (!indeg[i]) queue.push(i)
  })
  while (queue.length) {
    const n = queue.shift()
    order.push(n)
    const sg = outSeg[n]
    if (sg >= 0 && --indeg[segs[sg].to] === 0) queue.push(segs[sg].to)
  }

  // upstream contributing area -> mapped pipe size
  const upArea = new Float64Array(nodes.length)
  order.forEach((n) => {
    upArea[n] += nodes[n].area * nodes[n].imperv
    const sg = outSeg[n]
    if (sg >= 0) upArea[segs[sg].to] += upArea[n]
  })
  segs.forEach((s) => {
    const qDesign = (upArea[s.from] * DESIGN_I) / 360
    const D = Math.pow((qDesign * SIZING * MANNING_N) / (0.3117 * Math.sqrt(s.slope)), 3 / 8)
    s.d0 = Math.ceil(D * 10) / 10 // mapped (official) equivalent diameter, m
    s.upArea = upArea[s.from]
    s.evidence = EVIDENCE[s.id]
    const sum = evidenceSummary(s.evidence)
    s.status = sum.status
    s.agree = sum.agree
    s.disagree = sum.disagree
    s.range = rangesFor(sum.status, s.evidence)
  })

  const perimeter = [
    [960, 40], [760, 30], [560, 40], [430, 70], [380, 170], [330, 300], [250, 360], [130, 380],
    [40, 470], [30, 600], [80, 670], [230, 680], [400, 690], [520, 660], [680, 570],
    [830, 560], [940, 520], [975, 380], [985, 200],
  ]

  return {
    nodes,
    segs,
    nodeIdx,
    outSeg,
    order,
    perimeter,
    hotSeg: segs.findIndex((s) => s.id === 'S06'),
    hotNode: nodeIdx.J06,
    gauge: { id: 'G-1', x: 560, y: 205 },
    disputedSegs: segs.map((s, i) => (s.status === 'disputed' ? i : -1)).filter((i) => i >= 0),
    totalLenKm: segs.reduce((a, s) => a + s.lenM, 0) / 1000,
    areaHa: nodes.reduce((a, n) => a + n.area, 0),
  }
}
