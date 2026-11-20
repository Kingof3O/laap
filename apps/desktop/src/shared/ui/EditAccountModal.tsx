import { useEffect, useRef, useState } from 'react'
import { X, Check } from 'lucide-react'
import type { Game, LocalAccountSummary, ProfileDetails } from '../../lib/types'
import {
  canonicalRank,
  canonicalValorantRank,
  emptyCustomization,
} from '../../lib/profileCustomization'
import { useDialog } from '../hooks/useDialog'
import { useGame } from '../../context/GameContext'
import { useToast } from '../../context/ToastContext'
import { useRiotOperations } from '../../context/RiotOperations'
import { ProfileFields, ProfilePreview } from './ProfileFields'

function fromAccount(account: LocalAccountSummary): ProfileDetails {
  const games: Game[] =
    account.games && account.games.length > 0 ? [...account.games] : ['league']
  return {
    name: account.name,
    region: account.region,
    rank: canonicalRank(account.rank) || null,
    valorant_rank: account.valorant_rank
      ? canonicalValorantRank(account.valorant_rank)
      : null,
    games,
    riot_id:
      account.riot_id ?? (account.name.includes('#') ? account.name : ''),
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
  const { activeGame, setActiveGame } = useGame()
  const { showSuccess } = useToast()
  const operations = useRiotOperations()
  const isLaunched = Boolean(
    operations.running &&
      operations.activeLaunchKey &&
      operations.activeLaunchKey.includes(account.id),
  )

  const [details, setDetails] = useState(() => fromAccount(account))
  const [busy, setBusy] = useState(false)
  const [assetBusy, setAssetBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preserve previously saved ranks so re-checking restores them
  const preservedLeagueRank = useRef<string | null>(account.rank ?? null)
  const preservedValRank = useRef<string | null>(account.valorant_rank ?? null)

  useEffect(() => {
    setDetails(fromAccount(account))
    preservedLeagueRank.current = account.rank ?? null
    preservedValRank.current = account.valorant_rank ?? null
  }, [account])

  const handleDetailsChange = (nextDetails: ProfileDetails) => {
    // If user edited rank while game is enabled, track in preserved refs
    if (nextDetails.games?.includes('league') && nextDetails.rank) {
      preservedLeagueRank.current = nextDetails.rank
    }
    if (nextDetails.games?.includes('valorant') && nextDetails.valorant_rank) {
      preservedValRank.current = nextDetails.valorant_rank
    }
    setDetails(nextDetails)
  }

  const ref = useDialog(true, onClose, busy)

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal-panel profile-modal profile-modal-wide"
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

            const selectedGames: Game[] =
              details.games && details.games.length > 0
                ? details.games
                : ['league']
            const savePayload: ProfileDetails = {
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

            try {
              await onSave(savePayload)
              if (!selectedGames.includes(activeGame)) {
                const remainingGame = selectedGames[0] || 'league'
                setActiveGame(remainingGame)
                showSuccess(
                  remainingGame === 'valorant'
                    ? 'Switched to VALORANT to show this profile.'
                    : 'Switched to League to show this profile.',
                )
              }
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
          <ProfilePreview details={details} activeGame={activeGame} />
          <div className="profile-modal-content">
            <ProfileFields
              details={details}
              onChange={handleDetailsChange}
              disabled={busy || assetBusy}
              onAssetBusy={setAssetBusy}
              isLaunched={isLaunched}
              activeGame={activeGame}
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
