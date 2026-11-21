import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  Gamepad2,
  LayoutGrid,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { Game, LocalAccountSummary } from '../../lib/types.ts'
import { isStreamerModeEnabled, setStreamerMode } from '../../lib/streamerMode.ts'
import { isSoundEnabled, playHextechLaunch, playHextechSelect, playHextechTab, setSoundEnabled } from '../../lib/soundEffects.ts'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  badge?: string
  action: () => void
}

export function CommandPalette({
  isOpen,
  onClose,
  accounts,
  activeGame,
  onSwitchGame,
  onLaunchAccount,
  onOpenAddModal,
  onOpenSettings,
  onOpenCompare,
  onRefreshAll,
}: {
  isOpen: boolean
  onClose: () => void
  accounts: LocalAccountSummary[]
  activeGame: Game
  onSwitchGame: (game: Game) => void
  onLaunchAccount: (id: string, game?: Game) => void
  onOpenAddModal: () => void
  onOpenSettings: () => void
  onOpenCompare?: () => void
  onRefreshAll?: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [streamerMode, setStreamer] = useState(isStreamerModeEnabled())
  const [soundOn, setSound] = useState(isSoundEnabled())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setStreamer(isStreamerModeEnabled())
      setSound(isSoundEnabled())
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [isOpen])

  // Build searchable commands
  const commands: CommandItem[] = []

  // 1. Account Launch Commands
  for (const acc of accounts) {
    const supported = acc.games && acc.games.length > 0 ? acc.games : ['league']
    const hasCurrentGame = supported.includes(activeGame)
    const rankLabel = activeGame === 'valorant' ? acc.valorant_rank || 'Unranked' : acc.rank || 'Unranked'

    commands.push({
      id: `acc-${acc.id}`,
      title: `Launch ${acc.name}`,
      subtitle: `${acc.region} · ${rankLabel} ${hasCurrentGame ? '' : `(switches to ${supported[0]})`}`,
      icon: <Play size={14} fill="currentColor" />,
      badge: acc.has_session ? 'Ready' : 'Login needed',
      action: () => {
        playHextechLaunch()
        onClose()
        const targetGame: Game = hasCurrentGame ? activeGame : ((supported[0] as Game) ?? 'league')
        if (targetGame !== activeGame) onSwitchGame(targetGame)
        onLaunchAccount(acc.id, targetGame)
      },
    })
  }

  // 2. Navigation & Game Switch Actions
  commands.push({
    id: 'switch-game',
    title: activeGame === 'league' ? 'Switch to VALORANT' : 'Switch to League of Legends',
    subtitle: 'Change active roster game view',
    icon: <Gamepad2 size={14} />,
    action: () => {
      playHextechTab()
      onClose()
      onSwitchGame(activeGame === 'league' ? 'valorant' : 'league')
    },
  })

  // 3. Quick Actions
  commands.push({
    id: 'toggle-streamer',
    title: streamerMode ? 'Disable Streamer Mode' : 'Enable Streamer Mode (Privacy Shield)',
    subtitle: streamerMode ? 'Currently Active · Click to reveal IDs' : 'Masks account names & Riot IDs',
    icon: streamerMode ? <EyeOff size={14} /> : <Eye size={14} />,
    badge: streamerMode ? 'Active' : 'Off',
    action: () => {
      const next = !streamerMode
      setStreamerMode(next)
      setStreamer(next)
      playHextechSelect()
      onClose()
    },
  })

  commands.push({
    id: 'toggle-sound',
    title: soundOn ? 'Mute Hextech Audio' : 'Unmute Hextech Audio',
    subtitle: 'UI tactile sound effects',
    icon: soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />,
    badge: soundOn ? 'On' : 'Muted',
    action: () => {
      const next = !soundOn
      setSoundEnabled(next)
      setSound(next)
      if (next) playHextechSelect()
      onClose()
    },
  })

  commands.push({
    id: 'add-profile',
    title: 'Add New Profile',
    subtitle: 'Import a Riot account into the local encrypted vault',
    icon: <Plus size={14} />,
    action: () => {
      playHextechSelect()
      onClose()
      onOpenAddModal()
    },
  })

  if (onOpenCompare) {
    commands.push({
      id: 'compare-accounts',
      title: 'Compare Accounts Matrix',
      subtitle: 'Compare win rates, champion pools, and rank progress side-by-side',
      icon: <Sparkles size={14} />,
      action: () => {
        playHextechSelect()
        onClose()
        onOpenCompare()
      },
    })
  }

  if (onRefreshAll) {
    commands.push({
      id: 'refresh-all',
      title: 'Refresh All Account Stats',
      subtitle: 'Sync rank and icons from OP.GG across active roster',
      icon: <RefreshCw size={14} />,
      action: () => {
        playHextechSelect()
        onClose()
        onRefreshAll()
      },
    })
  }

  commands.push({
    id: 'open-settings',
    title: 'Open Settings',
    subtitle: 'Manage vault, performance mode, and launcher preferences',
    icon: <Settings size={14} />,
    action: () => {
      playHextechSelect()
      onClose()
      onOpenSettings()
    },
  })

  // Filter commands by query
  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.subtitle?.toLowerCase().includes(query.toLowerCase()),
      )
    : commands

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) item.action()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop command-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel command-palette-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-search-bar">
          <Search size={16} className="command-palette-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command or account name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            aria-label="Command search"
          />
          <kbd className="command-palette-kbd">ESC to close</kbd>
        </div>

        <ul className="command-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="command-palette-empty">No matching commands or profiles found.</li>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex
              return (
                <li
                  key={item.id}
                  className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="command-palette-item-icon">{item.icon}</div>
                  <div className="command-palette-item-text">
                    <span className="command-palette-item-title">{item.title}</span>
                    {item.subtitle ? (
                      <span className="command-palette-item-subtitle">{item.subtitle}</span>
                    ) : null}
                  </div>
                  {item.badge ? (
                    <span className="command-palette-item-badge">{item.badge}</span>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>

        <div className="command-palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to select
          </span>
          <span>
            <kbd>Ctrl+K</kbd> / <kbd>⌘K</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  )
}
