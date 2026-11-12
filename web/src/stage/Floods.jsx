// Flood water at flooded nodes, ensemble ghost blooms (step 6) and the abstract graph (step 7).
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COLORS, SC, Y_SCALE, Y0, floodRadius, nodeWorld, worldOf } from './geometry.js'
import { elevation } from '../data/terrain.js'
import { prefersReduced, stageState } from './state.js'

const damp = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, dt * rate)
const clamp01 = (v) => Math.min(1, Math.max(0, v))

// mean terrain height on a ring of radius r (scene units) around a node: the water level that makes the shoreline land near r
function ringLevel(node, r) {
  let sum = 0
  const n = 10
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const x = node.x + Math.cos(a) * (r / SC)
    const y = node.y + Math.sin(a) * (r / SC)
    sum += (elevation(x, y) - Y0) * Y_SCALE
  }
  return sum / n
}

const waterVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const waterFrag = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uAlpha;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float edge = smoothstep(1.0, 0.72, d);
    float ripple = 0.5 + 0.5 * sin(d * 20.0 - uTime * 1.7);
    vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 0.95, d));
    col += uShallow * ripple * 0.12 * (1.0 - d);
    float a = (0.34 + 0.34 * (1.0 - d) + 0.05 * ripple) * edge;
    gl_FragColor = vec4(col, a * uAlpha);
  }
`

const ringFrag = /* glsl */ `
  uniform vec3 uCol;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float line = smoothstep(0.93, 0.965, d) * (1.0 - smoothstep(0.985, 1.0, d));
    vec2 q = (vUv - 0.5) * 2.0;
    float dash = step(0.5, fract(atan(q.y, q.x) * 3.8197));
    gl_FragColor = vec4(uCol * 1.2, line * dash * uAlpha);
  }
