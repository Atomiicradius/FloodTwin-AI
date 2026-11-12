// Reusable motion primitives: Reveal (stagger on scroll), CountUp, and draw-in for SVG charts.
import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger, prefersReducedMotion } from './index.js'

const EASE = 'power3.out'

export function Reveal({ as: Tag = 'div', selector, stagger = 0.09, y = 30, delay = 0, start = 'top 90%', className, children, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      const targets = selector ? el.querySelectorAll(selector) : [el]
      if (!targets.length) return
      gsap.set(targets, { autoAlpha: 0, y })
      ScrollTrigger.create({
        trigger: el,
        start,
        once: true,
        onEnter: () =>
          gsap.to(targets, {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: EASE,
            stagger,
            delay,
            clearProps: 'transform,opacity,visibility',
          }),
      })
    }, el)
    return () => ctx.revert()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  )
}

const plain = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export function CountUp({ value, decimals = 0, format, duration = 1.6, className }) {
  const ref = useRef(null)
  const cur = useRef({ v: 0 })
  const seen = useRef(false)
  const fmtRef = useRef(null)
  fmtRef.current = format || ((v) => plain(v, decimals))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const write = () => (el.textContent = fmtRef.current(cur.current.v))
    if (prefersReducedMotion()) {
      cur.current.v = value
      write()
      return
    }
    const run = (from) => {
      cur.current.v = from
      gsap.to(cur.current, {
        v: value,
        duration: seen.current ? 0.7 : duration,
        ease: 'power2.out',
        onUpdate: write,
        overwrite: true,
      })
    }
    if (seen.current) {
      run(cur.current.v)
      return
    }
    write()
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => {
        seen.current = true
        run(0)
      },
    })
    return () => st.kill()
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className={className}>
      {plain(prefersReducedMotion() ? value : 0, decimals)}
    </span>
  )
}

// Draws `.draw` paths, grows `.grow` bars and fades `.fade` areas when the chart scrolls into view.
export function ChartReveal({ className, children, delay = 0.1 }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      const paths = el.querySelectorAll('.draw')
      const bars = el.querySelectorAll('.grow')
      const fades = el.querySelectorAll('.fade')
      paths.forEach((p) => {
        const len = p.getTotalLength?.() || 600
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len })
      })
      if (bars.length) gsap.set(bars, { scaleY: 0, transformOrigin: '50% 100%', transformBox: 'fill-box' })
      if (fades.length) gsap.set(fades, { opacity: 0 })
      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          if (paths.length) gsap.to(paths, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay, stagger: 0.12, clearProps: 'strokeDasharray,strokeDashoffset' })
          if (bars.length) gsap.to(bars, { scaleY: 1, duration: 0.9, ease: 'power3.out', delay, stagger: { each: 0.012, from: 'start' }, clearProps: 'transform' })
          if (fades.length) gsap.to(fades, { opacity: 1, duration: 1.2, delay: delay + 0.4, clearProps: 'opacity' })
        },
      })
    }, el)
    return () => ctx.revert()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
