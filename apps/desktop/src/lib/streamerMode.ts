/**
 * Streamer Mode (Privacy Shield) for LAAP
 * Masks Riot IDs, names, and sensitive match statistics to prevent stream sniping.
 */

export function isStreamerModeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem('laap:streamer-mode') === 'true'
  } catch {
    return false
  }
}

export function setStreamerMode(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('laap:streamer-mode', String(enabled))
  } catch {}
  window.dispatchEvent(new CustomEvent('laap:streamer-mode-changed', { detail: enabled }))
}

/**
 * Masks a Riot ID (e.g., "Kingof3O#2516" -> "Kin***#****")
 */
export function maskRiotId(riotId?: string | null): string {
  if (!riotId) return ''
  const parts = riotId.split('#')
  if (parts.length === 2) {
    const name = parts[0]
    const tag = parts[1]
    const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : '***'
    return `${maskedName}#****`
  }
  return riotId.length > 2 ? `${riotId.slice(0, 2)}***` : '***'
}

/**
 * Masks an account display name (e.g., "Main - EUNE" -> "Account 01")
 */
export function maskAccountName(name: string, index?: number): string {
  if (typeof index === 'number') {
    return `Account ${String(index + 1).padStart(2, '0')}`
  }
  if (!name) return 'Hidden Account'
  return name.length > 3 ? `${name.slice(0, 3)}••••` : '••••'
}
