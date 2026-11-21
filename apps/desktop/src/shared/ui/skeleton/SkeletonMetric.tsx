import { Skeleton } from './Skeleton.tsx'

export function SkeletonMetric({
  labelWidth = '35%',
  valueWidth = '25%',
  className = '',
}: {
  labelWidth?: string | number
  valueWidth?: string | number
  className?: string
}) {
  return (
    <div className={`skeleton-metric ${className}`} aria-hidden="true">
      <Skeleton variant="text" width={labelWidth} height={12} />
      <Skeleton variant="text" width={valueWidth} height={12} />
    </div>
  )
}
