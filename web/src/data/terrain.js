// Synthetic terrain for the demo catchment. Local grid, 1 unit = 2 m. Not georeferenced.
import { MinHeap } from '../model/util.js'

export const W = 1000
export const H = 700
export const UNIT_M = 2
export const NX = 100
export const NY = 70
export const CELL = W / NX // 10 units = 20 m
export const CELL_AREA_M2 = (CELL * UNIT_M) ** 2

// Gentle regional slope towards the SW outfall plus low spots where water ponds.
const LOWS = [
  { x: 430, y: 425, a: -1.15, s: 52 },
  { x: 778, y: 470, a: -0.95, s: 40 },
  { x: 440, y: 292, a: -0.85, s: 40 },
  { x: 250, y: 610, a: -0.9, s: 44 },
  { x: 612, y: 292, a: -0.7, s: 40 },
  { x: 770, y: 150, a: 0.9, s: 70 },
  { x: 540, y: 520, a: 0.8, s: 80 },
  { x: 200, y: 300, a: 0.7, s: 90 },
]

export function slopeCoord(x, y) {
  return x * 0.855 - y * 0.519
}

export function elevation(x, y) {
  let z = 900 + 0.008 * slopeCoord(x, y)
  for (const b of LOWS) {
    const d2 = (x - b.x) ** 2 + (y - b.y) ** 2
    z += b.a * Math.exp(-d2 / (2 * b.s * b.s))
  }
  z +=
    0.16 * Math.sin(x * 0.021 + 1.3) * Math.cos(y * 0.027 + 0.4) +
    0.09 * Math.sin(x * 0.047 + y * 0.039 + 2.1)
  return z
}

export function buildGrid() {
  const z = new Float32Array(NX * NY)
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      z[j * NX + i] = elevation((i + 0.5) * CELL, (j + 0.5) * CELL)
    }
  }
  return z
}

export const cellOf = (x, y) => {
  const i = Math.min(NX - 1, Math.max(0, Math.floor(x / CELL)))
  const j = Math.min(NY - 1, Math.max(0, Math.floor(y / CELL)))
  return j * NX + i
}

export const cellCenter = (idx) => ({
  x: ((idx % NX) + 0.5) * CELL,
  y: (Math.floor(idx / NX) + 0.5) * CELL,
})

// D8 flow directions + accumulation on a depression-filled DEM (priority-flood).
export function flowAccumulation(z) {
  const n = NX * NY
  const filled = new Float64Array(z)
  const parent = new Int32Array(n).fill(-2)
  const closed = new Uint8Array(n)
  const order = []
  const heap = new MinHeap()
  const eps = 1e-5
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      if (i === 0 || j === 0 || i === NX - 1 || j === NY - 1) {
        const idx = j * NX + i
        parent[idx] = -1
        closed[idx] = 1
        heap.push(filled[idx], idx)
      }
    }
  }
  while (heap.size) {
    const c = heap.pop()
    order.push(c)
    const ci = c % NX
    const cj = (c / NX) | 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue
        const nIdx = nj * NX + ni
        if (closed[nIdx]) continue
        closed[nIdx] = 1
        parent[nIdx] = c
        filled[nIdx] = Math.max(filled[nIdx], filled[c] + eps)
        heap.push(filled[nIdx], nIdx)
      }
    }
  }
  const acc = new Float64Array(n).fill(1)
  for (let k = order.length - 1; k >= 0; k--) {
    const c = order[k]
    if (parent[c] >= 0) acc[parent[c]] += acc[c]
  }
  return { acc, parent }
}

// ---- image renderers (canvas -> data URL), called once in the browser ----

