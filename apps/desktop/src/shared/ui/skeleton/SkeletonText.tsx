import { Skeleton } from './Skeleton.tsx'

export function SkeletonText({
  lines = 1,
  width = '100%',
  size = 'md',
  className = '',
}: {
  lines?: number
  width?: string | number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const heightMap = {
    xs: 10,
    sm: 13,
    md: 16,
    lg: 20,
  }

  const height = heightMap[size]

  if (lines <= 1) {
    return (
      <Skeleton
        variant="text"
        width={width}
        height={height}
        className={`skeleton-text ${className}`}
      />
    )
  }

  return (
    <div className={`skeleton-text-group ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => {
        const lineWidth =
          index === lines - 1 && typeof width === 'string' && width.endsWith('%')
            ? '65%'
            : width
        return (
          <Skeleton
            key={index}
            variant="text"
            width={lineWidth}
            height={height}
            className="skeleton-text"
          />
        )
      })}
    </div>
  )
}
