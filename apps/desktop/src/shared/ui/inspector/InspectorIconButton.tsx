import type { ComponentProps } from 'react'

export function InspectorIconButton({
  label,
  title = label,
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
}: {
  label: string
  title?: string
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: ComponentProps<'button'>['type']
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title}
      className={`inspector-icon-btn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
