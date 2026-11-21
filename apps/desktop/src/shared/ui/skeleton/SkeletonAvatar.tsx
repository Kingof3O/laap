import { Skeleton } from './Skeleton.tsx'

export function SkeletonAvatar({
  size = 40,
  shape = 'circular',
  className = '',
}: {
  size?: number | 'sm' | 'md' | 'lg'
  shape?: 'circular' | 'rounded'
  className?: string
}) {
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
        ? 24
        : size === 'md'
          ? 40
          : 52

  return (
    <Skeleton
      variant={shape === 'circular' ? 'circular' : 'rectangular'}
      width={pixelSize}
      height={pixelSize}
      className={`skeleton-avatar ${shape === 'rounded' ? 'skeleton-avatar-rounded' : ''} ${className}`}
    />
  )
}
