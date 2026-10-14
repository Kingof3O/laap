import { Component, type ErrorInfo, type ReactNode } from 'react'
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_error: Error, info: ErrorInfo) {
    console.error('LAAP interface failed', info.componentStack)
  }
  render() {
    return this.state.failed ? (
      <main className="empty-state-card" role="alert">
        <h1>LAAP couldn’t display this screen</h1>
        <p>
          Your saved profiles have not been deleted. Restart the interface to
          try again.
        </p>
        <button
          className="btn-modal-primary"
          onClick={() => window.location.reload()}
        >
          Restart interface
        </button>
      </main>
    ) : (
      this.props.children
    )
  }
}
