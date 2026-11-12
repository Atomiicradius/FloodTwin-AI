// Shared motion system: one Lenis instance driven by the GSAP ticker, ScrollTrigger glue, reduced-motion check.
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let lenis = null
let tick = null

export function initSmoothScroll() {
  if (prefersReducedMotion() || lenis) return
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  tick = (t) => lenis.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
}

export function destroySmoothScroll() {
  if (tick) gsap.ticker.remove(tick)
  lenis?.destroy()
  lenis = null
  tick = null
}

export function scrollToTarget(target, { duration = 1.5 } = {}) {
  if (lenis) lenis.scrollTo(target, { duration, easing: (t) => 1 - Math.pow(1 - t, 4) })
  else if (typeof target === 'number') window.scrollTo({ top: target })
  else target?.scrollIntoView?.()
}

// written by ScrollTrigger (no React state), read by the stage's rAF loop
export const stageBus = { mix: 0 }

export { gsap, ScrollTrigger }
