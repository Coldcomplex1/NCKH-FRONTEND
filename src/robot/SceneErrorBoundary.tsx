import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onError(error: unknown): void
}

interface State {
  failed: boolean
}

/**
 * Catches what R3F's own `fallback` cannot: WebGL context creation failures and GLB 404/parse
 * errors (useLoader rethrows them out of <Canvas>). The parent swaps in the 2D fallback.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn('[robot] 3D scene failed; showing the 2D fallback.', error, info.componentStack)
    this.props.onError(error)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
