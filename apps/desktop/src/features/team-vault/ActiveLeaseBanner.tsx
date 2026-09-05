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
  const isLost = leaseState === 'LEASE_LOST'

  return (
    <div className={`active-lease-hud ${isLost ? 'active-lease-hud-warning' : ''}`}>
      <div className="lease-hud-left">
        <div className="lease-icon-pulse">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="lease-hud-title">
            {isLost ? 'Lease Session Interrupted' : 'Account In Use'}
          </div>
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
