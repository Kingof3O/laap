import { useEffect, useRef } from 'react'

export function useDialog(open: boolean, onClose: () => void, busy = false) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const blocked = useRef(busy)
  blocked.current = busy
  useEffect(() => {
    if (!open) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = ref.current
    if (!dialog) return
    const focusables = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0)
    ;(focusables()[0] ?? dialog).focus()
    const keydown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      )
      if (dialogs[dialogs.length - 1] !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!blocked.current) close.current()
      }
      if (event.key !== 'Tab') return
      const elements = focusables()
      const first = elements[0] ?? dialog
      const last = elements[elements.length - 1] ?? dialog
      if (
        !elements.length ||
        (event.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))) ||
        (!event.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement)))
      ) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    const focusin = (event: FocusEvent) => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      )
      if (
        dialogs[dialogs.length - 1] === dialog &&
        !dialog.contains(event.target as Node)
      )
        (focusables()[0] ?? dialog).focus()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  return ref
}
