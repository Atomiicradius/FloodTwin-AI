import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { KernelSize } from 'postprocessing'
import { RAIN_BY_STEP, prefersReduced, stageState } from './state.js'
import { ambientFrag, ambientVert } from './shaders.js'
import { buildNetwork } from '../data/network.js'
import CameraRig from './CameraRig.jsx'
import Rain from './Rain.jsx'
import Terrain, { Perimeter } from './Terrain.jsx'
import Network from './Network.jsx'
import { Floods, Ghosts, Graph } from './Floods.jsx'

const NAVY = '#04070d'

function Ambient({ reduced }) {
  const ripples = useMemo(() => Array.from({ length: 22 }, () => new THREE.Vector4(0, 0, -99, 0)), [])
  const sim = useRef({ next: 0, slot: 0, rain: 1 })
  const { size } = useThree()

  useEffect(() => {
    if (!reduced) return
    // static frame: a few frozen rings
    ripples.forEach((r, i) => r.set(Math.sin(i * 12.9) * 0.85, Math.cos(i * 7.3) * 0.42, -0.25 - (i % 6) * 0.3, 0.9))
  }, [reduced, ripples])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ambientVert,
        fragmentShader: ambientFrag,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAspect: { value: 1.78 },
          uRain: { value: 1 },
          uBase: { value: new THREE.Color(NAVY) },
          uRip: { value: ripples },
        },
      }),
    [ripples],
  )

  useFrame((state, dt) => {
    const m = material
    const t = reduced ? 0 : state.clock.elapsedTime
    const target = RAIN_BY_STEP[stageState.active] ?? 0.15
    const s = sim.current
    s.rain += (target - s.rain) * Math.min(1, dt * 1.6)
    if (!reduced && t > s.next) {
      const r = ripples[s.slot++ % ripples.length]
      const a = size.width / size.height
      r.set((Math.random() - 0.5) * a, Math.random() - 0.5, t, 0.55 + Math.random() * 0.6)
      s.next = t + (0.045 + (1 - s.rain) * 0.55) * (0.6 + Math.random() * 0.9)
    }
    m.uniforms.uTime.value = t
    m.uniforms.uRain.value = s.rain
    m.uniforms.uAspect.value = size.width / size.height
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function World({ reduced }) {
  const net = useMemo(buildNetwork, [])
  return (
    <>
      <Ambient reduced={reduced} />
      <Terrain />
      <Perimeter net={net} />
      <Network net={net} />
      <Floods net={net} />
      <Ghosts net={net} />
      <Graph net={net} />
      <Rain />
      <CameraRig net={net} />
    </>
  )
}

function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const f = () => invalidate()
    window.addEventListener('stage-update', f)
    window.addEventListener('resize', f)
    return () => {
      window.removeEventListener('stage-update', f)
      window.removeEventListener('resize', f)
    }
  }, [invalidate])
  return null
}

export default function Scene3D() {
  const reduced = useMemo(prefersReduced, [])
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const f = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 90, position: [6, 8, 12.5] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[NAVY]} />
      <World reduced={reduced} />
      <Invalidator />
      <EffectComposer multisampling={0}>
          <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.2} kernelSize={KernelSize.SMALL} resolutionScale={0.4} />
        </EffectComposer>
    </Canvas>
  )
}
