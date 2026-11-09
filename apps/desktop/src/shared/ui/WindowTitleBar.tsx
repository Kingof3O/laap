import { useEffect, useState, type ReactNode } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { hasTauri, invokeTauri } from '../../lib/api'

export function WindowTitleBar({ children }: { children: ReactNode }) {
  const [maximized, setMaximized] = useState(false)
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')

  // Check initial maximized state and listen for resize if native
  useEffect(() => {
    if (!hasTauri) return

    const checkMaximized = async () => {
      try {
        const isMax = await invokeTauri<boolean>('window_is_maximized')
        setMaximized(Boolean(isMax))
      } catch {}
    }

    void checkMaximized()
    window.addEventListener('resize', checkMaximized)
    return () => window.removeEventListener('resize', checkMaximized)
  }, [])

  const handleMinimize = async () => {
    if (!hasTauri) return
    try {
      await invokeTauri('window_minimize')
    } catch {}
  }

  const handleToggleMaximize = async () => {
    if (!hasTauri) return
    try {
      await invokeTauri('window_toggle_maximize')
      setMaximized((prev) => !prev)
    } catch {}
  }

  const handleClose = async () => {
    if (!hasTauri) return
    try {
      // Calls window_close which triggers WindowEvent::CloseRequested.
      // This routes directly to LAAP's native close-to-tray & quit safety logic!
      await invokeTauri('window_close')
    } catch {}
  }

  // On macOS, the system draws native traffic lights in the title bar region.
  // We provide a subtle header spacing on macOS and custom controls on Windows.
  if (isMac) {
    return (
      <div className="titlebar titlebar-mac" data-tauri-drag-region>
        {children}
      </div>
    )
  }

  return (
    <div
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).hasAttribute('data-tauri-drag-region')) void handleToggleMaximize()
      }}
    >
      {children}

      <div className="titlebar-controls" data-tauri-drag-region="false">
        <button
          type="button"
          className="titlebar-btn titlebar-minimize"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-maximize"
          onClick={handleToggleMaximize}
          title={maximized ? 'Restore' : 'Maximize'}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-close"
          onClick={handleClose}
          title="Close to Tray"
          aria-label="Close to Tray"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
