import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TERRAIN_D, TERRAIN_W, buildTerrainGeometry, worldOf } from './geometry.js'
import { stageState } from './state.js'

const vert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  varying float vH;
  varying vec2 vP;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vH = position.y / ${(0.2).toFixed(3)};
    vP = vec2(position.x / ${(TERRAIN_W / 2).toFixed(2)}, position.z / ${(TERRAIN_D / 2).toFixed(2)});
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const frag = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLine;
  uniform vec3 uRim;
  uniform float uFade;
  varying vec3 vN;
  varying vec3 vW;
  varying float vH;
  varying vec2 vP;

  float contour(float c) {
    float aa = fwidth(c);
    float d = abs(fract(c - 0.5) - 0.5) / max(aa, 1e-4);
    return 1.0 - smoothstep(0.0, 1.3, d);
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 L = normalize(vec3(-0.35, 0.85, 0.4));
    float lam = max(dot(N, L), 0.0);
    vec3 V = normalize(cameraPosition - vW);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);

    vec3 col = uBase * (0.5 + 0.75 * lam) + uRim * rim * 0.42;
    float minor = contour(vH * 2.0);
    float major = contour(vH * 0.4);
    col += uLine * (minor * 0.26 + major * 0.5);

    float e = 1.0 - smoothstep(0.7, 1.0, length(vP));
    gl_FragColor = vec4(col, e * uFade);
  }
`

export default function Terrain() {
  const geometry = useMemo(buildTerrainGeometry, [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uBase: { value: new THREE.Color('#0b1626') },
          uLine: { value: new THREE.Color('#3aa0c8') },
          uRim: { value: new THREE.Color('#4aa8d8') },
          uFade: { value: 1 },
        },
      }),
    [],
  )
  const fade = useRef(1)
  useFrame((_, dt) => {
    const target = stageState.active === 7 ? 0.08 : 1
    fade.current += (target - fade.current) * Math.min(1, dt * 2.2)
    material.uniforms.uFade.value = fade.current
  })
  return <mesh geometry={geometry} material={material} renderOrder={1} />
}

// dashed outline of the catchment, lying on the terrain
export function Perimeter({ net }) {
  const line = useMemo(() => {
    const pts = net.perimeter.map(([x, y]) => worldOf(x, y, 0.04))
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(240))
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#38bdf8', dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.34 }))
    l.computeLineDistances()
    l.renderOrder = 2
    return l
  }, [net])
  return <primitive object={line} />
}
