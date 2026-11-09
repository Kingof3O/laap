import type { ComponentType } from 'react'
import {
  Sliders,
  Palette,
  FolderSearch,
  Radio,
  RefreshCw,
  ShieldCheck,
  Cpu,
  Info,
} from 'lucide-react'

export type SettingsCategory =
  | 'general'
  | 'appearance'
  | 'riot'
  | 'presence'
  | 'updates'
  | 'security'
  | 'advanced'
  | 'about'

export interface CategoryItem {
  id: SettingsCategory
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
  badge?: string
}

export const SETTINGS_CATEGORIES: CategoryItem[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'riot', label: 'Riot Client', icon: FolderSearch },
  { id: 'presence', label: 'Presence', icon: Radio },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'security', label: 'Security & Vault', icon: ShieldCheck },
  { id: 'advanced', label: 'Advanced', icon: Cpu },
  { id: 'about', label: 'About', icon: Info },
]

interface SettingsNavRailProps {
  activeCategory: SettingsCategory
  onSelectCategory: (category: SettingsCategory) => void
  hasUpdate?: boolean
}

export function SettingsNavRail({
  activeCategory,
  onSelectCategory,
  hasUpdate = false,
}: SettingsNavRailProps) {
  return (
    <nav className="settings-nav-rail" aria-label="Settings Categories">
      {SETTINGS_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const isActive = activeCategory === cat.id
        const isUpdateTab = cat.id === 'updates'

        return (
          <button
            key={cat.id}
            type="button"
            className={`settings-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelectCategory(cat.id)}
            aria-selected={isActive}
            role="tab"
          >
            <Icon size={16} className="settings-nav-icon" />
            <span className="settings-nav-label">{cat.label}</span>
            {isUpdateTab && hasUpdate ? (
              <span className="settings-nav-badge">New</span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
