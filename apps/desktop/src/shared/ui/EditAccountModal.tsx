import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import type { LocalAccountSummary, ProfileDetails } from '../../lib/types'
import {
  canonicalRank,
  emptyCustomization,
} from '../../lib/profileCustomization'
import { useDialog } from '../hooks/useDialog'
import { ProfileFields, ProfilePreview } from './ProfileFields'
function fromAccount(account: LocalAccountSummary): ProfileDetails {
  return {
    name: account.name,
    region: account.region,
    rank: canonicalRank(account.rank) || null,
    notes: account.notes ?? '',
    favorite: account.favorite ?? false,
    customization: { ...emptyCustomization(), ...account.customization },
  }
}
export function EditAccountModal({
  account,
  onClose,
  onSave,
}: {
  account: LocalAccountSummary
  onClose: () => void
  onSave: (details: ProfileDetails) => Promise<void>
}) {
  const [details, setDetails] = useState(() => fromAccount(account)),
    [busy, setBusy] = useState(false),
    [assetBusy, setAssetBusy] = useState(false),
    [error, setError] = useState<string | null>(null)
  useEffect(() => setDetails(fromAccount(account)), [account])
  const ref = useDialog(true, onClose, busy)
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal-panel profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        tabIndex={-1}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy || assetBusy) return
            setBusy(true)
            setError(null)
            try {
              await onSave(details)
              onClose()
            } catch (cause) {
              setError(String(cause))
            } finally {
              setBusy(false)
            }
          }}
        >
          <header className="profile-modal-header">
            <div>
              <span className="profile-eyebrow">PERSONAL ROSTER</span>
              <h2 id="edit-title">Edit Profile</h2>
              <p>Make this account yours. Changes stay in your local vault.</p>
            </div>
            <button
              className="profile-modal-close"
              type="button"
              aria-label="Close dialog"
              disabled={busy}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>
          <ProfilePreview details={details} />
          <div className="profile-modal-content">
            <ProfileFields
              details={details}
              onChange={setDetails}
              disabled={busy || assetBusy}
              onAssetBusy={setAssetBusy}
            />
            {error ? (
              <p className="profile-form-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <footer className="profile-modal-footer">
            <span className="profile-save-hint">
              Your saved Riot login stays unchanged.
            </span>
            <div>
              <button
                className="btn-modal-secondary"
                type="button"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn-modal-primary"
                disabled={
                  busy || assetBusy || !details.name.trim() || !details.region
                }
              >
                <Check size={14} />
                {busy
                  ? 'Saving…'
                  : assetBusy
                    ? 'Preparing image…'
                    : 'Save changes'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
