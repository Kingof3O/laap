import { Gamepad2, Plus, Users } from 'lucide-react'

interface EmptyStateProps {
  isCloud?: boolean
  searchActive?: boolean
  onAddAccount?: () => void
}

export function EmptyState({
  isCloud = false,
  searchActive = false,
  onAddAccount,
}: EmptyStateProps) {
  if (searchActive) {
    return (
      <div className="empty-zone">
        <div className="empty-crest">
          <Gamepad2 size={28} />
        </div>
        <h3 className="empty-title">No matching profiles</h3>
        <p className="empty-sub">
          No accounts matched your search or region filter.
        </p>
      </div>
    )
  }

  return (
    <div className="empty-zone">
      <div className="empty-crest">
        {isCloud ? <Users size={28} /> : <Gamepad2 size={28} />}
      </div>
      <h3 className="empty-title">
        {isCloud ? 'No Team Accounts Available' : 'Your Roster is Empty'}
      </h3>
      <p className="empty-sub">
        {isCloud
          ? 'No shared accounts have been provisioned in the team vault yet.'
          : 'Save your League accounts here for instant 1-click credential-free switching.'}
      </p>

      {onAddAccount ? (
        <button
          type="button"
          className="btn-gold-action"
          onClick={onAddAccount}
          style={{ marginTop: '16px' }}
        >
          <Plus size={14} />
          <span>Add Your First Account</span>
        </button>
      ) : null}
    </div>
  )
}
