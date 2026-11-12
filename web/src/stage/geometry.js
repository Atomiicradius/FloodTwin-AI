// Maps the synthetic local grid (0..1000 x 0..700, 1 unit = 2 m) into scene space and builds shared geometry.
import * as THREE from 'three'
import { elevation } from '../data/terrain.js'

import { SC, Y_SCALE, Y0 } from './constants.js'

export { SC, Y_SCALE, Y0 }
export { COLORS, STATUS_HEX, floodRadius } from './constants.js'
export const TERRAIN_W = 10.8
export const TERRAIN_D = 7.8

export const wx = (x) => (x - 500) * SC
export const wz = (y) => (y - 350) * SC
export const wy = (x, y) => (elevation(x, y) - Y0) * Y_SCALE
export const worldOf = (x, y, lift = 0) => new THREE.Vector3(wx(x), wy(x, y) + lift, wz(y))

export function buildTerrainGeometry() {
  const g = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_D, 216, 156)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / SC + 500
    const y = pos.getZ(i) / SC + 350
    pos.setY(i, wy(x, y))
  }
  g.computeVertexNormals()
  return g
}

// a curve following the ground between the two nodes of a segment
export function segmentCurve(net, seg, lift = 0.05) {
  const a = net.nodes[seg.from]
  const b = net.nodes[seg.to]
  const pts = []
  const n = 18
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push(worldOf(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, lift))
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal')
}

export const nodeWorld = (net, i, lift = 0.05) => worldOf(net.nodes[i].x, net.nodes[i].y, lift)
