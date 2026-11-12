// ?lite fallback: a plain 2D canvas stage (contours, glowing pipes, flood blooms) for weak machines.
// Same state, same scroll-driven camera path as the 3D scene; no WebGL, no postprocessing.
import { useEffect, useRef } from 'react'
import { buildNetwork, STATUS } from '../data/network.js'
import { buildGrid, CELL, NX, NY } from '../data/terrain.js'
import { stageBus } from '../motion/index.js'
import { chapterT } from './path.js'
import { COLORS, SC, STATUS_HEX, floodRadius } from './constants.js'
import { RAIN_BY_STEP, camBus, prefersReduced, stageState } from './state.js'
import { ScrollTrigger } from '../motion/index.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const damp = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, dt * rate)
const lerp = (a, b, t) => a + (b - a) * t
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// contour segments by marching squares on the terrain grid (grid units)
function contourSegments(z, step) {
  const lo = Math.floor(Math.min(...z) / step) * step
  const hi = Math.max(...z)
  const out = []
  const P = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL]
  for (let L = lo; L <= hi; L += step) {
    const major = Math.round(L / step) % 5 === 0
    for (let j = 0; j < NY - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = z[j * NX + i]
        const b = z[j * NX + i + 1]
        const c = z[(j + 1) * NX + i + 1]
        const d = z[(j + 1) * NX + i]
        const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0)
        if (idx === 0 || idx === 15) continue
        const [x0, y0] = P(i, j)
        const edge = (e) => {
          if (e === 0) return [x0 + CELL * ((L - a) / (b - a)), y0]
          if (e === 1) return [x0 + CELL, y0 + CELL * ((L - b) / (c - b))]
          if (e === 2) return [x0 + CELL * ((L - d) / (c - d)), y0 + CELL]
          return [x0, y0 + CELL * ((L - a) / (d - a))]
        }
        const table = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 3], [1, 2]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []]
        for (const [e1, e2] of table[idx]) {
          const p = edge(e1)
          const q = edge(e2)
          out.push([p[0], p[1], q[0], q[1], major ? 1 : 0])
        }
      }
    }
  }
  return out
}

// 2D camera poses [x, y, k] where k is px per grid unit as a fraction of the screen width
const POSES = [
  [520, 360, 0.46], // 0 hero
  [560, 270, 0.95], // 1 gauge
  null, // 2 follows the selected segment
  [450, 410, 1.05], // 3 J06
  [450, 410, 1.0], // 4
  [480, 400, 0.62], // 5 disputed overview
  [500, 360, 0.56], // 6 overview
  [500, 340, 0.5], // 7 graph
]

