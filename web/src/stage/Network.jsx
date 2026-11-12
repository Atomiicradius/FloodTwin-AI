// Drain network as emissive tubes, flow particles, nodes and the rain gauge marker.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COLORS, STATUS_HEX, nodeWorld, segmentCurve, worldOf } from './geometry.js'
import { prefersReduced, stageState } from './state.js'

const tubeVert = /* glsl */ `
  uniform float uSel;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vU = uv.x;
    vec3 p = position + normal * uSel * 0.012;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const tubeFrag = /* glsl */ `
  uniform vec3 uCol;
  uniform vec3 uBaseCol;
  uniform float uMix;
  uniform float uDraw;
  uniform float uDash;
  uniform float uPulse;
  uniform float uSel;
  uniform float uTime;
  uniform float uFade;
  uniform float uLen;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vU > uDraw) discard;
    float drawing = (1.0 - step(0.999, uDraw)) * smoothstep(uDraw - 0.06, uDraw, vU);
    float dashPat = step(0.5, fract(vU * uLen * 2.2 - uTime * 0.45));
    float on = mix(1.0, dashPat, uDash);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float pulse = 1.0 + uPulse * 0.5 * sin(uTime * 3.2);
    vec3 c = mix(uBaseCol, uCol, uMix) * (0.75 + 0.6 * fres) * pulse;
    c = mix(c, vec3(1.0), uSel * 0.4 + drawing * 0.45);
    float a = (on * 0.97 + (1.0 - on) * 0.12) * uFade;
    gl_FragColor = vec4(c * 1.3, a);
  }
`

const dotVert = /* glsl */ `
  uniform float uSize;
  uniform float uPR;
  attribute float aOn;
  varying float vOn;
  void main() {
    vOn = aOn;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPR * (18.0 / -mv.z) * aOn;
    gl_Position = projectionMatrix * mv;
  }
`
const dotFrag = /* glsl */ `
  uniform float uAlpha;
  varying float vOn;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * 1.9, a * uAlpha * vOn);
  }
