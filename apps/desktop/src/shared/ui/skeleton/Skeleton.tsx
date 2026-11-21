import type { CSSProperties, HTMLAttributes } from 'react'

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'pill'
  width?: string | number
  height?: string | number
  shimmer?: boolean
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  shimmer = true,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const dynamicStyle: CSSProperties = {
    ...style,
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
  }

  return (
    <span
      className={`skeleton skeleton-${variant} ${shimmer ? 'skeleton-shimmer' : ''} ${className}`}
      style={dynamicStyle}
      aria-hidden="true"
      {...props}
    />
  )
}
