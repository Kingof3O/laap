import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'

const App = import.meta.env.MODE === 'studio'
  ? lazy(() => import('./features/customization/StudioApp'))
  : import.meta.env.MODE === 'offline' || import.meta.env.MODE === 'basic'
    ? lazy(() => import('./App'))
    : lazy(() => import('./features/customization/CompleteApp'))
import { ErrorBoundary } from './shared/ui/ErrorBoundary'
import './index.css'

try {
  document.documentElement.classList.toggle('reduced-motion', localStorage.getItem('laap_reduced_motion') === 'true')
} catch { /* Storage may be unavailable. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={null}><App /></Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
