// Fixed, full-screen host for the stage. WebGL scene by default; 2D canvas with ?lite, or if WebGL fails.
import { Component, Suspense, lazy, memo } from 'react'
import LiteStage from './LiteStage.jsx'
import { isLite } from './state.js'

const Scene3D = lazy(() => import('./Scene3D.jsx')) // code-split: ?lite never loads three.js

// Checked ONCE. Every probe creates a WebGL context; doing it on each re-render (slider moves) exhausted the
// browser's context limit and evicted the real scene's context, which turned the stage black.
let webglOk
function hasWebGL() {
  if (webglOk !== undefined) return webglOk
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    webglOk = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglOk = false
  }
  return webglOk
}

class Fallback extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <LiteStage /> : this.props.children
  }
}

export default memo(function StageHost() {
  const lite = isLite() || !hasWebGL()
  return (
    <div className="stage" aria-hidden="true">
      {lite ? (
        <LiteStage />
      ) : (
        <Fallback>
          <Suspense fallback={null}>
            <Scene3D />
          </Suspense>
        </Fallback>
      )}
      <div className="stage-vignette" />
    </div>
  )
})
