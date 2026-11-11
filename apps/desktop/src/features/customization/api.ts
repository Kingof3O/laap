import { invokeTauri } from '../../lib/api'

export interface Chroma {
  id: string
  name: string
  colors: string[]
}

export interface Variant {
  id: string
  name: string
  description: string
}

export interface Skin {
  id: string
  num: number
  name: string
  chromas: boolean
  availableChromas?: Chroma[]
  variants?: Variant[]
}

export interface Champion {
  id: string
  name: string
  title: string
  tags: string[]
}

export interface ChampionDetail extends Champion {
  lore: string
  skins: Skin[]
}

export interface TftItem {
  id: string
  name: string
  category: string
  tier: number
  description: string
}

export interface RandomPick {
  championId: string
  championName: string
  skinId: string
  skinNum: number
  skinName: string
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
  chromaId?: string | null
  variantId?: string | null
  accountId: string | null
  queueMode?: string | null
  notes?: string
  favorite?: boolean
  priority?: number
  revision?: number
}

export interface PresetConflict {
  championId: string
  presets: Preset[]
  reason: string
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

export interface ModInfo {
  id: string
  name: string
  author: string
  version: string
  description: string
  champion?: string
  enabled: boolean
  priority: number
  sha256: string
  sizeBytes: number
  fileCount: number
  format: string
}

export interface ConflictReport {
  hasConflicts: boolean
  conflicts: Array<{ relativePath: string; conflictingMods: string[] }>
}

export interface FantomeEntry {
  relativePath: string
  sizeBytes: number
  compressedSize: number
  formatType: string
}

export interface FantomeMeta {
  name: string
  author: string
  version: string
  description: string
  modType: string
  targetChampion?: string
  targetSkin?: number
}

export interface ExtractionSummary {
  filesCount: number
  totalBytes: number
  extractedFiles: string[]
}

export interface CreatorProject {
  id: string
  name: string
  author: string
  version: string
  description: string
  champion: string
  skinNum: number
  tags: string[]
  files: ProjectFile[]
  createdAt: string
  updatedAt: string
}

export interface ProjectFile {
  relativePath: string
  sizeBytes: number
  sha256: string
  formatType: string
  dataBase64?: string
}

export interface ProjectSummary {
  id: string
  name: string
  author: string
  version: string
  champion: string
  fileCount: number
  updatedAt: string
}

export interface ThemeConfig {
  id: string
  name: string
  author: string
  version: string
  isBuiltin: boolean
  palette: {
    background: string
    surface: string
    primary: string
    secondary: string
    accent: string
    text: string
    textMuted: string
    border: string
  }
  customMedia?: {
    backgroundVideo?: string
    backgroundGif?: string
    wallpaperUrl?: string
    musicTrack?: string
  }
  fontFamily: string
  animationsEnabled: boolean
}

export interface GamePathConfig {
  leaguePath: string | null
  gameExePath: string | null
  isDetected: boolean
}

export interface LcuConnectionStatus {
  connected: boolean
  port?: number
  phase?: string
  error?: string
}

export interface AiResponse {
  message: string
  model: string
  tokensUsed: number
}

export interface TtsResponse {
  audioBase64: string
  format: string
  characterCount: number
}

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
  tftList: () => invokeTauri<TftItem[]>('catalog_tft_list'),
  randomPick: (favoritesOnly?: boolean) =>
    invokeTauri<RandomPick>('catalog_random_pick', { favoritesOnly: favoritesOnly ?? false }),
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
  duplicate: (id: string) => invokeTauri<Preset>('customization_preset_duplicate', { id }),
  restore: (id: string) => invokeTauri<Preset>('customization_preset_restore', { id }),
  conflicts: () => invokeTauri<PresetConflict[]>('customization_preset_conflicts'),
}

export interface StagingReport {
  stagedModsCount: number
  stagedFilesCount: number
  skippedOrFailedMods: string[]
  stagingDirectory: string
  gameOverlayDirectory?: string | null
  backupManifestPath?: string | null
  message: string
}

export interface RollbackReport {
  restoredFilesCount: number
  stagingCleaned: boolean
  gameOverlayCleaned: boolean
  message: string
}

