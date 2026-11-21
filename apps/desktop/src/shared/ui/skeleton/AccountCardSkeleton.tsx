import { Skeleton } from './Skeleton.tsx'

export function AccountCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`roster-card-skeleton ${className}`} aria-hidden="true">
      {/* Top Row: Avatar + Identity + Star Action */}
      <div className="card-top-row">
        <div className="card-avatar card-avatar-skeleton">
          <Skeleton
            variant="rectangular"
            width={48}
            height={48}
            className="skeleton-card-avatar"
            style={{ borderRadius: '12px' }}
          />
        </div>
        <div className="card-identity" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Skeleton variant="text" width={110} height={16} />
            <Skeleton variant="pill" width={38} height={16} />
          </div>
          <div className="card-meta-row" style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <Skeleton variant="pill" width={82} height={14} />
          </div>
        </div>
        <div className="card-top-actions">
          <Skeleton variant="circular" width={20} height={20} />
        </div>
      </div>

      {/* Details Row: Rank Emblem + Copy + Status Pill */}
      <div className="card-details-row" style={{ marginTop: 2 }}>
        <div className="card-rank" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Skeleton variant="circular" width={28} height={28} />
          <div className="card-rank-copy" style={{ display: 'grid', gap: 3 }}>
            <Skeleton variant="text" width={26} height={9} />
            <Skeleton variant="text" width={78} height={12} />
          </div>
        </div>
        <Skeleton variant="pill" width={86} height={22} />
      </div>

      {/* Win-rate bar placeholder */}
      <div className="season-record-skeleton" style={{ padding: '2px 0 0 0' }}>
        <div
          className="season-record-label-skeleton"
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}
        >
          <Skeleton variant="text" width={68} height={10} />
          <Skeleton variant="text" width={44} height={10} />
        </div>
        <Skeleton variant="pill" width="100%" height={4} />
      </div>

      {/* Bottom Row: Last Played + Action Button */}
      <div className="card-bottom-row" style={{ paddingTop: 8 }}>
        <div className="last-played-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skeleton variant="circular" width={13} height={13} />
          <Skeleton variant="text" width={68} height={11} />
        </div>
        <div className="card-actions-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skeleton variant="pill" width={74} height={32} />
        </div>
      </div>
    </div>
  )
}
