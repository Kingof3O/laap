import { Skeleton } from './Skeleton.tsx'
import { SkeletonMetric } from './SkeletonMetric.tsx'

export function SeasonStatsSkeleton({
  isVal = false,
  className = '',
}: {
  isVal?: boolean
  className?: string
}) {
  return (
    <div
      className={`inspector-stats-skeleton ${className}`}
      aria-label={`Loading ${isVal ? 'VALORANT' : 'League'} season stats`}
      role="status"
    >
      <span className="sr-only">Loading season statistics…</span>

      {/* Top champions / agents strip */}
      <div className="inspector-top-heroes-section inspector-top-heroes-skeleton">
        <Skeleton variant="text" width={58} height={10} className="skeleton-label" />
        <div className="inspector-top-heroes">
          {[1, 2, 3].map((index) => (
            <div key={index} className="inspector-hero-pill inspector-hero-pill-skeleton">
              <Skeleton variant="circular" width={22} height={22} />
              <Skeleton variant="text" width={34} height={10} />
            </div>
          ))}
        </div>
      </div>

      {/* Metric lines */}
      <div className="inspector-season-metrics inspector-metrics-skeleton">
        <SkeletonMetric labelWidth="36%" valueWidth="22%" />
        {isVal ? (
          <>
            <SkeletonMetric labelWidth="24%" valueWidth="30%" />
            <SkeletonMetric labelWidth="28%" valueWidth="18%" />
          </>
        ) : (
          <SkeletonMetric labelWidth="32%" valueWidth="26%" />
        )}
      </div>

      {/* Win-rate bar skeleton */}
      <div className="season-record-skeleton">
        <div className="season-record-label-skeleton">
          <Skeleton variant="text" width="34%" height={11} />
          <Skeleton variant="text" width="22%" height={11} />
        </div>
        <Skeleton variant="pill" width="100%" height={4} />
      </div>
    </div>
  )
}
