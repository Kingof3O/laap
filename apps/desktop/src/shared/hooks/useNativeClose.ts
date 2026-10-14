import { useEffect, useRef } from 'react'
import { invokeTauri } from '../../lib/api'
export function useNativeClose(
  active: boolean,
  finish: () => Promise<void>,
  onError: (cause: unknown) => void,
) {
  const callbacks = useRef({ finish, onError })
  callbacks.current = { finish, onError }
  useEffect(() => {
    if (!active) return
    let disposed = false,
      closing = false
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        if (disposed) return
        if (await invokeTauri<boolean>('tray_available').catch(() => false))
          return
        const window = getCurrentWindow()
        const stop = await window.onCloseRequested(async (event) => {
          event.preventDefault()
          if (closing) return
          closing = true
          try {
            await callbacks.current.finish()
            await window.destroy()
          } catch (cause) {
            callbacks.current.onError(cause)
            closing = false
          }
        })
        if (disposed) {
          void Promise.resolve()
            .then(stop)
            .catch(() => {
              // The native event bridge may disappear while the view unmounts.
            })
        } else unlisten = stop
      })
      .catch((cause) => {
        if (!disposed) callbacks.current.onError(cause)
      })
    return () => {
      disposed = true
      void Promise.resolve()
        .then(() => unlisten?.())
        .catch(() => {
          // The native event bridge may disappear while the view unmounts.
        })
    }
  }, [active])
}
