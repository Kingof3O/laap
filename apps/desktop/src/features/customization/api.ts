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
  tier: number | null
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
  accountId: string | null
  queueMode: string | null
  presetNames: string[]
  skinIds: string[]
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
  license?: string
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
  id: string; name: string; isBuiltin: boolean; canvas: string; panel: string; surface: string
  accent: string; accentHover: string; textPrimary: string; textSecondary: string; border: string
  fontFamily: string; opacity: number; backgroundMediaPath: string | null; backgroundMediaType: string | null
  animationSpeed: string; reducedMotion: boolean; performanceMode: boolean
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
  tokensUsed: number | null
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
    invokeTauri<CosmeticReference>('catalog_random_pick', { favoritesOnly: favoritesOnly ?? false, championId: null }),
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
  inspect: (zipBase64: string) => invokeTauri<FantomeInspectionReport>('fantome_inspect_package', { archiveBase64: zipBase64 }),
  repair: (zipBase64: string) => invokeTauri<FantomeRepairResult>('fantome_repair_package', { archiveBase64: zipBase64 }),
}

export const fantome = {
  detectFormat: (archiveBase64: string) => invokeTauri<string>('fantome_detect_format', { archiveBase64 }),
  listContents: (zipBase64: string) => invokeTauri<FantomeEntry[]>('fantome_list_contents', { zipBase64 }),
  readMeta: (zipBase64: string) => invokeTauri<FantomeMeta>('fantome_read_meta', { zipBase64 }),
  extract: (zipBase64: string, folderName: string) => invokeTauri<ExtractionSummary>('fantome_extract', { zipBase64, folderName }),
  inspect: (zipBase64: string) => invokeTauri<FantomeInspectionReport>('fantome_inspect_package', { archiveBase64: zipBase64 }),
  repair: (zipBase64: string) => invokeTauri<FantomeRepairResult>('fantome_repair_package', { archiveBase64: zipBase64 }),
}

export interface FantomeInspectionReport {
  isValid: boolean
  fileCount: number
  metaFound: boolean
  hasMesh: boolean
  hasTextures: boolean
  hasAnimations: boolean
  hasSkeleton: boolean
  warnings: string[]
  totalSizeBytes: number
  detectedFormat: string
  meta?: FantomeMeta | null
  issuesFound: string[]
}

export interface FantomeRepairResult {
  repaired: boolean
  actionsTaken: string[]
  repairedArchiveBase64?: string | null
}

export interface BinField {
  nameHash: number
  nameHashHex: string
  valueType: number
  typeName: string
  valueString: string
}

export interface BinEntry {
  classHash: number
  classHashHex: string
  nameHash: number
  nameHashHex: string
  fields: BinField[]
}

export interface BinInspectionReport {
  isValid: boolean
  version: number
  linkedFilesCount: number
  entriesCount: number
  totalFieldsCount: number
  classHashes: string[]
}

export const binTool = {
  inspect: (bytesBase64: string) => invokeTauri<BinInspectionReport>('bin_inspect', { binBase64: bytesBase64 }),
  convertToJson: (bytesBase64: string) => invokeTauri<string>('bin_convert_to_json', { binBase64: bytesBase64 }),
  convertFromJson: (jsonStr: string) => invokeTauri<string>('bin_convert_from_json', { jsonStr }),
}

export interface WadEntry {
  pathHash: number
  pathHashHex: string
  offset: number
  compressedSize: number
  uncompressedSize: number
  compressionType: number
  compressionName: string
  isDuplicate: boolean
}

export interface WadInspectionReport {
  isValid: boolean
  major: number
  minor: number
  entryCount: number
  entries: WadEntry[]
  totalUncompressedSize: number
  totalCompressedSize: number
}

export interface WadPackReport {
  success: boolean
  packedCount: number
  archiveBase64: string
  archiveSize: number
}

export const wadTool = {
  inspect: (archiveBase64: string) => invokeTauri<WadInspectionReport>('wad_inspect', { archiveBase64 }),
  extractLocal: (archiveBase64: string) => invokeTauri<{ extractedCount: number; outputDir: string }>('wad_extract_local', { archiveBase64 }),
  extractFiles: (archiveBase64: string, targetDir: string) =>
    invokeTauri<{ success: boolean; extractedCount: number; outputDir: string; extractedFiles: string[] }>('wad_extract_files', { archiveBase64, targetDir }),
  packFiles: (sourceDir: string) => invokeTauri<WadPackReport>('wad_pack_files', { sourceDir }),
}

export interface SurfaceConfig {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  cssOverrides: string
  assetUrl?: string
  opacity: number
  blurPx: number
}

export interface ClientSurfacesConfig {
  version: number
  globalEnabled: boolean
  adapterName: string
  surfaces: SurfaceConfig[]
}

