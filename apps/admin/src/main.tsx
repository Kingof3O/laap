import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('LAAP UI error', error, info) }
  render() {
    if (this.state.hasError) return <div className="grid min-h-dvh place-items-center bg-canvas px-5 text-center"><div><p className="eyebrow">LAAP / Recovery</p><h1 className="mt-3 text-2xl font-semibold text-slate-100">The workspace needs a refresh.</h1><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">An unexpected UI error was contained. Your server-side data is safe.</p><button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100">Reload workspace</button></div></div>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>)
