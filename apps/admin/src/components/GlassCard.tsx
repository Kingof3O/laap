import type { ReactNode } from 'react'

type GlassCardProps = {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}

export function GlassCard({ children, className = '', as = 'section' }: GlassCardProps) {
  const Component = as
  return <Component className={`glass-panel rounded-[24px] ${className}`}>{children}</Component>
}
