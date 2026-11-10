import { invokeTauri } from '../../lib/api'

export interface Champion {
  id: string
  name: string
  title: string
  tags: string[]
}

export interface Skin {
  id: string
  num: number
  name: string
  chromas: boolean
}

export interface ChampionDetail extends Champion {
  lore: string
  skins: Skin[]
}

export interface Snapshot<T> {
  version: string
  locale: string
  cached: boolean
  bundled?: boolean
  data: T
}

export interface Preset {
  id: string | null
  name: string
  championId: string
  skinId: string
  accountId: string | null
  queueMode?: string | null
  notes?: string
  favorite?: boolean
  priority?: number
  revision?: number
}

export interface AccountOption {
  id: string
  name: string
  region: string
}

export type CosmeticReference = { championId: string; skinId: string }
export type CatalogPreferences = { favorites: string[]; recent: CosmeticReference[] }
export type CatalogChange = { action: 'favorite'; id: string; enabled: boolean } |
  { action: 'remember'; selection: CosmeticReference } | { action: 'clearHistory' }

export const catalog = {
  artwork: (id: string, version: string, skin?: number) =>
    invokeTauri<string>('catalog_artwork', { id, version, skin: skin ?? null }),
  preferences: (change?: CatalogChange) => invokeTauri<CatalogPreferences>('catalog_preferences', { change }),
  list: (locale: string, refresh: boolean) =>
    invokeTauri<Snapshot<Champion[]>>('catalog_list', { locale, refresh }),
  detail: (id: string, snapshot: Snapshot<Champion[]>) =>
    invokeTauri<Snapshot<ChampionDetail>>('catalog_champion', {
      id, locale: snapshot.locale, version: snapshot.version,
    }),
}

export const presets = {
  export: () => invokeTauri<string>('customization_preset_export'),
  import: (json: string, commit: boolean) =>
    invokeTauri<{ count: number; names: string[] }>('customization_preset_import', { json, commit }),
  resolve: (accountId: string | null, queueMode: string | null) =>
    invokeTauri<Preset[]>('customization_preset_resolve', { accountId, championId: null, queueMode }),
  list: () => invokeTauri<Preset[]>('customization_preset_list'),
  save: (preset: Preset) => invokeTauri<Preset>('customization_preset_save', { preset }),
  remove: (id: string) => invokeTauri<void>('customization_preset_delete', { id }),
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