export const clientSurfaces = {
  validate: (config: ClientSurfacesConfig) => invokeTauri<void>('client_surfaces_validate_config', { config }),
  getConfig: () => invokeTauri<ClientSurfacesConfig>('client_surfaces_get_config'),
  saveConfig: (config: ClientSurfacesConfig) => invokeTauri<void>('client_surfaces_save_config', { config }),
  resetDefaults: () => invokeTauri<ClientSurfacesConfig>('client_surfaces_reset_defaults'),
  exportSnippet: () => invokeTauri<string>('client_surfaces_export_snippet'),
  getAdapterStatus: () => invokeTauri<{ isAvailable: boolean; adapterType: string; activeSurfacesCount: number; message: string }>('client_surfaces_get_adapter_status'),
}

export const creator = {
  exportFile: (projectId: string, kind: 'project' | 'fantome' | 'modpkg') => invokeTauri<boolean>('creator_export_file', { projectId, kind }),
  importProject: (project: CreatorProject) => invokeTauri<CreatorProject>('creator_import_project', { project }),
  listProjects: () => invokeTauri<ProjectSummary[]>('creator_list_projects'),
  createProject: (name: string, champion: string, author?: string) =>
    invokeTauri<CreatorProject>('creator_create_project', { name, champion, author: author ?? '' }),
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
  exportFile: (theme: ThemeConfig) => invokeTauri<boolean>('theme_export_file', { theme }),
  importBundle: (json: string) => invokeTauri<ThemeConfig>('theme_import_bundle', { json }),
  list: () => invokeTauri<ThemeConfig[]>('theme_list'),
  getActive: () => invokeTauri<ThemeConfig>('theme_get_active'),
  setActive: (id: string) => invokeTauri<ThemeConfig>('theme_set_active', { id }),
  saveCustom: (theme: ThemeConfig) => invokeTauri<ThemeConfig>('theme_save_custom', { theme }),
  savePreview: (preview: { schemaVersion: 1; name: string; canvas: string; panel: string; accent: string; font: 'manrope' | 'sora' }) =>
    invokeTauri<void>('theme_preview_save', { preview }),
  deleteCustom: (id: string) => invokeTauri<boolean>('theme_delete_custom', { id }),
  resetDefault: () => invokeTauri<ThemeConfig>('theme_reset_default'),
  saveMedia: (dataBase64: string, name: string) => invokeTauri<string>('theme_save_media', { dataBase64, name }),
}

export const gamePath = {
  get: () => invokeTauri<string>('get_game_path'),
  set: (path: string) => invokeTauri<string>('set_game_path', { path }),
  openExplorer: (folderPath: string) => invokeTauri<boolean>('open_folder_in_explorer', { folderPath }),
}
export const gameflow = {
  testLcu: (consent: boolean) => invokeTauri<boolean>('lcu_test_connection', { consent }),
  getPhase: (consent: boolean) => invokeTauri<string>('lcu_get_gameflow_phase', { consent }),
}

export const discord = {
  status: () => invokeTauri<{ clientId: string | null; enabled: boolean; connected: boolean }>('discord_get_status'),
  configure: (clientId: string) => invokeTauri<void>('discord_configure', { clientId }),
  setRpc: (enabled: boolean) => invokeTauri<boolean>('set_rpc_enabled', { enabled }),
  updateActivity: (state: string, details: string, champion?: string) => invokeTauri('update_activity', {
    activity: {state,details,champion:champion??null,partySize:null,partyMax:null,startTimestamp:Math.floor(Date.now()/1000)},
  }),
}

export interface InGameRunnerConfig {
  autoMountEnabled: boolean
  customOverlayToolPath: string | null
  autoUnmountOnEnd: boolean
  pollIntervalMs: number
}

export interface RunnerEvent {
  timestamp: string
  eventType: string
  message: string
}

export interface ResolvedLoadout {
  championId: number
  championName: string
  skinOrModName: string
  source: string
  modHash: string | null
  fileCount: number
}

export interface InGameRunnerStatus {
  enabled: boolean
  phase: 'idle' | 'monitoring' | 'champSelect' | 'staging' | 'mounted' | 'unmounted' | 'error'
  clientConnected: boolean
  gameflowPhase: string | null
  detectedChampionId: number | null
  detectedChampionName: string | null
  resolvedLoadout: ResolvedLoadout | null
  mountActive: boolean
  activePid: number | null
  recentEvents: RunnerEvent[]
  errorMessage: string | null
}

export const inGameRunner = {
  getConfig: () => invokeTauri<InGameRunnerConfig>('in_game_runner_get_config'),
  saveConfig: (config: InGameRunnerConfig) => invokeTauri<InGameRunnerConfig>('in_game_runner_save_config', { config }),
  getStatus: () => invokeTauri<InGameRunnerStatus>('in_game_runner_get_status'),
  setEnabled: (enabled: boolean) => invokeTauri<boolean>('in_game_runner_set_enabled', { enabled }),
  pollNow: () => invokeTauri<InGameRunnerStatus>('in_game_runner_poll_now'),
  clearLogs: () => invokeTauri<boolean>('in_game_runner_clear_logs'),
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