export function renderTerrainImage() {
  const w = 620
  const h = 434
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(w, h)
  const zs = new Float32Array(w * h)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      zs[py * w + px] = elevation(((px + 0.5) / w) * W, ((py + 0.5) / h) * H)
    }
  }
  const zMin = 893.6
  const zMax = 907.6
  const lerpC = (a, b, t) => a + (b - a) * t
  const lo = [13, 38, 58]
  const mid = [26, 66, 88]
  const hi = [74, 94, 110]
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px
      const z = zs[i]
      const t = Math.min(1, Math.max(0, (z - zMin) / (zMax - zMin)))
      const c0 = t < 0.5 ? lo : mid
      const c1 = t < 0.5 ? mid : hi
      const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2
      let r = lerpC(c0[0], c1[0], tt)
      let g = lerpC(c0[1], c1[1], tt)
      let b = lerpC(c0[2], c1[2], tt)
      const zx = zs[py * w + Math.min(w - 1, px + 1)] - zs[py * w + Math.max(0, px - 1)]
      const zy = zs[Math.min(h - 1, py + 1) * w + px] - zs[Math.max(0, py - 1) * w + px]
      const shade = 1 + (-zx * 0.9 - zy * 0.7) * 5.5
      const sh = Math.min(1.35, Math.max(0.65, shade))
      r *= sh
      g *= sh
      b *= sh
      const level = Math.floor(z / 0.4)
      const rightL = Math.floor(zs[py * w + Math.min(w - 1, px + 1)] / 0.4)
      const downL = Math.floor(zs[Math.min(h - 1, py + 1) * w + px] / 0.4)
      if (level !== rightL || level !== downL) {
        r += 20
        g += 26
        b += 30
      }
      const o = i * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export function renderFlowImage(acc, parent, threshold = 40) {
  const scale = 6
  const canvas = document.createElement('canvas')
  canvas.width = NX * scale
  canvas.height = NY * scale
  const ctx = canvas.getContext('2d')
  ctx.lineCap = 'round'
  for (let idx = 0; idx < acc.length; idx++) {
    if (acc[idx] < threshold || parent[idx] < 0) continue
    const p = parent[idx]
    const a = Math.min(1, Math.log(acc[idx] / threshold + 1) / 3.2)
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.1 + a * 0.42})`
    ctx.lineWidth = 0.7 + a * 2.2
    ctx.beginPath()
    ctx.moveTo(((idx % NX) + 0.5) * scale, (Math.floor(idx / NX) + 0.5) * scale)
    ctx.lineTo(((p % NX) + 0.5) * scale, (Math.floor(p / NX) + 0.5) * scale)
    ctx.stroke()
  }
  return canvas.toDataURL('image/png')
}

// Depth ramp: shallow cyan -> deep indigo. depth in metres.
function depthColor(d) {
  const t = Math.min(1, d / 0.9)
  const r = Math.round(120 - 80 * t)
  const g = Math.round(220 - 130 * t)
  const b = Math.round(255 - 30 * t)
  const a = Math.min(0.92, 0.35 + 0.75 * t)
  return [r, g, b, a * 255]
}

export function renderDepthImage(depth, minDepth = 0.02) {
  const canvas = document.createElement('canvas')
  canvas.width = NX
  canvas.height = NY
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(NX, NY)
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] < minDepth) continue
    const [r, g, b, a] = depthColor(depth[i])
    const o = i * 4
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  const up = document.createElement('canvas')
  up.width = NX * 5
  up.height = NY * 5
  const uctx = up.getContext('2d')
  uctx.imageSmoothingEnabled = true
  uctx.imageSmoothingQuality = 'high'
  uctx.filter = 'blur(2.2px)'
  uctx.drawImage(canvas, 0, 0, up.width, up.height)
  return up.toDataURL('image/png')
}

// Green where the counterfactual dries cells, red where it floods new ones.
export function renderDeltaImage(base, cf, thr = 0.03) {
  const canvas = document.createElement('canvas')
  canvas.width = NX
  canvas.height = NY
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(NX, NY)
  for (let i = 0; i < base.length; i++) {
    const d = cf[i] - base[i]
    if (Math.abs(d) < thr) continue
    const o = i * 4
    const a = Math.min(0.9, 0.35 + Math.abs(d))
    if (d < 0) {
      img.data[o] = 52
      img.data[o + 1] = 211
      img.data[o + 2] = 153
    } else {
      img.data[o] = 248
      img.data[o + 1] = 113
      img.data[o + 2] = 113
    }
    img.data[o + 3] = a * 255
  }
  ctx.putImageData(img, 0, 0)
  const up = document.createElement('canvas')
  up.width = NX * 5
  up.height = NY * 5
  const uctx = up.getContext('2d')
  uctx.imageSmoothingEnabled = true
  uctx.filter = 'blur(1.6px)'
  uctx.drawImage(canvas, 0, 0, up.width, up.height)
  return up.toDataURL('image/png')
}
