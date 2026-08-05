import { Component, type ErrorInfo, type ReactNode } from "react"

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled application error", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <h1>Something went wrong</h1>
          <p>
            Energy Map hit an unexpected error and could not continue. Reloading the page usually
            resolves this.
          </p>
          <p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </p>
          <details>
            <summary>Technical details</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
