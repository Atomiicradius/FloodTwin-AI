// Shared by the 3D and lite stages: scroll position -> continuous chapter coordinate t in [0, 7].
// The camera holds on each chapter while it is read and moves in the stretch before the next one arrives.
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10)
export const ease = (x) => smoother(clamp01(x))

export function chapterT(scrollY, anchors, vh) {
  let t = 0
  for (let i = 1; i < anchors.length; i++) {
    const start = anchors[i] - 0.92 * vh
    const end = anchors[i] - 0.12 * vh
    t += ease((scrollY - start) / (end - start))
  }
  return t
}
