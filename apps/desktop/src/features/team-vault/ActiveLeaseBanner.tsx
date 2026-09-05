import { Play, RotateCcw, ShieldCheck } from 'lucide-react'
import type { Account } from '../../lib/types'
import type { LeaseUiState } from './useCloudAccounts'

interface ActiveLeaseBannerProps {
  account: Account
  onRelaunch: () => void
  onRelease: () => void
  busy: boolean
  leaseState: LeaseUiState
}

export function ActiveLeaseBanner({
  account,
  onRelaunch,
  onRelease,
  busy,
  leaseState,
}: ActiveLeaseBannerProps) {
  const stateLabel: Record<LeaseUiState, string> = {
    IDLE: 'No active lease',
    LEASE_ACQUIRED: 'Lease acquired',
    RIOT_CLIENT_STARTING: 'Riot Client starting',
    WAITING_FOR_RIOT_LOGIN: 'Waiting for Riot login',
    LEAGUE_RUNNING: 'League running',
    LEASE_LOST: 'Lease lost',
    RIOT_CLIENT_CLOSED: 'Riot Client closed',
  }
  return (
    <div className="active-lease-hud">
      <div className="lease-hud-left">
        <div className="lease-icon-pulse">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="lease-hud-title">{stateLabel[leaseState]}</div>
          <div className="lease-hud-name">
            {account.name} · {account.region}
          </div>
        </div>
      </div>

      <div className="lease-hud-actions">
        <button
          type="button"
          className="btn-lease-relaunch"
          onClick={onRelaunch}
          disabled={busy}
          title="Relaunch League of Legends with this account"
        >
          <Play size={12} fill="currentColor" />
          <span>Relaunch Game</span>
        </button>

        <button
          type="button"
          className="btn-lease-release"
          onClick={onRelease}
          disabled={busy}
          title="Release account back to the shared pool"
        >
          <RotateCcw size={12} />
          <span>Release Account</span>
        </button>
      </div>
    </div>
  )
}
