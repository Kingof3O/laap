import { Play, Square } from 'lucide-react'
import type { Account } from '../../lib/types'

interface ActiveLeaseBannerProps {
  account: Account
  onRelaunch: () => void
  onRelease: () => void
  busy: boolean
}

export function ActiveLeaseBanner({
  account,
  onRelaunch,
  onRelease,
  busy,
}: ActiveLeaseBannerProps) {
  return (
    <div className="hextech-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="card-avatar" style={{ width: '48px', height: '48px' }}>
            <span className="avatar-initials">{account.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800 }}>
                {account.name}
              </span>
              <span className="avatar-region-pip" style={{ position: 'static' }}>
                {account.region}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--teal-primary)', fontWeight: 600 }}>
              ● Active Team Session Held
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn-launch-primary"
            style={{ width: 'auto', padding: '0 20px' }}
            onClick={onRelaunch}
            disabled={busy}
          >
            <Play size={14} fill="currentColor" />
            <span>Relaunch League</span>
          </button>
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={onRelease}
            disabled={busy}
          >
            <Square size={13} />
            <span>Release Account</span>
          </button>
        </div>
      </div>
    </div>
  )
}
