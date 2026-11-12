// Scroll-scrubbed camera path. ScrollTrigger publishes the scroll position; the rig maps it onto a path of
// eased poses (one per chapter, held while you read, moving between chapters) and damps toward it.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ScrollTrigger, stageBus } from '../motion/index.js'
import { worldOf } from './geometry.js'
import { chapterT } from './path.js'
import { camBus, prefersReduced, stageState } from './state.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))
// poses are [position, target]; index = chapter (0 hero, 1..7)
const gauge = worldOf(560, 205, 0)
const j06 = worldOf(430, 420, 0)
const FIXED = [
  { p: [6.4, 14.6, 12.4], t: [0.1, -0.3, 0.4] }, // 0 hero: wide aerial
  { p: [gauge.x + 2.6, 4.3, gauge.z + 4.5], t: [gauge.x - 0.2, 0.2, gauge.z + 0.3] }, // 1 descend toward the gauge
  null, // 2 top-down tilt following the selected segment (dynamic)
  { p: [j06.x - 3.6, 2.1, j06.z + 4.0], t: [j06.x, 0.2, j06.z - 0.05] }, // 3 low angle over J06
  { p: [j06.x - 3.3, 2.4, j06.z + 4.4], t: [j06.x + 0.1, 0.18, j06.z - 0.05] }, // 4 same view, a touch wider
  { p: [0.4, 6.4, 7.2], t: [0.0, 0.0, 0.7] }, // 5 pull back: disputed segments
  { p: [0.0, 10.6, 5.2], t: [0.0, 0.0, 0.2] }, // 6 high overview
  { p: [0.0, 13.0, 3.4], t: [0.0, 1.1, 0.1] }, // 7 pull up
]

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t
  const t3 = t2 * t
  for (let i = 0; i < 3; i++) {
    out[i] =
      0.5 *
      (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
  }
}

export default function CameraRig({ net }) {
  const { camera, size } = useThree()
  const reduced = useMemo(prefersReduced, [])
  const st = useRef({ t: 0, follow: new THREE.Vector3(), seeded: false, cx: 0.75 })
  const out = useMemo(() => ({ p: [0, 0, 0], g: [0, 0, 0] }), [])
  const look = useMemo(() => new THREE.Vector3(), [])

  // chapter anchors (document offsets) + scroll position, kept fresh by ScrollTrigger
  useEffect(() => {
    const measure = () => {
      const tops = [...document.querySelectorAll('[data-chapter]')].map((el) => el.getBoundingClientRect().top + window.scrollY)
      camBus.anchors = [0, ...tops]
      camBus.vh = window.innerHeight
    }
    measure()
    const trig = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => (camBus.scrollY = self.scroll()) })
    camBus.scrollY = window.scrollY
    ScrollTrigger.addEventListener('refresh', measure)
    window.addEventListener('resize', measure)
    const late = setTimeout(measure, 800) // after fonts/layout settle
    return () => {
      trig.kill()
      ScrollTrigger.removeEventListener('refresh', measure)
      window.removeEventListener('resize', measure)
      clearTimeout(late)
    }
  }, [])

  useFrame((state, dt) => {
    const s = st.current
    const { anchors, vh, scrollY } = camBus
    const time = reduced ? 0 : state.clock.elapsedTime

    // scroll -> continuous chapter coordinate t in [0, 7]
    let target = chapterT(scrollY, anchors, vh)
    if (reduced) target = 6
    s.t = s.seeded && !reduced ? s.t + (target - s.t) * (1 - Math.exp(-dt * 5.5)) : target
    s.seeded = true
    const t = s.t

    // dynamic pose 2 follows the selected segment
    const segIdx = stageState.selSeg ?? net.hotSeg
    const seg = net.segs[segIdx]
    const a = net.nodes[seg.from]
    const b = net.nodes[seg.to]
    const mid = worldOf((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
    s.follow.lerp(mid, reduced ? 1 : 1 - Math.exp(-dt * 3.2))
    const poses = FIXED.map((p, i) =>
      p ?? { p: [s.follow.x + 1.1, 6.0, s.follow.z + 2.4], t: [s.follow.x, 0.1, s.follow.z] },
    )

    const i = Math.min(poses.length - 2, Math.max(0, Math.floor(t)))
    const f = t - i
    const at = (k) => poses[Math.min(poses.length - 1, Math.max(0, k))]
    catmull(at(i - 1).p, at(i).p, at(i + 1).p, at(i + 2).p, f, out.p)
    catmull(at(i - 1).t, at(i).t, at(i + 1).t, at(i + 2).t, f, out.g)

    // gentle aerial drift in the hero that dies out as you scroll
    const drift = 1 - clamp01(t)
    camera.position.set(
      out.p[0] + Math.sin(time * 0.17) * 0.55 * drift,
      out.p[1] + Math.sin(time * 0.11) * 0.18 * drift,
      out.p[2] + Math.cos(time * 0.14) * 0.45 * drift,
    )
    look.set(out.g[0], out.g[1], out.g[2])
    camera.lookAt(look)

    // stage placement: right half on the hero, left ~60% on chapters, centred-right on the wide last chapter
    const mix = reduced ? (stageState.active === 0 ? 0 : 1) : stageBus.mix
    const wide = clamp01(t - 6)
    const cxT = 0.795 + (0.3 - 0.795) * mix + (0.62 - 0.3) * wide * mix
    const cyT = 0.5 - 0.06 * wide
    s.cx = reduced ? cxT : s.cx + (cxT - s.cx) * (1 - Math.exp(-dt * 6))
    camera.setViewOffset(size.width, size.height, -(s.cx * size.width - size.width / 2), -((cyT - 0.5) * size.height), size.width, size.height)
    camera.updateProjectionMatrix()
  })
  return null
}
