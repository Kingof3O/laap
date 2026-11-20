import { useEffect, useId, useRef, useState } from 'react'
import {
  VALORANT_RANK_OPTIONS,
  canonicalValorantRank,
} from '../../lib/profileCustomization'

export interface ValorantRankPickerProps {
  value?: string | null
  onChange: (rank: string | null) => void
  disabled?: boolean
  label?: string
}

export function ValorantRankPicker({
  value,
  onChange,
  disabled = false,
  label = 'VALORANT rank',
}: ValorantRankPickerProps) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const canonical = canonicalValorantRank(value)
  const allOptions = [
    ...(canonical && !VALORANT_RANK_OPTIONS.includes(canonical)
      ? [canonical]
      : []),
    ...VALORANT_RANK_OPTIONS,
  ]
  const options = allOptions.filter((rank) =>
    rank.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (!open) return
    const option = document.getElementById(`${id}-${active}`)
    const list = option?.parentElement
    if (!option || !list) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (
      option.offsetTop + option.offsetHeight >
      list.scrollTop + list.clientHeight
    )
      list.scrollTop =
        option.offsetTop + option.offsetHeight - list.clientHeight
  }, [open, active, id])

  const choose = (rank: string | null) => {
    onChange(rank)
    setOpen(false)
    setQuery('')
    ref.current?.focus()
  }

  return (
    <div className="rank-picker valorant-rank-picker">
      <div className="rank-picker-control">
        <input
          ref={ref}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${id}-${active}` : undefined
          }
          className="hextech-input"
          disabled={disabled}
          placeholder="Choose VALORANT rank"
          value={open ? query : canonical}
          onFocus={() => {
            setQuery('')
            setOpen(true)
            setActive(Math.max(0, allOptions.indexOf(canonical)))
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              setQuery('')
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    index + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              )
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (options[active]) choose(options[active])
            }
          }}
        />
        <button
          type="button"
          aria-label="Clear rank"
          disabled={disabled || !value}
          onClick={() => choose(null)}
        >
          ×
        </button>
      </div>
      {open && !disabled ? (
        <div
          className="rank-options"
          role="listbox"
          aria-label="VALORANT ranks"
          id={`${id}-options`}
        >
          {options.length ? (
            options.map((rank, index) => (
              <div
                role="option"
                aria-selected={canonical === rank}
                id={`${id}-${index}`}
                className={`rank-option ${active === index ? 'rank-option-active' : ''}`}
                key={rank}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(rank)
                }}
              >
                <span>{rank}</span>
                {!VALORANT_RANK_OPTIONS.includes(rank) ? (
                  <small>Previously saved rank</small>
                ) : null}
              </div>
            ))
          ) : (
            <p className="picker-hint">No matching ranks</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
