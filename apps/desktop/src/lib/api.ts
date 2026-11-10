export function isTauriAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } })
      .__TAURI_INTERNALS__?.invoke === 'function'
  )
}

export async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriAvailable()) throw new Error('Tauri IPC bridge unavailable')
  const tauri = await import('@tauri-apps/api/core')
  return tauri.invoke<T>(command, args)
}

export async function listenTauriEvent<T>(
  event: string,
  callback: (payload: T) => void,
): Promise<() => void> {
  if (!isTauriAvailable()) return () => {}
  try {
    const tauriEvent = await import('@tauri-apps/api/event')
    return await tauriEvent.listen<T>(event, (e) => callback(e.payload))
  } catch {
    return () => {}
  }
}

export const hasTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function openExternalUrl(url: string): Promise<void> {
  if (hasTauri) {
    try {
      await invokeTauri('open_external_url', { url })
      return
    } catch {
      // Fall back to the browser opener if the native command is unavailable.
    }
  }
  if (typeof window !== 'undefined')
    window.open(url, '_blank', 'noopener,noreferrer')
}

export async function minimizeWindow(): Promise<void> {
  if (hasTauri) await invokeTauri('window_minimize')
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (hasTauri) await invokeTauri('window_toggle_maximize')
}

export async function isWindowMaximized(): Promise<boolean> {
  if (hasTauri) return await invokeTauri<boolean>('window_is_maximized')
  return false
}

export async function closeWindow(): Promise<void> {
  if (hasTauri) await invokeTauri('window_close')
}
