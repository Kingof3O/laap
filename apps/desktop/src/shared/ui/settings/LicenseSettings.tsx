import { CreditCard } from 'lucide-react'
import type { BillingStatus } from '../../../features/billing/useBilling'

export function LicenseSettings({ status, busy, onOpenBilling }: {
  status?: BillingStatus | null
  busy: boolean
  onOpenBilling?: () => void
}) {
  const plan = status?.pro ? 'LAAP Pro' : 'LAAP Basic'
  const offlineUntil = status?.pro && status.expiresAt
    ? new Date(status.expiresAt * 1000).toLocaleDateString()
    : null

  return (
    <div className="settings-section" aria-label="License and billing">
      <div className="settings-section-header">
        <h3 className="settings-section-title">License &amp; Billing</h3>
        <p className="settings-section-desc">Review your plan and activation on this computer.</p>
      </div>
      <section className="settings-card settings-plan">
        <div className="settings-card-heading">
          <CreditCard size={19} aria-hidden="true" />
          <h4>{status ? plan : 'Plan status unavailable'}</h4>
          {status?.pro ? <span className="settings-license-active">Active</span> : null}
        </div>
        <p>{status?.pro ? 'Unlimited active profiles on this computer.' :
          status ? 'Up to two active profiles on this computer.' : 'LAAP could not read the license status on this computer.'}</p>
        {offlineUntil ? <p>Offline access valid through <strong>{offlineUntil}</strong>.</p> : null}
        {status?.available && onOpenBilling ? (
          <div className="settings-plan-actions">
            <button className="btn-modal-primary" type="button" disabled={busy} onClick={onOpenBilling}>
              {status.pro ? 'Manage billing' : 'View plans'}
            </button>
            <p>{status.pro ? 'Check your license, manage payments, or transfer to another PC.' : 'Compare plans, restore a purchase, or redeem a gift code.'}</p>
          </div>
        ) : status ? <p>Billing is unavailable in this build.</p> : null}
      </section>
    </div>
  )
}