`

export function Floods({ net }) {
  const reduced = useMemo(prefersReduced, [])
  const discGeo = useMemo(() => new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), [])
  const items = useMemo(
    () =>
      net.nodes.map((node, i) => ({
        node,
        i,
        base: nodeWorld(net, i, 0),
        h0: (elevation(node.x, node.y) - Y0) * Y_SCALE,
        r: 0, // current radius (scene units)
        rb: 0, // baseline radius, for the coral reference ring
        alpha: 0,
        ringA: 0,
        water: new THREE.ShaderMaterial({
          vertexShader: waterVert,
          fragmentShader: waterFrag,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uShallow: { value: new THREE.Color(COLORS.floodShallow) },
            uDeep: { value: new THREE.Color(COLORS.floodDeep) },
            uAlpha: { value: 0 },
            uTime: { value: 0 },
          },
        }),
        ringMat: new THREE.ShaderMaterial({
          vertexShader: waterVert,
          fragmentShader: ringFrag,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          uniforms: { uCol: { value: new THREE.Color(COLORS.coral) }, uAlpha: { value: 0 } },
        }),
      })),
    [net],
  )
  const meshes = useRef([])
  const rings = useRef([])

  useFrame((state, dt) => {
    const t = reduced ? 0 : state.clock.elapsedTime
    const { active, simStage, baseVol, cfVol } = stageState
    if (!baseVol) return
    const gate = active === 3 ? (simStage >= 4 ? 1 : simStage >= 3 ? 0.4 : 0) : active >= 4 && active <= 6 ? 1 : 0
    const alphaT = active === 7 ? 0 : active === 6 ? 0.4 : 1
    const vols = active === 4 ? cfVol : baseVol
    items.forEach((it) => {
      if (it.node.kind === 'outfall') return
      const rt = floodRadius(vols[it.i]) * gate
      const rbt = floodRadius(baseVol[it.i]) * gate
      it.r = damp(it.r, rt, reduced ? 100 : 2.6, dt)
      it.rb = damp(it.rb, rbt, reduced ? 100 : 2.6, dt)
      it.alpha = damp(it.alpha, alphaT, 3, dt)
      const showRef = active === 4 && it.rb > 0.05 ? clamp01((1 - it.r / Math.max(it.rb, 0.01)) * 3) : 0
      it.ringA = damp(it.ringA, showRef, 4, dt)
      const mesh = meshes.current[it.i]
      const ring = rings.current[it.i]
      if (mesh) {
        const R = it.r * 1.22
        mesh.visible = R > 0.04 && it.alpha > 0.01
        if (mesh.visible) {
          const level = Math.max(0.035, ringLevel(it.node, it.r) - it.h0 + 0.02)
          mesh.position.set(it.base.x, it.h0 + level + (1 - clamp01(it.r / 0.4)) * -0.04, it.base.z)
          mesh.scale.set(R, 1, R)
          const m = it.water
          m.uniforms.uAlpha.value = it.alpha * clamp01(it.r / 0.25)
          m.uniforms.uTime.value = t
        }
      }
      if (ring) {
        const R = it.rb * 1.22
        ring.visible = R > 0.04 && it.ringA > 0.01
        if (ring.visible) {
          const level = Math.max(0.035, ringLevel(it.node, it.rb) - it.h0 + 0.02)
          ring.position.set(it.base.x, it.h0 + level + 0.012, it.base.z)
          ring.scale.set(R, 1, R)
          it.ringMat.uniforms.uAlpha.value = it.ringA * 0.9
        }
      }
    })
  })

  return (
    <group>
      {items.map((it) =>
        it.node.kind === 'outfall' ? null : (
          <group key={it.node.id}>
            <mesh ref={(m) => (meshes.current[it.i] = m)} geometry={discGeo} material={it.water} renderOrder={5} visible={false} />
            <mesh ref={(m) => (rings.current[it.i] = m)} geometry={discGeo} material={it.ringMat} renderOrder={6} visible={false} />
          </group>
        ),
      )}
    </group>
  )
}

const ghostVert = /* glsl */ `
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vA;
  varying vec3 vC;
  void main() {
    vUv = uv;
    vA = aAlpha;
    vC = instanceColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`
const ghostFrag = /* glsl */ `
  varying vec2 vUv;
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float body = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(vC, body * body * vA);
  }
