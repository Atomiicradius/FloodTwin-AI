// Hero rain: short falling streaks over the terrain, fading out as you scroll away from the hero.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { stageBus } from '../motion/index.js'
import { prefersReduced } from './state.js'

const N = 520

const vert = /* glsl */ `
  uniform float uTime;
  attribute vec4 aDrop; // x, z, phase, speed
  attribute float aEnd;
  varying float vA;
  void main() {
    float fall = mod(uTime * aDrop.w + aDrop.z * 9.0, 9.0);
    float y = 8.4 - fall;
    vec3 p = vec3(aDrop.x + aEnd * 0.05, y + aEnd * 0.42, aDrop.y);
    vA = (1.0 - aEnd * 0.75) * smoothstep(-0.2, 0.7, y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`
const frag = /* glsl */ `
  uniform float uAlpha;
  varying float vA;
  void main() {
    gl_FragColor = vec4(vec3(0.6, 0.85, 1.0) * 1.1, vA * uAlpha * 0.5);
  }
`

export default function Rain() {
  const reduced = useMemo(prefersReduced, [])
  const { object, material } = useMemo(() => {
    const drops = new Float32Array(N * 2 * 4)
    const ends = new Float32Array(N * 2)
    const pos = new Float32Array(N * 2 * 3)
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 13
      const z = (Math.random() - 0.5) * 9.4
      const phase = Math.random()
      const speed = 5.5 + Math.random() * 3.5
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 4
        drops[o] = x
        drops[o + 1] = z
        drops[o + 2] = phase
        drops[o + 3] = speed
        ends[i * 2 + k] = k
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aDrop', new THREE.BufferAttribute(drops, 4))
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    })
    const lines = new THREE.LineSegments(g, m)
    lines.frustumCulled = false
    lines.renderOrder = 9
    return { object: lines, material: m }
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = reduced ? 0 : state.clock.elapsedTime
    material.uniforms.uAlpha.value = reduced ? 0 : Math.max(0, 1 - stageBus.mix * 1.25)
    object.visible = material.uniforms.uAlpha.value > 0.01
  })
  return <primitive object={object} />
}
