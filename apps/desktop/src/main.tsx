import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './shared/ui/ErrorBoundary'
import './index.css'

try {
  document.documentElement.classList.toggle('reduced-motion', localStorage.getItem('laap_reduced_motion') === 'true')
} catch { /* Storage may be unavailable. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
