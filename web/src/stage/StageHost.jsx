// Fixed, full-screen host for the stage. WebGL scene by default; 2D canvas with ?lite, or if WebGL fails.
import { Component, Suspense, lazy } from 'react'
import LiteStage from './LiteStage.jsx'
import { isLite } from './state.js'

const Scene3D = lazy(() => import('./Scene3D.jsx')) // code-split: ?lite never loads three.js

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
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

export default function StageHost() {
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
}
