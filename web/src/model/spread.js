// Explicit surface-spreading step: SWMM-style node flood volumes -> depth grid on the DEM.
// Volume-conserving priority-flood fill (each node's volume fills its local basin from the lowest cells up).
import { MinHeap } from './util.js'
import { NX, NY, CELL, CELL_AREA_M2, cellOf } from '../data/terrain.js'

const SEED_RADIUS = 4 // cells (~80 m): surface runoff from a node drains to the nearest local low

const MAX_CELLS = 1400
export const WINDOW_UNITS = 85 // local ponding window around each node (~170 m); routing beyond it is not modelled

function levelFor(region, z, vol) {
  // water level L such that sum(max(0, L - z)) * cellArea = vol
  const v = vol / CELL_AREA_M2
  let lo = Infinity
  let hi = -Infinity
  for (const c of region) {
    if (z[c] < lo) lo = z[c]
    if (z[c] > hi) hi = z[c]
  }
  let a = lo
  let b = hi + v / region.length + 1
  for (let it = 0; it < 32; it++) {
    const m = (a + b) / 2
    let s = 0
    for (const c of region) if (m > z[c]) s += m - z[c]
    if (s > v) b = m
    else a = m
  }
  return (a + b) / 2
}

function lowestNear(z, c0) {
  const ci = c0 % NX
  const cj = (c0 / NX) | 0
  let best = c0
  for (let dj = -SEED_RADIUS; dj <= SEED_RADIUS; dj++) {
    for (let di = -SEED_RADIUS; di <= SEED_RADIUS; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= NX || j >= NY || di * di + dj * dj > SEED_RADIUS * SEED_RADIUS) continue
      if (z[j * NX + i] < z[best]) best = j * NX + i
    }
  }
  return best
}

export function spreadFlood(z, floods) {
  const depth = new Float32Array(NX * NY)
  let spread = 0
  let input = 0
  for (const f of floods) {
    if (f.vol < 5) continue
    input += f.vol
    const seed = lowestNear(z, cellOf(f.x, f.y))
    const inRegion = new Uint8Array(NX * NY)
    const region = [seed]
    inRegion[seed] = 1
    const heap = new MinHeap()
    const push = (c) => {
      const ci = c % NX
      const cj = (c / NX) | 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue
          const idx = nj * NX + ni
          if (inRegion[idx] === 2) continue
          if (Math.hypot((ni + 0.5) * CELL - f.x, (nj + 0.5) * CELL - f.y) > WINDOW_UNITS) continue
          inRegion[idx] = 2 // queued marker
          heap.push(z[idx], idx)
        }
      }
    }
    inRegion[seed] = 2
    push(seed)
    let level = levelFor(region, z, f.vol)
    let grow = 0
    while (heap.size && region.length < MAX_CELLS && heap.peekKey() < level) {
      const c = heap.pop()
      region.push(c)
      push(c)
      grow++
      if (grow % 3 === 0 || region.length < 12) level = levelFor(region, z, f.vol)
    }
    level = levelFor(region, z, f.vol)
    for (const c of region) {
      const d = level - z[c]
      if (d > 0) {
        depth[c] += d
        spread += d * CELL_AREA_M2
      }
    }
  }
  return { depth, spreadVol: spread, inputVol: input }
}

export function floodStats(depth, thr = 0.05) {
  let wet = 0
  let max = 0
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] >= thr) wet++
    if (depth[i] > max) max = depth[i]
  }
  return { wetCells: wet, areaHa: (wet * CELL_AREA_M2) / 1e4, maxDepth: max }
}
