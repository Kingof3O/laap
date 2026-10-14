import { useId } from 'react'
import { Star, RefreshCw } from 'lucide-react'
import type { ProfileDetails } from '../../lib/types'
import { emptyCustomization } from '../../lib/profileCustomization'
import { RegionSelect } from './RegionSelect'
import { RankCrest, RankPicker } from './RankPicker'
import { ProfileAvatar } from './ProfileAvatar'
import { IconPicker } from './IconPicker'
export function ProfilePreview({ details }: { details: ProfileDetails }) {
  return (
    <div className="profile-preview">
      <div className="profile-preview-avatar">
        <ProfileAvatar
          name={details.name}
          asset={details.customization?.icon_asset}
        />
        {details.favorite ? (
          <Star className="preview-favorite" size={14} fill="currentColor" />
        ) : null}
      </div>
      <div className="profile-preview-identity">
        <span className="profile-eyebrow">PROFILE PREVIEW</span>
        <h3>{details.name.trim() || 'Your account'}</h3>
        <div className="profile-preview-badges">
          <span className="profile-region-chip">
            {details.region || 'Choose region'}
          </span>
          {details.rank ? (
            <span className="profile-preview-rank">
              <RankCrest rank={details.rank} />
              {details.rank}
            </span>
          ) : (
            <span className="profile-muted">No rank set</span>
          )}
        </div>
      </div>
    </div>
  )
}
export function ProfileFields({
  details,
  onChange,
  disabled = false,
  nameLabel = 'Name',
  regionLabel = 'Region',
  rankLabel = 'Rank',
  onAssetBusy,
}: {
  details: ProfileDetails
  onChange: (details: ProfileDetails) => void
  disabled?: boolean
  nameLabel?: string
  regionLabel?: string
  rankLabel?: string
  onAssetBusy: (busy: boolean) => void
}) {
  const id = useId()
  const customization = { ...emptyCustomization(), ...details.customization }
  return (
    <>
      <div className="profile-form-grid">
        <label className="field-block profile-field-wide">
          <span className="field-label">{nameLabel}</span>
          <input
            className="hextech-input"
            required
            maxLength={120}
            disabled={disabled}
            value={details.name}
            onChange={(e) => onChange({ ...details, name: e.target.value })}
            placeholder="e.g. My main account"
          />
        </label>
        <div className="field-block">
          <span className="field-label">{regionLabel}</span>
          <RegionSelect
            label={regionLabel}
            value={details.region}
            disabled={disabled}
            onChange={(region) => onChange({ ...details, region })}
          />
        </div>
        <div className="field-block">
          <span className="field-label">{rankLabel}</span>
          <RankPicker
            label={rankLabel}
            value={details.rank}
            disabled={disabled || customization.auto_sync_rank}
            onChange={(rank) => onChange({ ...details, rank })}
          />
        </div>
        <label className="field-block profile-field-wide">
          <span className="field-label">
            Notes <span className="profile-muted">Optional</span>
          </span>
          <textarea
            className="hextech-input profile-notes-input"
            aria-label="Notes"
            aria-describedby={`${id}-notes-help`}
            rows={3}
            maxLength={2000}
            disabled={disabled}
            value={details.notes}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            placeholder="Account details, goals, or a reminder…"
          />
          <span className="field-caption" id={`${id}-notes-help`}>
            {details.notes.length}/2000 · Only stored in your local vault
          </span>
        </label>
      </div>
      <label className="profile-favorite-toggle">
        <input
          type="checkbox"
          disabled={disabled}
          aria-label="Favorite profile"
          checked={details.favorite}
          onChange={(e) => onChange({ ...details, favorite: e.target.checked })}
        />
        <Star size={15} />
        <span>
          Favorite profile
          <small>Mark this account with a star in your roster.</small>
        </span>
      </label>
      <div className="profile-tools-grid">
        <IconPicker
          value={customization}
          disabled={disabled}
          onBusy={onAssetBusy}
          onChange={(customization) => onChange({ ...details, customization })}
        />
        <section className="profile-sync-settings">
          <div className="profile-section-heading">
            <div>
              <h3>Sync from League Client</h3>
              <p>
                Optional · Read-only · Your account identity is checked before
                updates.
              </p>
            </div>
            <RefreshCw size={17} />
          </div>
          <label className="profile-sync-toggle">
            <input
              type="checkbox"
              disabled={disabled}
              aria-label="Auto-sync icon on game login"
              checked={customization.auto_sync_icon}
              onChange={(e) =>
                onChange({
                  ...details,
                  customization: {
                    ...customization,
                    auto_sync_icon: e.target.checked,
                  },
                })
              }
            />
            <span>
              Auto-sync icon on game login
              <small>
                Use your equipped summoner icon. Missing images download from
                Riot and are cached locally.
              </small>
            </span>
          </label>
          <label className="profile-sync-toggle">
            <input
              type="checkbox"
              disabled={disabled}
              aria-label="Auto-sync rank on game login"
              checked={customization.auto_sync_rank}
              onChange={(e) =>
                onChange({
                  ...details,
                  customization: {
                    ...customization,
                    auto_sync_rank: e.target.checked,
                  },
                })
              }
            />
            <span>
              Auto-sync rank on game login
              <small>
                Use your current Solo/Duo rank. Turn this off to choose a rank
                manually.
              </small>
            </span>
          </label>
          <p className="field-caption">
            Sync starts after you save, while LAAP and League Client are open.
            If the client is unavailable, your saved icon and rank stay
            unchanged.
          </p>
        </section>
      </div>
    </>
  )
}