`

const RADIUS = { primary: 0.034, secondary: 0.024, tertiary: 0.017 }
const SPEED = { primary: 0.62, secondary: 0.5, tertiary: 0.4 }
const PER = { primary: 7, secondary: 5, tertiary: 3 }
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const damp = (cur, target, rate, dt) => {
  const v = cur + (target - cur) * Math.min(1, Math.min(dt, 0.1) * rate)
  return Number.isFinite(v) ? v : Number.isFinite(target) ? target : 0
}

export default function Network({ net }) {
  const reduced = useMemo(prefersReduced, [])
  const statusColor = useMemo(() => Object.fromEntries(Object.entries(STATUS_HEX).map(([k, v]) => [k, new THREE.Color(v)])), [])
  const pipes = useMemo(
    () =>
      net.segs.map((seg, i) => {
        const curve = segmentCurve(net, seg)
        const length = curve.getLength()
        const geometry = new THREE.TubeGeometry(curve, 40, RADIUS[seg.cls], 8, false)
        const samples = curve.getPoints(32)
        const xm = (net.nodes[seg.from].x + net.nodes[seg.to].x) / 2
        const material = new THREE.ShaderMaterial({
          vertexShader: tubeVert,
          fragmentShader: tubeFrag,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uCol: { value: statusColor[seg.status].clone() },
            uBaseCol: { value: new THREE.Color(COLORS.pipe) },
            uMix: { value: 0 },
            uDraw: { value: 0 },
            uDash: { value: 0 },
            uPulse: { value: 0 },
            uSel: { value: 0 },
            uTime: { value: 0 },
            uFade: { value: 1 },
            uLen: { value: length },
          },
        })
        return {
          seg,
          i,
          geometry,
          material,
          length,
          samples,
          delay: (1 - xm / 1000) * 0.6,
          color: new THREE.Color(COLORS.pipe),
          cur: { mix: 0, dash: 0, pulse: 0, sel: 0, fade: 1 },
        }
      }),
    [net, statusColor],
  )

  // flow particles
  const flow = useMemo(() => {
    const list = []
    pipes.forEach((p) => {
      const n = PER[p.seg.cls]
      for (let k = 0; k < n; k++) list.push({ p, u: (k + Math.random() * 0.6) / n, v: SPEED[p.seg.cls] * (0.85 + Math.random() * 0.3) })
    })
    const pos = new Float32Array(list.length * 3)
    const on = new Float32Array(list.length)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aOn', new THREE.BufferAttribute(on, 1))
    return { list, g, pos, on }
  }, [pipes])
  const dotMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dotVert,
        fragmentShader: dotFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSize: { value: 5.5 }, uPR: { value: 1 }, uAlpha: { value: 0 } },
      }),
    [],
  )
  const draw = useRef(0)
  const flowAlpha = useRef(0)
  const nodesRef = useRef()

  const nodeMesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 14, 10)
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe9ff').multiplyScalar(1.6), toneMapped: false, transparent: true })
    const mesh = new THREE.InstancedMesh(geo, mat, net.nodes.length)
    const m = new THREE.Matrix4()
    net.nodes.forEach((n, i) => {
      const r = n.kind === 'outfall' ? 0.085 : 0.045
      const p = nodeWorld(net, i, 0.06)
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r))
      mesh.setMatrixAt(i, m)
    })
    mesh.renderOrder = 3
    return mesh
  }, [net])

  const gauge = useMemo(() => {
    const p = worldOf(net.gauge.x, net.gauge.y, 0)
    return p
  }, [net])
  const gaugeRing = useRef()

  useFrame((state, dt) => {
    const t = reduced ? 0 : state.clock.elapsedTime
    const active = stageState.active
    const statusMode = active === 2 || active === 5
    const g = reduced ? 1 : clamp01((t - 0.9) / 4.4)
    draw.current = g
    const dissolve = active === 7 ? 0 : 1

    pipes.forEach((p, i) => {
      const u = p.material.uniforms
      const c = p.cur
      const disputed = p.seg.status === 'disputed'
      const hero = active === 0
      c.mix = damp(c.mix, statusMode ? 1 : 0, 3, dt)
      c.dash = damp(c.dash, hero ? (p.seg.id === 'S06' ? 1 : 0) : statusMode && disputed ? 1 : 0, 4, dt)
      c.pulse = damp(c.pulse, (statusMode && disputed) || (hero && p.seg.id === 'S06') ? 1 : 0, 4, dt)
      c.sel = damp(c.sel, active === 2 && stageState.selSeg === i ? 1 : 0, 6, dt)
      c.fade = damp(c.fade, dissolve, 2.4, dt)
      u.uMix.value = c.mix
      u.uDash.value = c.dash
      u.uPulse.value = c.pulse
      u.uSel.value = c.sel
      u.uFade.value = c.fade
      u.uTime.value = t
      u.uDraw.value = clamp01(g * 1.7 - p.delay)
    })

    // flow particles: ride the pipes, only where the pipe is drawn, fade out at step 7
    flowAlpha.current = damp(flowAlpha.current, g > 0.85 && dissolve ? 1 : 0, 2.5, dt)
    const { list, pos, on } = flow
    for (let k = 0; k < list.length; k++) {
      const f = list[k]
      f.u = (f.u + (reduced ? 0 : (f.v * dt) / f.p.length)) % 1
      const drawn = f.u < clamp01(g * 1.7 - f.p.delay)
      const idx = f.u * 32
      const i0 = Math.min(31, Math.floor(idx))
      const a = f.p.samples[i0]
      const b = f.p.samples[i0 + 1]
      const w = idx - i0
      pos[k * 3] = a.x + (b.x - a.x) * w
      pos[k * 3 + 1] = a.y + (b.y - a.y) * w + 0.012
      pos[k * 3 + 2] = a.z + (b.z - a.z) * w
      on[k] = drawn ? 1 : 0
    }
    flow.g.attributes.position.needsUpdate = true
    flow.g.attributes.aOn.needsUpdate = true
    dotMat.uniforms.uAlpha.value = flowAlpha.current
    dotMat.uniforms.uPR.value = state.gl.getPixelRatio()
    nodeMesh.material.opacity = damp(nodeMesh.material.opacity, dissolve * clamp01(g * 2 - 0.2), 3, dt)
    if (gaugeRing.current) {
      const s = 1 + 0.25 * Math.sin(t * 2.4)
      gaugeRing.current.scale.setScalar(s)
    }
  })

  return (
    <group>
      {pipes.map((p) => (
        <mesh key={p.seg.id} geometry={p.geometry} material={p.material} renderOrder={2} />
      ))}
      <points geometry={flow.g} material={dotMat} renderOrder={4} frustumCulled={false} />
      <primitive object={nodeMesh} ref={nodesRef} />
      {/* rain gauge G-1 */}
      <group position={[gauge.x, gauge.y, gauge.z]}>
        <mesh position={[0, 0.3, 0]} renderOrder={3}>
          <cylinderGeometry args={[0.006, 0.006, 0.6, 6]} />
          <meshBasicMaterial color={new THREE.Color('#7dd3fc').multiplyScalar(1.5)} toneMapped={false} transparent opacity={0.8} />
        </mesh>
        <mesh ref={gaugeRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={3}>
          <ringGeometry args={[0.13, 0.15, 40]} />
          <meshBasicMaterial color={new THREE.Color('#7dd3fc').multiplyScalar(1.4)} toneMapped={false} transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.62, 0]} renderOrder={3}>
          <sphereGeometry args={[0.035, 12, 10]} />
          <meshBasicMaterial color={new THREE.Color('#bfe9ff').multiplyScalar(1.8)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