export default function LiteStage() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduced = prefersReduced()
    const net = buildNetwork()
    const z = buildGrid()
    const segs = contourSegments(z, 0.5)
    let W = 0
    let H = 0
    let layer = null
    let raf = 0
    let last = performance.now()
    let time = 0
    const ripples = []
    let nextRipple = 0
    let rainK = 1
    const st = {
      t: 0,
      cam: { x: 520, y: 360, k: 0.46 },
      cx: 0.795,
      status: 0,
      fade: 1,
      graph: 0,
      sel: 0,
      pipes: net.segs.map(() => ({ dash: 0 })),
      floods: net.nodes.map(() => ({ r: 0, rb: 0, a: 0, ring: 0 })),
      ghost: 0,
    }
    const drops = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random() * 0.6 }))
    const parts = []
    net.segs.forEach((s, i) => {
      const n = s.cls === 'primary' ? 5 : s.cls === 'secondary' ? 3 : 2
      for (let k = 0; k < n; k++) parts.push({ i, u: Math.random(), v: 0.07 + Math.random() * 0.05 })
    })

    // baked terrain contour layer (soft edge baked in)
    const buildLayer = () => {
      const sx = 1.6
      const c = document.createElement('canvas')
      c.width = 1000 * sx
      c.height = 700 * sx
      const g = c.getContext('2d')
      g.scale(sx, sx)
      g.lineWidth = 0.8
      for (const major of [0, 1]) {
        g.beginPath()
        for (const s of segs) if (s[4] === major) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]) }
        g.strokeStyle = major ? 'rgba(80,170,215,0.5)' : 'rgba(70,150,195,0.26)'
        g.lineWidth = major ? 1.1 : 0.8
        g.stroke()
      }
      g.globalCompositeOperation = 'destination-in'
      const m = g.createRadialGradient(500, 350, 120, 500, 350, 560)
      m.addColorStop(0.55, 'rgba(0,0,0,1)')
      m.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = m
      g.fillRect(0, 0, 1000, 700)
      layer = { c, sx }
    }
    buildLayer()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduced) draw(0)
    }

    const measure = () => {
      camBus.anchors = [0, ...[...document.querySelectorAll('[data-chapter]')].map((el) => el.getBoundingClientRect().top + window.scrollY)]
      camBus.vh = window.innerHeight
    }
    measure()
    const trig = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => (camBus.scrollY = self.scroll()) })
    ScrollTrigger.addEventListener('refresh', measure)
    const late = setTimeout(measure, 800)

    function draw(dt) {
      const S = stageState
      const active = S.active
      time += dt
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#04070d'
      ctx.fillRect(0, 0, W, H)

      // ----- camera -----
      const target = reduced ? 6 : chapterT(camBus.scrollY, camBus.anchors, camBus.vh)
      st.t = reduced ? target : damp(st.t, target, 5.5, dt)
      const t = st.t
      const sel = S.selSeg ?? net.hotSeg
      const sg = net.segs[sel]
      const selMid = [(net.nodes[sg.from].x + net.nodes[sg.to].x) / 2, (net.nodes[sg.from].y + net.nodes[sg.to].y) / 2]
      st.sel = reduced ? 1 : damp(st.sel, 1, 3, dt)
      const poses = POSES.map((p) => p ?? [selMid[0], selMid[1], 1.25])
      const i = Math.min(poses.length - 2, Math.floor(t))
      const f = clamp01(t - i)
      const camT = [lerp(poses[i][0], poses[i + 1][0], f), lerp(poses[i][1], poses[i + 1][1], f), lerp(poses[i][2], poses[i + 1][2], f)]
      st.cam.x = reduced ? camT[0] : damp(st.cam.x, camT[0], 6, dt)
      st.cam.y = reduced ? camT[1] : damp(st.cam.y, camT[1], 6, dt)
      st.cam.k = reduced ? camT[2] : damp(st.cam.k, camT[2], 6, dt)
      const mix = reduced ? (active === 0 ? 0 : 1) : stageBus.mix
      const cxT = 0.795 + (0.3 - 0.795) * mix + (0.62 - 0.3) * clamp01(t - 6) * mix
      st.cx = reduced ? cxT : damp(st.cx, cxT, 6, dt)
      const k = st.cam.k * W / 1000 * 1.0
      const ox = st.cx * W - st.cam.x * k
      const oy = H * 0.5 - st.cam.y * k
      const X = (x) => ox + x * k
      const Y = (y) => oy + y * k

      // ----- ambient ripples + hero rain -----
      rainK = damp(rainK, RAIN_BY_STEP[active] ?? 0.15, 1.6, dt)
      if (!reduced && time > nextRipple && ripples.length < 14) {
        ripples.push({ x: Math.random() * W, y: Math.random() * H, born: time })
        nextRipple = time + 0.18 + (1 - rainK) * 1.1
      }
      ctx.lineWidth = 1
      for (let r = ripples.length - 1; r >= 0; r--) {
        const age = time - ripples[r].born
        if (age > 3.4) { ripples.splice(r, 1); continue }
        const a = Math.exp(-age * 1.2) * 0.2 * (0.4 + rainK * 0.6)
        ctx.strokeStyle = `rgba(80,190,230,${a})`
        ctx.beginPath()
        ctx.arc(ripples[r].x, ripples[r].y, 6 + age * 38, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (reduced && !ripples.length) {
        for (let q = 0; q < 6; q++) ripples.push({ x: ((q * 0.37 + 0.1) % 1) * W, y: ((q * 0.53 + 0.2) % 1) * H, born: -0.4 - q * 0.2 })
        for (const r of ripples) {
          ctx.strokeStyle = 'rgba(80,190,230,0.1)'
          ctx.beginPath()
          ctx.arc(r.x, r.y, 14 + (0.4 + 0.2) * 38, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // ----- terrain -----
      const dissolve = damp(st.fade, active === 7 ? 0.08 : 1, 2.2, dt)
      st.fade = reduced ? (active === 7 ? 0.08 : 1) : dissolve
      ctx.globalAlpha = st.fade
      ctx.drawImage(layer.c, X(0), Y(0), 1000 * k, 700 * k)
      ctx.globalAlpha = 1

      // catchment outline
      ctx.save()
      ctx.setLineDash([8, 7])
      ctx.strokeStyle = `rgba(56,189,248,${0.3 * st.fade})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      net.perimeter.forEach(([x, y], n) => (n ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      ctx.closePath()
      ctx.stroke()
      ctx.restore()

      // ----- drains -----
      const g = reduced ? 1 : clamp01((time - 0.9) / 4.4)
      const statusMode = active === 2 || active === 5
      st.status = reduced ? (statusMode ? 1 : 0) : damp(st.status, statusMode ? 1 : 0, 3, dt)
      const pulse = 0.65 + 0.35 * Math.sin(time * 3.2)
      const pipeAlpha = st.fade > 0.5 ? 1 : st.fade * 2
      net.segs.forEach((s, n) => {
        const a = net.nodes[s.from]
        const b = net.nodes[s.to]
        const xm = (a.x + b.x) / 2
        const draw1 = clamp01(g * 1.7 - (1 - xm / 1000) * 0.6)
        if (draw1 <= 0 || pipeAlpha <= 0.01) return
        const disputed = s.status === 'disputed'
        const p = st.pipes[n]
        p.dash = damp(p.dash, active === 0 ? (s.id === 'S06' ? 1 : 0) : statusMode && disputed ? 1 : 0, 4, dt)
        const col = statusMode || st.status > 0.02 ? lerpHex(COLORS.pipe, STATUS_HEX[s.status], st.status) : COLORS.pipe
        const w = s.cls === 'primary' ? 4 : s.cls === 'secondary' ? 3 : 2
        const x2 = a.x + (b.x - a.x) * draw1
        const y2 = a.y + (b.y - a.y) * draw1
        const sel2 = active === 2 && S.selSeg === n
        ctx.save()
        ctx.lineCap = 'round'
        ctx.setLineDash(p.dash > 0.5 ? [7, 6] : [])
        ctx.globalAlpha = pipeAlpha * (p.dash > 0.5 ? 0.5 + 0.5 * pulse : 1)
        ctx.strokeStyle = rgba(col, 0.14) // cheap glow
        ctx.lineWidth = w + 9
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke()
        ctx.strokeStyle = sel2 ? '#ffffff' : col
        ctx.lineWidth = w + (sel2 ? 1.5 : 0)
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke()
        ctx.restore()
      })

      // flow particles
      if (g > 0.85 && active !== 7) {
        ctx.fillStyle = 'rgba(200,240,255,0.9)'
        parts.forEach((q) => {
          q.u = (q.u + (reduced ? 0 : q.v * dt)) % 1
          const s = net.segs[q.i]
          const a = net.nodes[s.from]
          const b = net.nodes[s.to]
          ctx.beginPath()
          ctx.arc(X(a.x + (b.x - a.x) * q.u), Y(a.y + (b.y - a.y) * q.u), 1.8, 0, Math.PI * 2)
          ctx.fill()
        })
      }
      // nodes + gauge
      if (active !== 7) {
        ctx.fillStyle = '#cfeeff'
        net.nodes.forEach((n) => {
          ctx.beginPath()
          ctx.arc(X(n.x), Y(n.y), n.kind === 'outfall' ? 5 : 3, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.strokeStyle = 'rgba(125,211,252,0.85)'
        ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.arc(X(net.gauge.x), Y(net.gauge.y), 9, 0, Math.PI * 2); ctx.stroke()
      }

      // ----- flooding -----
      if (S.baseVol) {
        const gate = active === 3 ? (S.simStage >= 4 ? 1 : S.simStage >= 3 ? 0.4 : 0) : active >= 4 && active <= 6 ? 1 : 0
        const alphaT = active === 7 ? 0 : active === 6 ? 0.4 : 1
        const vols = active === 4 ? S.cfVol : S.baseVol
        net.nodes.forEach((node, n) => {
          if (node.kind === 'outfall') return
          const f2 = st.floods[n]
          f2.r = damp(f2.r, (floodRadius(vols[n]) / SC) * gate, reduced ? 100 : 2.6, dt)
          f2.rb = damp(f2.rb, (floodRadius(S.baseVol[n]) / SC) * gate, reduced ? 100 : 2.6, dt)
          f2.a = damp(f2.a, alphaT, 3, dt)
          if (f2.r * k > 4 && f2.a > 0.02) {
            const R = f2.r * k * 1.15
            const gr = ctx.createRadialGradient(X(node.x), Y(node.y), 0, X(node.x), Y(node.y), R)
            gr.addColorStop(0, rgba(COLORS.floodDeep, 0.62 * f2.a))
            gr.addColorStop(0.7, rgba(COLORS.floodShallow, 0.3 * f2.a))
            gr.addColorStop(1, rgba(COLORS.floodShallow, 0))
            ctx.fillStyle = gr
            ctx.beginPath(); ctx.arc(X(node.x), Y(node.y), R, 0, Math.PI * 2); ctx.fill()
          }
          const showRef = active === 4 && f2.rb > 6 ? clamp01((1 - f2.r / Math.max(f2.rb, 1)) * 3) : 0
          f2.ring = damp(f2.ring, showRef, 4, dt)
          if (f2.ring > 0.02) {
            ctx.save()
            ctx.setLineDash([9, 8])
            ctx.strokeStyle = rgba(COLORS.coral, 0.9 * f2.ring)
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(X(node.x), Y(node.y), f2.rb * k * 1.15, 0, Math.PI * 2); ctx.stroke()
            ctx.restore()
          }
        })
        // ensemble ghost blooms
        st.ghost = damp(st.ghost, active === 6 && S.freqBase ? 1 : 0, 2.5, dt)
        if (st.ghost > 0.02) {
          net.nodes.forEach((node, n) => {
            const fb = S.freqBase[n]
            const fc = S.freqCf[n]
            if (fb < 0.03) return
            const rB = Math.max(floodRadius(S.baseVol[n]) / SC, (0.1 + 0.85 * fb) / SC) * k
            const gr = ctx.createRadialGradient(X(node.x), Y(node.y), 0, X(node.x), Y(node.y), rB * 1.5)
            gr.addColorStop(0, rgba(COLORS.coral, 0.26 * st.ghost * (0.4 + fb)))
            gr.addColorStop(1, rgba(COLORS.coral, 0))
            ctx.fillStyle = gr
            ctx.beginPath(); ctx.arc(X(node.x), Y(node.y), rB * 1.5, 0, Math.PI * 2); ctx.fill()
            if (fc >= 0.03) {
              const rC = Math.max(floodRadius(S.cfVol[n]) / SC, (0.08 + 0.7 * fc) / SC) * k
              const g2 = ctx.createRadialGradient(X(node.x), Y(node.y), 0, X(node.x), Y(node.y), rC * 1.3)
              g2.addColorStop(0, rgba(COLORS.mint, 0.2 * st.ghost * (0.4 + fc)))
              g2.addColorStop(1, rgba(COLORS.mint, 0))
              ctx.fillStyle = g2
              ctx.beginPath(); ctx.arc(X(node.x), Y(node.y), rC * 1.3, 0, Math.PI * 2); ctx.fill()
            }
          })
        }
      }

      // ----- step 7: abstract graph -----
      st.graph = reduced ? (active === 7 ? 1 : 0) : damp(st.graph, active === 7 ? 1 : 0, 1.8, dt)
      if (st.graph > 0.02) {
        const rank = new Array(net.nodes.length).fill(0)
        net.order.forEach((id, r) => (rank[id] = r))
        const pos = net.nodes.map((n, q) => [500 + (n.x - 500) * 1.05, 350 + (n.y - 350) * 1.05 - (1 - rank[q] / net.nodes.length) * 70])
        ctx.strokeStyle = `rgba(150,225,255,${0.8 * st.graph})`
        ctx.lineWidth = 1.2
        net.segs.forEach((s) => {
          ctx.beginPath(); ctx.moveTo(X(pos[s.from][0]), Y(pos[s.from][1])); ctx.lineTo(X(pos[s.to][0]), Y(pos[s.to][1])); ctx.stroke()
        })
        ctx.fillStyle = `rgba(210,240,255,${st.graph})`
        pos.forEach((p2, q) => {
          ctx.beginPath(); ctx.arc(X(p2[0]), Y(p2[1]), net.nodes[q].kind === 'outfall' ? 6 : 4, 0, Math.PI * 2); ctx.fill()
        })
      }

      // ----- hero rain -----
      const rainA = reduced ? 0 : Math.max(0, 1 - mix * 1.25)
      if (rainA > 0.02) {
        ctx.strokeStyle = `rgba(160,220,255,${0.35 * rainA})`
        ctx.lineWidth = 1
        ctx.beginPath()
        drops.forEach((d) => {
          d.y = (d.y + d.v * dt * 0.9) % 1
          const x = d.x * W
          const y = d.y * H
          ctx.moveTo(x, y)
          ctx.lineTo(x + 3, y + 16)
        })
        ctx.stroke()
      }
    }

    const lerpHex = (a, b, m) => {
      const pa = parseInt(a.slice(1), 16)
      const pb = parseInt(b.slice(1), 16)
      const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, m))
      return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
    }

    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(dt)
      raf = requestAnimationFrame(loop)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    const onState = () => reduced && draw(0)
    window.addEventListener('stage-update', onState)
    if (!reduced) raf = requestAnimationFrame(loop)
    else draw(0)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(late)
      trig.kill()
      ScrollTrigger.removeEventListener('refresh', measure)
      window.removeEventListener('resize', resize)
      window.removeEventListener('stage-update', onState)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}
