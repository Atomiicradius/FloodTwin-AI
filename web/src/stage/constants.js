// Scene constants shared by the 3D and lite stages (no three.js import here).
export const SC = 0.01 // grid unit -> scene unit
export const Y_SCALE = 0.2 // vertical exaggeration per metre
export const Y0 = 899

// flood disc radius (scene units) from a node flood volume (m3)
// guarded: a NaN/Infinity here would poison the GPU frame (bloom spreads it to every pixel -> black screen)
export const floodRadius = (vol) => (Number.isFinite(vol) && vol > 40 ? Math.min(0.1 + Math.sqrt(vol) * 0.0095, 3) : 0)

export const STATUS_HEX = {
  observed: '#a78bfa',
  supported: '#34d399',
  disputed: '#fbbf24',
  unverified: '#94a3b8',
}
export const COLORS = {
  pipe: '#41b6f2',
  coral: '#fb7185',
  mint: '#34d399',
  floodShallow: '#7dd3fc',
  floodDeep: '#2563eb',
}
