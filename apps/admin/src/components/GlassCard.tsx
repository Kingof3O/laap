import type { ReactNode } from 'react'

type GlassCardProps = {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
  role?: string
  'aria-modal'?: boolean | 'true' | 'false'
  'aria-labelledby'?: string
}

export function GlassCard({ children, className = '', as = 'section', role, 'aria-modal': ariaModal, 'aria-labelledby': ariaLabelledby }: GlassCardProps) {
  const Component = as
  return <Component className={`glass-panel rounded-[24px] ${className}`} role={role} aria-modal={ariaModal} aria-labelledby={ariaLabelledby}>{children}</Component>
}