`

const GHOST_MULT = [0.55, 0.78, 1.0, 1.22, 1.5]
const MINT_MULT = [0.6, 0.9, 1.2]

// faint blooms around every node: coral = baseline ensemble, green = with the intervention
export function Ghosts({ net }) {
  const reduced = useMemo(prefersReduced, [])
  const count = net.nodes.length * (GHOST_MULT.length + MINT_MULT.length)
  const { mesh, alphaAttr } = useMemo(() => {
    const geo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)
    const a = new Float32Array(count)
    const attr = new THREE.InstancedBufferAttribute(a, 1)
    geo.setAttribute('aAlpha', attr)
    const mat = new THREE.ShaderMaterial({ vertexShader: ghostVert, fragmentShader: ghostFrag, transparent: true, depthWrite: false })
    const m = new THREE.InstancedMesh(geo, mat, count)
    m.frustumCulled = false
    m.renderOrder = 4
    const coral = new THREE.Color(COLORS.coral)
    const mint = new THREE.Color(COLORS.mint)
    let k = 0
    net.nodes.forEach(() => {
      GHOST_MULT.forEach(() => m.setColorAt(k++, coral))
      MINT_MULT.forEach(() => m.setColorAt(k++, mint))
    })
    m.instanceColor.needsUpdate = true
    return { mesh: m, alphaAttr: attr }
  }, [net, count])
  const vis = useRef(0)
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])
  const phase = useMemo(() => net.nodes.map((_, i) => i * 1.7), [net])

  useFrame((state, dt) => {
    const t = reduced ? 0 : state.clock.elapsedTime
    const { active, freqBase, freqCf, baseVol, cfVol } = stageState
    vis.current = damp(vis.current, active === 6 && freqBase ? 1 : 0, 2.5, dt)
    mesh.visible = vis.current > 0.01
    if (!mesh.visible) return
    let k = 0
    net.nodes.forEach((node, i) => {
      const p = worldOf(node.x, node.y, 0.075)
      const fb = freqBase[i]
      const fc = freqCf[i]
      const rBase = Math.max(floodRadius(baseVol[i]), 0.1 + 0.85 * fb)
      const rCf = Math.max(floodRadius(cfVol[i]), 0.08 + 0.7 * fc)
      GHOST_MULT.forEach((m, j) => {
        const breathe = 1 + 0.05 * Math.sin(t * 0.8 + phase[i] + j)
        const r = rBase * m * breathe * (node.kind === 'outfall' ? 0.4 : 1)
        pos.set(p.x, p.y + j * 0.002, p.z)
        scl.set(r, 1, r)
        mtx.compose(pos, quat, scl)
        mesh.setMatrixAt(k, mtx)
        alphaAttr.array[k] = fb > 0.03 ? vis.current * (0.035 + 0.09 * fb) : 0
        k++
      })
      MINT_MULT.forEach((m, j) => {
        const breathe = 1 + 0.05 * Math.sin(t * 0.9 + phase[i] + j * 1.3)
        const r = rCf * m * breathe
        pos.set(p.x, p.y + 0.012 + j * 0.002, p.z)
        scl.set(r, 1, r)
        mtx.compose(pos, quat, scl)
        mesh.setMatrixAt(k, mtx)
        alphaAttr.array[k] = fc > 0.03 ? vis.current * (0.05 + 0.11 * fc) : 0
        k++
      })
    })
    mesh.instanceMatrix.needsUpdate = true
    alphaAttr.needsUpdate = true
  })
  return <primitive object={mesh} />
}

// step 7: the network dissolves into an abstract graph (nodes and edges only)
export function Graph({ net }) {
  const reduced = useMemo(prefersReduced, [])
  const group = useRef()
  const vis = useRef(0)
  const data = useMemo(() => {
    const n = net.nodes.length
    const rank = new Array(n).fill(0)
    net.order.forEach((id, r) => (rank[id] = r))
    const pts = net.nodes.map((node, i) => new THREE.Vector3(((node.x - 500) * SC) * 1.05, 0.55 + (1 - rank[i] / n) * 1.5, ((node.y - 350) * SC) * 1.05))
    const verts = []
    net.segs.forEach((s) => verts.push(pts[s.from].x, pts[s.from].y, pts[s.from].z, pts[s.to].x, pts[s.to].y, pts[s.to].z))
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#7dd3fc').multiplyScalar(1.5), transparent: true, opacity: 0, toneMapped: false })
    const lines = new THREE.LineSegments(lineGeo, lineMat)
    lines.renderOrder = 7
    const nodeGeo = new THREE.SphereGeometry(1, 14, 10)
    const nodeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe9ff').multiplyScalar(1.7), transparent: true, opacity: 0, toneMapped: false })
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, n)
    const m = new THREE.Matrix4()
    pts.forEach((p, i) => {
      const r = net.nodes[i].kind === 'outfall' ? 0.11 : 0.062
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r))
      nodes.setMatrixAt(i, m)
    })
    nodes.renderOrder = 8
    return { lines, nodes, lineMat, nodeMat }
  }, [net])

  useFrame((state, dt) => {
    vis.current = damp(vis.current, stageState.active === 7 ? 1 : 0, 1.8, dt)
    data.lineMat.opacity = vis.current * 0.85
    data.nodeMat.opacity = vis.current
    if (group.current) {
      group.current.visible = vis.current > 0.01
      if (!reduced) group.current.rotation.y = state.clock.elapsedTime * 0.04
    }
  })
  return (
    <group ref={group} visible={false}>
      <primitive object={data.lines} />
      <primitive object={data.nodes} />
    </group>
  )
}