export interface PackageManifest {
  schemaVersion: number; modId: string; version: string; displayName: string; author: string; license: string
  rightToDistribute: boolean; containsPaidRiotContent: boolean; sha256: string; supportedGameBuilds: string[]
  championIds: number[]; files: { relativePath: string; sha256: string; sizeBytes: number }[]
  attributionUrl?: string | null; notes?: string | null
}
export interface InstalledPackage { manifest: PackageManifest; archiveBytes: number; enabled: boolean; priority: number; format: string }
export interface ModPackageData { sha256: string; archiveBase64: string; manifest: PackageManifest }
export const mods = {
  list: async () => (await invokeTauri<InstalledPackage[]>('mod_list')).map(r => ({
    id: r.manifest.sha256, name: r.manifest.displayName, author: r.manifest.author, version: r.manifest.version,
    description: r.manifest.notes ?? '', enabled: r.enabled, priority: r.priority, sha256: r.manifest.sha256,
    sizeBytes: r.archiveBytes, fileCount: r.manifest.files.length, format: r.format,
  })),
  setEnabled: (hash: string, enabled: boolean) => invokeTauri<void>('mod_set_enabled', { hash, enabled }),
  setPriority: (hash: string, priority: number) => invokeTauri<void>('mod_set_priority', { hash, priority }),
  conflicts: async (): Promise<ConflictReport> => {
    const conflicts = await invokeTauri<ConflictReport['conflicts']>('mod_detect_conflicts')
    return { hasConflicts: conflicts.length > 0, conflicts }
  },
  stageOverlay: () => invokeTauri<StagingReport>('mod_stage_overlay', { targetGameDir: null }),
  rollback: () => invokeTauri<RollbackReport>('mod_rollback', { targetGameDir: null }),
  getPackageData: (sha256: string) => invokeTauri<ModPackageData>('mod_get_package_data', { sha256 }),
  detectFormat: (archiveBase64: string) => invokeTauri<string>('fantome_detect_format', { archiveBase64 }),
  listContents: (zipBase64: string) => invokeTauri<FantomeEntry[]>('fantome_list_contents', { zipBase64 }),
  readMeta: (zipBase64: string) => invokeTauri<FantomeMeta>('fantome_read_meta', { zipBase64 }),
  extract: (zipBase64: string, folderName: string) => invokeTauri<ExtractionSummary>('fantome_extract', { zipBase64, folderName }),
}

export const creator = {
  listProjects: () => invokeTauri<ProjectSummary[]>('creator_list_projects'),
  createProject: (name: string, champion: string, author?: string) =>
    invokeTauri<CreatorProject>('creator_create_project', { name, champion, author: author ?? null }),
  getProject: (id: string) => invokeTauri<CreatorProject>('creator_get_project', { id }),
  saveProject: (project: CreatorProject) => invokeTauri<CreatorProject>('creator_save_project', { project }),
  duplicateProject: (id: string) => invokeTauri<CreatorProject>('creator_duplicate_project', { id }),
  deleteProject: (id: string) => invokeTauri<boolean>('creator_delete_project', { id }),
  addFile: (projectId: string, relativePath: string, dataBase64: string) =>
    invokeTauri<ProjectFile>('creator_add_file', { projectId, relativePath, dataBase64 }),
  removeFile: (projectId: string, relativePath: string) =>
    invokeTauri<boolean>('creator_remove_file', { projectId, relativePath }),
  exportFantome: (projectId: string) => invokeTauri<string>('creator_export_fantome', { projectId }),
  exportModpkg: (projectId: string) => invokeTauri<string>('creator_export_modpkg', { projectId }),
}

export const themes = {
  list: () => invokeTauri<ThemeConfig[]>('theme_list'),
  getActive: () => invokeTauri<ThemeConfig>('theme_get_active'),
  setActive: (id: string) => invokeTauri<ThemeConfig>('theme_set_active', { id }),
  saveCustom: (theme: ThemeConfig) => invokeTauri<ThemeConfig>('theme_save_custom', { theme }),
  savePreview: (preview: { schemaVersion: 1; name: string; canvas: string; panel: string; accent: string; font: 'manrope' | 'sora' }) =>
    invokeTauri<void>('theme_preview_save', { preview }),
  deleteCustom: (id: string) => invokeTauri<boolean>('theme_delete_custom', { id }),
  resetDefault: () => invokeTauri<ThemeConfig>('theme_reset_default'),
  saveMedia: (base64Data: string, mimeType: string) =>
    invokeTauri<string>('theme_save_media', { base64Data, mimeType }),
}

export const gamePath = {
  get: () => invokeTauri<GamePathConfig>('game_path_get'),
  set: (path: string) => invokeTauri<GamePathConfig>('game_path_set', { path }),
  detect: () => invokeTauri<string | null>('game_path_detect'),
  openExplorer: (path: string) => invokeTauri<boolean>('open_folder_in_explorer', { path }),
}

export const gameflow = {
  testLcu: (riotPort: number, riotToken: string) =>
    invokeTauri<LcuConnectionStatus>('lcu_test_connection', { riotPort, riotToken }),
  getPhase: (riotPort: number, riotToken: string) =>
    invokeTauri<string>('lcu_get_gameflow_phase', { riotPort, riotToken }),
  showMatchNotice: (championName: string, skinName: string, presetName?: string) =>
    invokeTauri<boolean>('match_notice_show', { championName, skinName, presetName: presetName ?? null }),
}

export const discord = {
  configure: (clientId: string) => invokeTauri<void>('discord_configure', { clientId }),
  setRpc: (enabled: boolean) => invokeTauri<boolean>('set_rpc_enabled', { enabled }),
  updateActivity: (state: string, details: string, champion?: string) => invokeTauri('update_activity', {
    activity: {state,details,champion:champion??null,partySize:null,partyMax:null,startTimestamp:Math.floor(Date.now()/1000)},
  }),
}

export const ai = {
  chat: (prompt: string, model?: string) => invokeTauri<AiResponse>('ai_chat', { prompt, model: model ?? null }),
  tts: (text: string, voiceId?: string) => invokeTauri<TtsResponse>('elevenlabs_tts', { text, voiceId: voiceId ?? null }),
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
