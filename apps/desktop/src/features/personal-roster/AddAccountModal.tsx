import { useEffect, useRef, useState } from 'react'
import { X, Check, LogIn } from 'lucide-react'
import { useDialog } from '../../shared/hooks/useDialog'
import { ProfileFields, ProfilePreview } from '../../shared/ui/ProfileFields'
import { emptyCustomization } from '../../lib/profileCustomization'
import type {
  CapturedProfile,
  LocalAccountSummary,
  ProfileDetails,
} from '../../lib/types'
interface Props {
  isOpen: boolean
  onClose: () => void
  onCaptureActive: (details: ProfileDetails) => Promise<void>
  onStartSandbox: (details: ProfileDetails) => Promise<void>
  onCancelSandbox: () => Promise<void>
  onConfirmImport: (
    details: ProfileDetails,
    captured: CapturedProfile,
  ) => Promise<void>
  captured?: CapturedProfile | null
  refreshTarget?: LocalAccountSummary | null
  operationError?: string | null
  provisioning: boolean
  busy: boolean
}
const emptyDetails = (): ProfileDetails => ({
  name: '',
  region: '',
  rank: null,
  notes: '',
  favorite: false,
  customization: emptyCustomization(),
})
export function AddAccountModal({
  isOpen,
  onClose,
  onCaptureActive,
  onStartSandbox,
  onCancelSandbox,
  onConfirmImport,
  captured,
  refreshTarget,
  operationError,
  provisioning,
  busy,
}: Props) {
  const [details, setDetails] = useState(emptyDetails),
    [closing, setClosing] = useState(false),
    [assetBusy, setAssetBusy] = useState(false),
    [closeError, setCloseError] = useState<string | null>(null)
  const cancel = useRef(onCancelSandbox)
  cancel.current = onCancelSandbox
  useEffect(() => {
    if (!isOpen) {
      setDetails(emptyDetails())
      setCloseError(null)
    } else if (refreshTarget) {
      setDetails({
        name: refreshTarget.name,
        region: refreshTarget.region,
        rank: refreshTarget.rank ?? null,
        notes: refreshTarget.notes ?? '',
        favorite: refreshTarget.favorite ?? false,
        customization: {
          ...emptyCustomization(),
          ...refreshTarget.customization,
        },
      })
    } else if (captured) {
      setDetails((current) => ({
        ...current,
        name: captured.details.name || current.name,
        region: captured.details.region || current.region,
      }))
    }
  }, [isOpen, captured, refreshTarget])
  useEffect(
    () => () => {
      void cancel
        .current()
        .catch((cause) =>
          console.error('Unable to cancel sign-in:', String(cause)),
        )
    },
    [],
  )
  const close = async () => {
    if (busy || closing) return
    setClosing(true)
    try {
      await onCancelSandbox()
      onClose()
    } catch (cause) {
      setCloseError(String(cause))
    } finally {
      setClosing(false)
    }
  }
  const ref = useDialog(isOpen, () => void close(), busy || closing)
  if (!isOpen) return null
  const disabled = busy || closing || provisioning || assetBusy
  const prepared = { ...details, name: details.name.trim() }
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal-panel profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        tabIndex={-1}
      >
        <header className="profile-modal-header">
          <div>
            <span className="profile-eyebrow">PERSONAL ROSTER</span>
            <h2 id="add-title">
              {refreshTarget
                ? 'Sign in again'
                : captured
                  ? 'Review imported account'
                  : 'Add Account'}
            </h2>
            <p>
              {refreshTarget
                ? 'Refresh your saved login without changing this profile.'
                : 'A familiar face, a clear rank, and everything you need to pick your next account.'}
            </p>
          </div>
          <button
            className="profile-modal-close"
            type="button"
            aria-label="Close dialog"
            disabled={busy || closing}
            onClick={() => void close()}
          >
            <X size={18} />
          </button>
        </header>
        <ProfilePreview details={details} />
        <div className="profile-modal-content">
          {!refreshTarget ? (
            <ProfileFields
              details={details}
              onChange={setDetails}
              disabled={disabled}
              nameLabel="Account Name / Riot ID"
              regionLabel="Server Region"
              rankLabel="Rank (Optional)"
              onAssetBusy={setAssetBusy}
            />
          ) : (
            <p className="profile-information">
              Sign in to <strong>{refreshTarget.name}</strong>’s original Riot
              account. Your icon, rank, notes, and favorite settings will be
              preserved.
            </p>
          )}
          {captured ? (
            <p className="profile-information">
              Riot login detected. Review these details before saving.
              {!captured.details.region
                ? ' Choose the correct region; Riot did not provide one.'
                : ''}
            </p>
          ) : null}
          <p className="profile-information">
            Enable “Stay signed in” in Riot Client. A new sign-in closes
            Riot/League; your existing settings are restored when finished or
            cancelled.
          </p>
          {operationError ? (
            <p className="profile-form-error" role="alert">
              {operationError} Cancel this sign-in and try again.
            </p>
          ) : null}
          {provisioning && !operationError ? (
            <p className="profile-information" role="status">
              Waiting for Riot sign-in…{' '}
              {busy
                ? 'Saving and restoring settings…'
                : 'You can cancel to restore your previous settings.'}
            </p>
          ) : null}
          {closeError ? (
            <p className="profile-form-error" role="alert">
              {closeError}
            </p>
          ) : null}
        </div>
        <footer className="profile-modal-footer">
          <span className="profile-save-hint">Encrypted on this device.</span>
          <div>
            {provisioning ? (
              <button
                type="button"
                className="btn-modal-secondary"
                disabled={busy || closing}
                onClick={() => void close()}
              >
                Cancel sign-in
              </button>
            ) : captured ? (
              <button
                type="button"
                className="btn-modal-primary"
                disabled={
                  disabled || assetBusy || !prepared.name || !details.region
                }
                onClick={() => void onConfirmImport(prepared, captured)}
              >
                <Check size={14} /> Confirm and save
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-modal-secondary"
                  disabled={disabled || assetBusy}
                  onClick={() => void onCaptureActive(prepared)}
                >
                  Import Current Account
                </button>
                <button
                  type="button"
                  className="btn-modal-primary"
                  disabled={
                    disabled ||
                    assetBusy ||
                    (!refreshTarget && (!prepared.name || !details.region))
                  }
                  onClick={() => void onStartSandbox(prepared)}
                >
                  <LogIn size={14} /> Sign In To Another Account
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
