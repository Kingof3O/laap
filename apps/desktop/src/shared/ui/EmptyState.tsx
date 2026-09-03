import { Gamepad2, Plus, Users } from 'lucide-react'

export interface EmptyStateProps {
  isCloud?: boolean
  searchActive?: boolean
  onAction?: () => void
}

export function EmptyState({
  isCloud = false,
  searchActive = false,
  onAction,
}: EmptyStateProps) {
  if (searchActive) {
    return (
      <div className="empty-state-card" style={{ margin: '32px 24px' }}>
        <div className="empty-state-icon">
          <Gamepad2 size={24} />
        </div>
        <h3 className="empty-state-title">No matching profiles</h3>
        <p className="empty-state-text">
          No accounts matched your search query or region filter.
        </p>
      </div>
    )
  }

  return (
    <div className="empty-state-card" style={{ margin: '32px 24px' }}>
      <div className="empty-state-icon">
        {isCloud ? <Users size={24} /> : <Gamepad2 size={24} />}
      </div>
      <h3 className="empty-state-title">
        {isCloud ? 'No Team Accounts Available' : 'Your Roster is Empty'}
      </h3>
      <p className="empty-state-text">
        {isCloud
          ? 'No shared tournament accounts have been added to the team vault yet.'
          : 'Save your League profiles here for instant credential-free account switching.'}
      </p>

      {onAction ? (
        <button
          type="button"
          className="btn-modal-primary"
          onClick={onAction}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={14} />
          <span>Add First Profile</span>
        </button>
      ) : null}
    </div>
  )
}
