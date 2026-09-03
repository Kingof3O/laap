import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface ToastContextValue {
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setErrorMsg(null)
    setSuccessMsg(msg)
  }

  const showError = (msg: string) => {
    setErrorMsg(msg)
  }

  // Auto-dismiss success toast after 4s
  useEffect(() => {
    if (!successMsg) return
    const timer = window.setTimeout(() => setSuccessMsg(null), 4000)
    return () => window.clearTimeout(timer)
  }, [successMsg])

  // Auto-dismiss error toast after 5s
  useEffect(() => {
    if (!errorMsg) return
    const timer = window.setTimeout(() => setErrorMsg(null), 5000)
    return () => window.clearTimeout(timer)
  }, [errorMsg])

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}

      {/* Global Bottom-Right HUD Toaster */}
      <div className="hud-toast-container" aria-live="polite">
        {successMsg ? (
          <div className="hud-toast hud-toast-success">
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="hud-toast hud-toast-error">
            <X size={16} />
            <span>{errorMsg}</span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
