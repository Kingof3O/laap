import type { HTMLAttributes, ReactNode } from 'react'

export interface ContentRevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  active?: boolean
  className?: string
}

export function ContentReveal({
  children,
  active = true,
  className = '',
  ...props
}: ContentRevealProps) {
  return (
    <div
      className={`content-reveal ${active ? 'content-reveal-active' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
