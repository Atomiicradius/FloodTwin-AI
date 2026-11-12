// Shared, non-React state read by the stage every frame (no re-renders). App writes it, the scene reads it.
export const stageState = {
  net: null,
  active: 0, // 0 = hero, 1..7 = chapters
  selSeg: null,
  simStage: 0,
  baseVol: null, // baseline node flood volumes (m3)
  cfVol: null, // counterfactual node flood volumes (m3), follows the sliders
  freqBase: null, // ensemble: share of scenarios flooding each node, baseline
  freqCf: null, // ensemble, with the intervention
  version: 0,
}

// scroll bus, written by ScrollTrigger (chapter anchors are document offsets of each chapter's top)
export const camBus = { scrollY: 0, anchors: [0], vh: 1080 }

// rain / ripple intensity by chapter: strong in hero + step 1, calm later
export const RAIN_BY_STEP = [1.0, 0.8, 0.3, 0.22, 0.18, 0.15, 0.15, 0.12]

export const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const isLite = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
