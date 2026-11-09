import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export interface ContextMenuProps {
  items: MenuItem[]
  label?: string
  className?: string
}

export function ContextMenu({ items, label = 'More options', className = '' }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    const rect = triggerRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (rect && menu) {
      const bounds = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 8))}px`
      menu.style.top = `${Math.max(8, rect.bottom + bounds.height + 4 <= window.innerHeight ? rect.bottom + 4 : rect.top - bounds.height - 4)}px`
    }
    menuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`context-menu-wrapper ${className}`} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn context-menu-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={16} />
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="context-menu-popover"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'))
            if (!buttons.length) return
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next].focus()
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              className={`context-menu-item ${item.danger ? 'context-menu-item-danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon ? <span className="menu-item-icon">{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>, document.body
      ) : null}
    </div>
  )
}
