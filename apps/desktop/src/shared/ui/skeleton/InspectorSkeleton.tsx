import { Skeleton } from './Skeleton.tsx'
import { SeasonStatsSkeleton } from './SeasonStatsSkeleton.tsx'
import { SkeletonMetric } from './SkeletonMetric.tsx'

export function InspectorSkeleton({
  isVal = false,
  className = '',
}: {
  isVal?: boolean
  className?: string
}) {
  return (
    <aside
      className={`profile-inspector profile-inspector-skeleton ${className}`}
      aria-label="Loading profile details"
      aria-hidden="true"
    >
      {/* Top Header */}
      <div className="inspector-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton variant="text" width={100} height={15} />
        <div style={{ display: 'flex', gap: 4 }}>
          <Skeleton variant="rectangular" width={28} height={28} style={{ borderRadius: '6px' }} />
          <Skeleton variant="rectangular" width={28} height={28} style={{ borderRadius: '6px' }} />
        </div>
      </div>

      {/* Identity Header */}
      <div className="inspector-identity-header" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
        <Skeleton
          variant="rectangular"
          width={48}
          height={48}
          style={{ borderRadius: '12px' }}
        />
        <div style={{ display: 'grid', gap: 5, flex: 1, minWidth: 0 }}>
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="45%" height={11} />
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <Skeleton variant="pill" width={38} height={16} />
            <Skeleton variant="pill" width={68} height={16} />
            <Skeleton variant="pill" width={78} height={16} />
          </div>
        </div>
      </div>

      {/* Rank Card */}
      <div
        className="inspector-rank-card"
        style={{
          display: 'grid',
          gap: 10,
          padding: '10px 12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <div style={{ display: 'grid', gap: 4 }}>
            <Skeleton variant="text" width={30} height={10} />
            <Skeleton variant="text" width={110} height={16} />
          </div>
        </div>
        <Skeleton variant="pill" width="100%" height={36} />
      </div>

      {/* Season Stats Section */}
      <div className="inspector-section" style={{ display: 'grid', gap: 6 }}>
        <div className="inspector-section-heading" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Skeleton variant="text" width={90} height={14} />
          <Skeleton variant="circular" width={20} height={20} />
        </div>
        <div
          className="inspector-stats-card"
          style={{
            padding: '7px 9px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <SeasonStatsSkeleton isVal={isVal} />
        </div>
      </div>

      {/* Activity Section */}
      <div className="inspector-section" style={{ display: 'grid', gap: 6 }}>
        <Skeleton variant="text" width={60} height={13} />
        <div className="inspector-details" style={{ display: 'grid', gap: 5 }}>
          <SkeletonMetric labelWidth="30%" valueWidth="28%" />
          <SkeletonMetric labelWidth="35%" valueWidth="24%" />
          <SkeletonMetric labelWidth="25%" valueWidth="32%" />
        </div>
      </div>

      {/* Notes Section */}
      <div className="inspector-section" style={{ display: 'grid', gap: 6 }}>
        <Skeleton variant="text" width={48} height={13} />
        <Skeleton variant="text" width="85%" height={12} />
      </div>
    </aside>
  )
}
