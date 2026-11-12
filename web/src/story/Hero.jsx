import { forwardRef, useLayoutEffect, useRef } from 'react'
import { gsap, prefersReducedMotion } from '@/motion/index.js'

const TITLE = 'FloodTwin'

const Hero = forwardRef(function Hero(_, outerRef) {
  const root = useRef(null)

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.from('.hero .ch', { yPercent: 110, opacity: 0, rotateX: -50, duration: 1.4, stagger: 0.045 }, 0.15)
        .from('.hero .ai', { opacity: 0, x: -20, duration: 1.2 }, 0.9)
        .from('.hero-kick', { opacity: 0, y: 14, duration: 1 }, 0.2)
        .from('.hero-sub', { opacity: 0, y: 24, duration: 1.2 }, 0.8)
        .from('.hero-sub2', { opacity: 0, y: 18, duration: 1.2 }, 1.0)
        .from('.scroll-cue', { opacity: 0, duration: 1.2 }, 1.5)
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section
      className="hero"
      id="hero"
      ref={(el) => {
        root.current = el
        if (typeof outerRef === 'function') outerRef(el)
        else if (outerRef) outerRef.current = el
      }}
    >
      <div className="hero-kick kicker">Prototype · Synthetic demo data · SDG 11</div>
      <h1 className="display" aria-label="FloodTwin-AI" style={{ marginTop: 22 }}>
        <span aria-hidden="true" style={{ perspective: 600, display: 'inline-block' }}>
          {TITLE.split('').map((c, i) => (
            <span className="ch" key={i}>
              {c}
            </span>
          ))}
          <span className="ai" style={{ color: 'var(--primary)', fontStyle: 'italic', marginLeft: '-0.1em' }}>
            -AI
          </span>
        </span>
      </h1>
      <p className="hero-sub">
        Urban flood predictions are only as reliable as the drainage maps behind them, and those maps are incomplete.
      </p>
      <p className="hero-sub2">
        A physics-based flood simulation and decision-support framework that audits the map, propagates what it does not
        know, and explains why a street floods. It is not a live digital twin.
      </p>
      <div className="scroll-cue" aria-hidden="true">
        <div className="line" />
        <span className="kicker">Scroll to begin</span>
      </div>
    </section>
  )
})

export default Hero
