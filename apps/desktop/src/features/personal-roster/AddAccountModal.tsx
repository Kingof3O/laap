import { useEffect, useRef, useState } from 'react'
import { X, Check, LogIn, Zap, ShieldCheck, Swords, Crosshair } from 'lucide-react'
import { useDialog } from '../../shared/hooks/useDialog'
import { ProfileFields, ProfilePreview } from '../../shared/ui/ProfileFields'
import { emptyCustomization } from '../../lib/profileCustomization'
import { useGame } from '../../context/GameContext'
import { useToast } from '../../context/ToastContext'
import type {
  CapturedProfile,
  Game,
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

type AddMode = 'sign-in' | 'import'

const emptyDetails = (activeGame: Game = 'league'): ProfileDetails => ({
  name: '',
  region: '',
  rank: null,
  valorant_rank: null,
  games: [activeGame],
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
  const { activeGame, setActiveGame } = useGame()
  const { showSuccess } = useToast()

  const [details, setDetails] = useState<ProfileDetails>(() =>
    emptyDetails(activeGame),
  )
  const [mode, setMode] = useState<AddMode>('sign-in')
  const [closing, setClosing] = useState(false)
  const [assetBusy, setAssetBusy] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const cancel = useRef(onCancelSandbox)
  cancel.current = onCancelSandbox

  useEffect(() => {
    if (!isOpen) {
      setDetails(emptyDetails(activeGame))
      setMode('sign-in')
      setCloseError(null)
    } else if (refreshTarget) {
      setDetails({
        name: refreshTarget.name,
        region: refreshTarget.region,
        rank: refreshTarget.rank ?? null,
        valorant_rank: refreshTarget.valorant_rank ?? null,
        games:
          refreshTarget.games && refreshTarget.games.length > 0
            ? refreshTarget.games
            : [activeGame],
        notes: refreshTarget.notes ?? '',
        favorite: refreshTarget.favorite ?? false,
        customization: {
          ...emptyCustomization(),
          ...refreshTarget.customization,
        },
      })
    } else if (captured) {
      setMode('sign-in')
      setDetails((current) => ({
        ...current,
        name: captured.details.name || current.name,
        region: captured.details.region || current.region,
        games:
          current.games && current.games.length > 0
            ? current.games
            : [activeGame],
      }))
    } else {
      setDetails(emptyDetails(activeGame))
    }
  }, [isOpen, captured, refreshTarget, activeGame])

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
  const selectedGames =
    details.games && details.games.length > 0 ? details.games : [activeGame]

  const prepared: ProfileDetails = {
    ...details,
    name: details.name.trim(),
    games: selectedGames,
    rank: selectedGames.includes('league')
      ? details.rank?.trim() || null
      : null,
    valorant_rank: selectedGames.includes('valorant')
      ? details.valorant_rank?.trim() || null
      : null,
  }

  const signinGame: Game = selectedGames.includes(activeGame)
    ? activeGame
    : selectedGames[0] ?? activeGame

  const showModeTabs = !refreshTarget && !captured && !provisioning
  const canSubmitSignIn =
    !disabled &&
    !assetBusy &&
    (Boolean(refreshTarget) ||
      (Boolean(prepared.name) && Boolean(details.region)))
  const canConfirmImport =
    !disabled && !assetBusy && Boolean(prepared.name) && Boolean(details.region)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (provisioning || closing || busy || assetBusy) return
    if (captured) {
      if (canConfirmImport) {
        await onConfirmImport(prepared, captured)
        if (!selectedGames.includes(activeGame)) {
          const nextGame = selectedGames[0] || 'league'
          setActiveGame(nextGame)
          showSuccess(
            nextGame === 'valorant'
              ? 'Switched to VALORANT to show this profile.'
              : 'Switched to League to show this profile.',
          )
        }
      }
      return
    }
    if (mode === 'import' && showModeTabs) {
      void onCaptureActive(prepared)
      return
    }
    if (canSubmitSignIn) {
      void onStartSandbox(prepared)
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal-panel profile-modal profile-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        tabIndex={-1}
      >
        <form onSubmit={handleSubmit}>
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
                  : captured
                    ? 'Check detected account details, customize icon/sync, and save.'
                    : 'Sign into a new Riot account or import an active Riot Client session.'}
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

          {showModeTabs ? (
            <div
              className="add-mode-switcher"
              role="tablist"
              aria-label="Add account method"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'sign-in'}
                className={`add-mode-tab ${mode === 'sign-in' ? 'add-mode-tab-active' : ''}`}
                disabled={disabled}
                onClick={() => setMode('sign-in')}
              >
                <LogIn size={14} />
                <span>New Riot Sign-In</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'import'}
                className={`add-mode-tab ${mode === 'import' ? 'add-mode-tab-active' : ''}`}
                disabled={disabled}
                onClick={() => setMode('import')}
              >
                <Zap size={14} />
                <span>Import Current Session</span>
              </button>
            </div>
          ) : null}

          {!showModeTabs || mode === 'sign-in' ? (
            <ProfilePreview details={details} activeGame={activeGame} />
          ) : null}

          <div className="profile-modal-content">
            {refreshTarget ? (
              <p className="profile-information">
                Sign in to <strong>{refreshTarget.name}</strong>’s original Riot
                account. Your icon, rank, notes, and favorite settings will be
                preserved.
              </p>
            ) : mode === 'import' && showModeTabs ? (
              <div className="import-session-card" role="tabpanel">
                <div className="import-session-icon" aria-hidden="true">
                  <Zap size={20} />
                </div>
                <div className="import-session-copy">
                  <h3>Already signed into Riot Client?</h3>
                  <p>
                    If you checked <strong>“Stay signed in”</strong> in Riot
                    Client, LAAP reads your active session automatically—no need
                    to enter Name or Region before importing.
                  </p>

                  {/* Games Selection for Import Mode */}
                  <div
                    className="field-block profile-games-field"
                    style={{ margin: '14px 0', paddingBottom: '12px' }}
                  >
                    <div className="profile-games-header">
                      <span className="field-label">Games</span>
                      <span className="field-caption">
                        The same Riot login works for both games.
                      </span>
                    </div>
                    <div
                      className="profile-game-chips"
                      role="group"
                      aria-label="Supported games"
                    >
                      <label
                        className={`profile-game-chip ${
                          selectedGames.includes('league')
                            ? 'profile-game-chip-selected'
                            : ''
                        } ${
                          selectedGames.includes('league') &&
                          selectedGames.length === 1
                            ? 'profile-game-chip-disabled'
                            : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          aria-label="League of Legends"
                          checked={selectedGames.includes('league')}
                          disabled={
                            disabled ||
                            (selectedGames.includes('league') &&
                              selectedGames.length === 1)
                          }
                          onChange={(e) => {
                            if (!e.target.checked && selectedGames.length <= 1)
                              return
                            const nextGames = e.target.checked
                              ? [...selectedGames, 'league' as const]
                              : selectedGames.filter((g) => g !== 'league')
                            setDetails({ ...details, games: nextGames })
                          }}
                        />
                        <img
                          src="/league-of-legends-icon.webp"
                          alt=""
                          className="profile-game-chip-icon"
                          aria-hidden="true"
                        />
                        <span>League of Legends</span>
                      </label>
                      <label
                        className={`profile-game-chip ${
                          selectedGames.includes('valorant')
                            ? 'profile-game-chip-selected'
                            : ''
                        } ${
                          selectedGames.includes('valorant') &&
                          selectedGames.length === 1
                            ? 'profile-game-chip-disabled'
                            : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          aria-label="VALORANT"
                          checked={selectedGames.includes('valorant')}
                          disabled={
                            disabled ||
                            (selectedGames.includes('valorant') &&
                              selectedGames.length === 1)
                          }
                          onChange={(e) => {
                            if (!e.target.checked && selectedGames.length <= 1)
                              return
                            const nextGames = e.target.checked
                              ? [...selectedGames, 'valorant' as const]
                              : selectedGames.filter((g) => g !== 'valorant')
                            setDetails({ ...details, games: nextGames })
                          }}
                        />
                        <img
                          src="/valorant-icon.webp"
                          alt=""
                          className="profile-game-chip-icon"
                          aria-hidden="true"
                        />
                        <span>VALORANT</span>
                      </label>
                    </div>
                    {selectedGames.length === 1 && (
                      <p className="field-caption">
                        At least one game must remain selected.
                      </p>
                    )}
                  </div>

                  <ul className="import-session-steps">
                    <li>
                      <ShieldCheck size={14} /> Your Riot ID &amp; region
                      auto-fill for review before anything saves.
                    </li>
                    <li>
                      <ShieldCheck size={14} /> Existing Riot session stays
                      encrypted locally inside LAAP Basic.
                    </li>
                  </ul>
                  <div className="import-session-actions">
                    <button
                      type="button"
                      className="btn-modal-primary"
                      disabled={disabled || assetBusy}
                      onClick={() => void onCaptureActive(prepared)}
                    >
                      <Zap size={14} /> Import Current Account
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ProfileFields
                details={details}
                onChange={setDetails}
                disabled={disabled}
                nameLabel="Account Name / Riot ID"
                regionLabel="Server Region"
                rankLabel="Rank (Optional)"
                onAssetBusy={setAssetBusy}
                activeGame={activeGame}
              />
            )}

            {captured ? (
              <p className="profile-information profile-callout">
                Riot login detected. Review these details before saving.
                {!captured.details.region
                  ? ' Choose the correct region; Riot did not provide one.'
                  : ''}
              </p>
            ) : null}

            {!showModeTabs || mode === 'sign-in' ? (
              <p className="profile-information profile-callout">
                Check <strong>“Stay signed in”</strong> in Riot Client. A new
                sign-in closes active Riot/League processes; your previous
                session is automatically backed up and restored if cancelled.
              </p>
            ) : null}

            {operationError ? (
              <p className="profile-form-error" role="alert">
                {operationError} Cancel this sign-in and try again.
              </p>
            ) : null}
            {provisioning && !operationError ? (
              <p className="profile-information profile-callout" role="status">
                Waiting for Riot sign-in ({signinGame === 'valorant' ? 'VALORANT' : 'League'})…{' '}
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
            <span className="profile-save-hint">
              {showModeTabs &&
              mode === 'sign-in' &&
              (!prepared.name || !details.region)
                ? 'Fill Name & Region above to launch Riot sign-in.'
                : 'Encrypted on this device.'}
            </span>
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
                <>
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={busy || closing}
                    onClick={() => void close()}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-primary"
                    disabled={!canConfirmImport}
                  >
                    <Check size={14} /> Confirm and save
                  </button>
                </>
              ) : mode === 'import' && showModeTabs ? (
                <>
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={busy || closing}
                    onClick={() => void close()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={disabled}
                    onClick={() => setMode('sign-in')}
                  >
                    <LogIn size={14} /> Switch to New Sign-In
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    disabled={busy || closing}
                    onClick={() => void close()}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-primary"
                    disabled={!canSubmitSignIn}
                  >
                    <LogIn size={14} /> Sign In To Another Account
                  </button>
                </>
              )}
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
