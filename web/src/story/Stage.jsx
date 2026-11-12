// Pinned full-height visual stage. Placeholder for the map: rain (hero) crossfading into flowing water lines.
// Pure canvas, one rAF loop, DPR capped; renders a single still frame under prefers-reduced-motion.
import { useEffect, useRef } from 'react'
import { gsap, prefersReducedMotion, stageBus } from '@/motion/index.js'

const HUES = [200, 204, 152, 214, 168, 268, 192, 226]

function makeDrops(n) {
  return Array.from({ length: n }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random(),
  }))
}

export default function Stage({ active, sectionTitle, presenter, wide }) {
  const canvasRef = useRef(null)
  const state = useRef({ hue: 200, targetHue: 200, mix: 0, level: 0 })
  const ghostRef = useRef(null)

  // tween the accent hue per section and publish it as a CSS variable for the UI
  useEffect(() => {
    const target = HUES[active] ?? 200
    state.current.targetHue = target
    gsap.to(state.current, {
      hue: target,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => document.documentElement.style.setProperty('--accent-h', state.current.hue.toFixed(1)),
    })
  }, [active])

  useEffect(() => {
    const el = ghostRef.current
    if (!el) return
    gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out' })
  }, [sectionTitle])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const reduced = prefersReducedMotion()
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let drops = []
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drops = makeDrops(Math.round(Math.min(380, (w * h) / 5500)))
      if (reduced) draw(0)
    }

    const draw = (t) => {
      const s = state.current
      const hue = s.hue
      const mix = Math.min(1, Math.max(0, stageBus.mix)) // 0 = hero, 1 = story
      // backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, `hsl(${hue} 55% 5%)`)
      bg.addColorStop(1, `hsl(${hue + 10} 60% ${7 + mix * 2}%)`)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      const glow = ctx.createRadialGradient(w * 0.3, h * 0.55, 0, w * 0.3, h * 0.55, w * 0.55)
      glow.addColorStop(0, `hsla(${hue} 90% 55% / ${0.13 + mix * 0.04})`)
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // rain (hero)
      const rainA = 1 - mix
      if (rainA > 0.02) {
        ctx.lineCap = 'round'
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath()
          const speed = 0.45 + layer * 0.35
          const len = 14 + layer * 16
          for (const d of drops) {
            if (Math.floor(d.z * 3) !== layer) continue
            const y = (((d.y + (reduced ? 0 : t * 0.0006 * speed)) % 1) + 1) % 1
            const x = (d.x * 1.2 - 0.1 + y * 0.05) * w
            const py = y * (h + 80) - 40
            ctx.moveTo(x, py)
            ctx.lineTo(x - len * 0.2, py + len)
          }
          ctx.strokeStyle = `hsla(${hue + 6} 90% ${70 + layer * 6}% / ${(0.14 + layer * 0.1) * rainA})`
          ctx.lineWidth = 0.8 + layer * 0.5
          ctx.stroke()
        }
      }

      // flowing water lines
      const lines = 34
      const waveA = 0.35 + mix * 0.65
      const base = h * 0.62
      const gap = h * 0.016
      for (let i = 0; i < lines; i++) {
        const k = i / (lines - 1)
        const y0 = base + i * gap - lines * gap * 0.35
        ctx.beginPath()
        for (let x = -10; x <= w + 20; x += 18) {
          const fx = x / w
          const env = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, fx * 1.05)))
          const y =
            y0 +
            Math.sin(fx * 5.2 + t * 0.00042 + i * 0.32) * (10 + k * 14) * env +
            Math.sin(fx * 11.3 - t * 0.0006 + i * 0.17) * (4 + k * 5) * env
          if (x === -10) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `hsla(${hue + k * 24} 88% ${58 + k * 16}% / ${(0.045 + k * 0.17) * waveA})`
        ctx.lineWidth = 1 + k * 0.9
        ctx.stroke()
      }
    }

    const loop = (t) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    resize()
    window.addEventListener('resize', resize)
    if (!reduced) raf = requestAnimationFrame(loop)
    else {
      const redraw = () => draw(0)
      window.addEventListener('stage-redraw', redraw)
      return () => {
        window.removeEventListener('resize', resize)
        window.removeEventListener('stage-redraw', redraw)
      }
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="stage-vignette" />
      <div className="stage-ghost" style={{ opacity: wide ? 0 : 1, transition: 'opacity 0.6s' }}>
        <div className="display" key={sectionTitle} ref={ghostRef}>
          {sectionTitle}
        </div>
      </div>
      {!presenter && active > 0 && (
        <div className="stage-tag kicker" style={{ opacity: 0.55 }}>
          <span className="dot" style={{ width: 5, height: 5 }} /> Stage · map placeholder
        </div>
      )}
    </div>
  )
}
