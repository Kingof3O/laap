import type { LiveStatusBadge } from './types'

export function formatLiveMinutes(seconds?: number | null): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    ? Math.max(0, Math.floor(seconds / 60))
    : null
}

export function formatLiveMode(mode?: string | null): string {
  if (!mode) return 'League Match'
  const normalized = mode.trim().toUpperCase()
  if (normalized === 'CLASSIC') return "Summoner's Rift"
  if (normalized === 'ARAM') return 'ARAM'
  if (normalized === 'CHERRY') return 'Arena'
  if (normalized === 'URF') return 'URF'
  return mode
}

export function formatLiveMatchLabel(status?: LiveStatusBadge | null): string {
  if (!status) return 'Not checked'
  if (status.checking) return 'Checking…'
  if (status.inGame) {
    const mins = formatLiveMinutes(status.gameLengthSeconds)
    const parts = [formatLiveMode(status.gameMode)]
    if (mins !== null) parts.push(`${mins}m`)
    return `In match · ${parts.join(' · ')}`
  }
  if (status.inGame === false) return 'Not in game'
  return 'Not checked'
}
