import { test, expect } from '@playwright/test'

function baseCommonMocks(command: string) {
  if (command === 'mod_list' || command === 'customization_preset_list') return []
  if (command === 'catalog_list') return { version: '16.22.1', locale: 'en_US', data: [], cached: true }
  if (command === 'plugin:event|listen') return 1
  if (command === 'game_adapter_probe') {
    return {
      available: false,
      state: 'not-installed',
      adapterPath: null,
      adapterVersion: null,
      detectedGameBuild: null,
      detail: 'No external runtime adapter installed.',
    }
  }
  if (command === 'game_adapter_get_config') {
    return { enabled: false, executablePath: null, customArgs: [], detectedVersion: null, detectedGameBuild: null, lastProbeOk: false, lastError: null }
  }
  if (command === 'game_adapter_get_mod_states') return []
  if (command === 'mod_detect_conflicts') return []
  return undefined
}

test('ClientSurfaces companion bridge enforces consent gate and updates status truthfully', async ({ page }) => {
  let bridgeState: any = {
    running: false,
    enabled: false,
    port: 0,
    bridgeUrl: null,
    wsUrl: null,
    protocolVersion: 1,
    tokenPreview: '1234abcd…5678',
    activeClients: 0,
    lastHandshake: null,
    pluginInstalled: false,
    pluginVerified: false,
    pluginDir: null,
    customPluginsDir: null,
    pluginConsentGranted: false,
    pengu: {
      platformSupported: true,
      penguDetected: false,
      detectedPluginsDir: null,
      effectivePluginsDir: null,
      detail: 'Select your Pengu Loader plugins folder manually.',
    },
    capabilities: ['hello', 'get_state', 'select_custom_mod', 'restore_defaults'],
    message: 'Loopback companion bridge is stopped.',
  }

  const surfacesCfg = {
    version: 1,
    globalEnabled: true,
    adapterName: 'laap-companion-bridge',
    surfaces: [
      {
        id: 'champ-select',
        name: 'Champion Select',
        description: 'Lobby surface',
        category: 'Gameplay',
        enabled: true,
        cssOverrides: '',
        opacity: 0.9,
        blurPx: 8,
      },
    ],
  }

  await page.exposeFunction('bridgeUiMock', (command: string, args: any) => {
    const common = baseCommonMocks(command)
    if (common !== undefined) return common
    if (command === 'client_surfaces_get_config') return surfacesCfg
    if (command === 'client_surfaces_get_adapter_status') {
      const ready = bridgeState.running && bridgeState.pluginInstalled
      return {
        isAvailable: ready,
        adapterType: 'laap-companion-bridge',
        activeSurfacesCount: 1,
        message: ready
          ? 'Loopback companion bridge active (Pengu laap-companion installed).'
          : 'Configuration only · Companion bridge offline.',
      }
    }
    if (command === 'client_bridge_get_status') return bridgeState
    if (command === 'client_bridge_start') {
      bridgeState = {
        ...bridgeState,
        running: true,
        enabled: true,
        port: 47120,
        bridgeUrl: 'http://127.0.0.1:47120',
        wsUrl: 'ws://127.0.0.1:47120/v1/ws',
        message: 'Loopback bridge listening on http://127.0.0.1:47120.',
      }
      return bridgeState
    }
    if (command === 'client_bridge_rotate_token') {
      bridgeState = { ...bridgeState, tokenPreview: 'ff99ee88…1122' }
      return bridgeState
    }
    if (command === 'client_bridge_set_plugins_dir') {
      bridgeState = {
        ...bridgeState,
        customPluginsDir: args.pluginsDir,
        pengu: {
          ...bridgeState.pengu,
          effectivePluginsDir: args.pluginsDir,
        },
        message: 'Saved Pengu Loader plugins directory.',
      }
      return bridgeState
    }
    if (command === 'client_bridge_set_consent') {
      bridgeState = { ...bridgeState, pluginConsentGranted: Boolean(args.granted) }
      return bridgeState
    }
    if (command === 'client_bridge_install_plugin') {
      if (!bridgeState.pluginConsentGranted) {
        throw Error('User consent required before installing laap-companion.')
      }
      bridgeState = {
        ...bridgeState,
        pluginInstalled: true,
        pluginVerified: true,
        pluginDir: `${args.pluginsDir || bridgeState.customPluginsDir}/laap-companion`,
        message: 'Installed reversible laap-companion plugin.',
      }
      return bridgeState
    }
    if (command === 'client_bridge_uninstall_plugin') {
      bridgeState = {
        ...bridgeState,
        pluginInstalled: false,
        pluginVerified: false,
        pluginDir: null,
        message: 'Uninstalled laap-companion plugin files safely.',
      }
      return bridgeState
    }
    return null
  })

  await page.addInitScript(() => {
    localStorage.setItem('laap_auto_check_updates', 'false')
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: (command: string, args: any) => (window as any).bridgeUiMock(command, args),
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Client surfaces', exact: true }).click()

  await expect(page.getByText('Configuration only · Integration unavailable')).toBeVisible()
  const card = page.getByTestId('companion-bridge-card')
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Start Loopback Bridge' }).click()
  await expect(card).toContainText('http://127.0.0.1:47120')

  await card.getByRole('button', { name: 'Rotate Bearer Token' }).click()
  await expect(card).toContainText('ff99ee88…1122')

  await card.getByRole('textbox', { name: 'Pengu Loader plugins directory' }).fill('C:/PenguLoader/plugins')
  await card.getByRole('button', { name: 'Save Folder' }).click()

  const installBtn = card.getByRole('button', { name: 'Install Companion Plugin' })
  await expect(installBtn).toBeDisabled()
  await card.getByRole('checkbox', { name: /I authorize LAAP/ }).check()
  await expect(installBtn).toBeEnabled()
  await installBtn.click()

  await expect(card).toContainText('Installed & receipt-verified')
  await expect(page.getByText('Bridge Active · Companion plugin ready')).toBeVisible()

  await card.getByRole('button', { name: 'Uninstall Companion Plugin' }).click()
  await expect(card).toContainText('Not installed')
  await expect(page.getByText('Configuration only · Integration unavailable')).toBeVisible()
})

test('CreatorWorkshop local WAD scanner inspects disk archives and imports selected assets to Creator Project', async ({ page }) => {
  const createdProjects: any[] = []
  let activeProj: any = null

  await page.exposeFunction('wadMock', (command: string, args: any) => {
    const common = baseCommonMocks(command)
    if (common !== undefined) return common
    if (command === 'creator_list_projects') return createdProjects
    if (command === 'creator_get_project') return activeProj
    if (command === 'wad_get_hash_dictionary_status') {
      return {
        installed: true,
        entryCount: 4200,
        path: 'C:/laap/wad_hashes/hashes.game.txt',
        fileSizeBytes: 102400,
        detail: 'Loaded 4200 path hashes from local dictionary.',
      }
    }
    if (command === 'wad_list_game_archives') {
      return [
        {
          relativePath: 'Champions/Ahri.wad.client',
          fileName: 'Ahri.wad.client',
          category: 'Champions',
          championHint: 'Ahri',
          sizeBytes: 42 * 1024 * 1024,
        },
      ]
    }
    if (command === 'wad_inspect_game_archive') {
      expect(args.relativePath).toBe('Champions/Ahri.wad.client')
      return {
        isValid: true,
        major: 3,
        minor: 4,
        entryCount: 1,
        totalUncompressedSize: 4096,
        totalCompressedSize: 2048,
        sourceLabel: 'Champions/Ahri.wad.client',
        resolvedCount: 1,
        entries: [
          {
            pathHash: 123456789,
            pathHashHex: '0x00000000075bcd15',
            offset: 304,
            compressedSize: 2048,
            uncompressedSize: 4096,
            compressionType: 3,
            compressionName: 'Zstd',
            isDuplicate: false,
            resolvedPath: 'assets/characters/ahri/skins/base/ahri.skn',
          },
        ],
      }
    }
    if (command === 'wad_extract_entries') {
      expect(args.sourceKind).toBe('game')
      expect(args.destinationMode).toBe('creatorProject')
      expect(args.selectedHashes).toEqual(['0x00000000075bcd15'])
      activeProj = {
        id: 'proj-ahri-local',
        name: args.projectName || 'Ahri Local WAD',
        author: 'LAAP Local Extractor',
        version: '1.0.0',
        description: 'Extracted locally from verified game WAD assets.',
        champion: args.champion || 'Ahri',
        skinNum: 0,
        tags: ['local-wad'],
        files: [
          {
            relativePath: 'assets/characters/ahri/skins/base/ahri.skn',
            sizeBytes: 4096,
            sha256: 'b'.repeat(64),
            formatType: 'Mesh / Model',
            dataBase64: 'AAAA',
          },
        ],
        createdAt: '2026-11-13',
        updatedAt: '2026-11-13',
      }
      createdProjects.push({ ...activeProj, fileCount: 1 })
      return {
        success: true,
        extractedCount: 1,
        outputDir: '',
        extractedFiles: ['assets/characters/ahri/skins/base/ahri.skn'],
        projectId: activeProj.id,
        projectName: activeProj.name,
      }
    }
    return null
  })

  await page.addInitScript(() => {
    localStorage.setItem('laap_auto_check_updates', 'false')
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: (command: string, args: any) => (window as any).wadMock(command, args),
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Creator', exact: true }).click()
  await page.getByRole('button', { name: 'WAD Inspector', exact: true }).click()

  await expect(page.getByText('Loaded 4200 path hashes from local dictionary.')).toBeVisible()
  await page.getByRole('button', { name: 'Scan Game WAD Folder' }).click()
  await page.getByRole('button', { name: /Ahri.*Champions/ }).click()

  await expect(page.getByText('assets/characters/ahri/skins/base/ahri.skn')).toBeVisible()
  await page.getByLabel('Select assets/characters/ahri/skins/base/ahri.skn').check()
  await page.getByLabel('Destination project name').fill('Ahri Skin Extract')
  await page.getByRole('button', { name: /Import Selected \(1\) to Creator Project/ }).click()

  await expect(page.getByText('Ahri Skin Extract')).toBeVisible()
  await expect(page.getByText('assets/characters/ahri/skins/base/ahri.skn')).toBeVisible()
})

test('ModLibrary shows inline Fantome repair action for archives with structural issues', async ({ page }) => {
  let repairedCalled = false
  await page.exposeFunction('repairInlineMock', (command: string, args: any) => {
    const common = baseCommonMocks(command)
    if (common !== undefined) return common
    if (command === 'fantome_detect_format') return 'fantome'
    if (command === 'fantome_inspect_package') {
      if (args.archiveBase64 === 'UEsBAQID') {
        return {
          isValid: true,
          fileCount: 1,
          metaFound: true,
          hasMesh: true,
          hasTextures: false,
          hasAnimations: false,
          hasSkeleton: false,
          warnings: [],
          totalSizeBytes: 512,
          detectedFormat: 'fantome',
          issuesFound: [],
        }
      }
      return {
        isValid: false,
        fileCount: 1,
        metaFound: false,
        hasMesh: true,
        hasTextures: false,
        hasAnimations: false,
        hasSkeleton: false,
        warnings: ['Uppercase asset path detected'],
        totalSizeBytes: 512,
        detectedFormat: 'fantome',
        issuesFound: ['Missing META/info.json casing normalization'],
      }
    }
    if (command === 'fantome_repair_package') {
      repairedCalled = true
      return {
        repaired: true,
        actionsTaken: ['Generated default META/info.json', 'Lowercased WAD paths'],
        repairedArchiveBase64: 'UEsBAQID',
      }
    }
    if (command === 'fantome_list_contents') {
      return [{ relativePath: 'META/info.json', sizeBytes: 128, formatType: 'Metadata' }]
    }
    if (command === 'fantome_read_meta') {
      if (!repairedCalled) throw Error('Missing META/info.json')
      return { name: 'Repaired Mod', author: 'Creator', version: '1.0.0', license: 'CC0-1.0' }
    }
    return null
  })

  await page.addInitScript(() => {
    localStorage.setItem('laap_auto_check_updates', 'false')
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: (command: string, args: any) => (window as any).repairInlineMock(command, args),
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Mod library', exact: true }).click()

  await page.locator('input[type=file]').first().setInputFiles({
    name: 'broken.fantome',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK\x03\x04'),
  })

  const banner = page.getByTestId('mod-inline-repair-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Missing META/info.json casing normalization')

  await banner.getByRole('button', { name: 'Repair & Normalize Archive' }).click()
  await expect(banner).toBeHidden()
  await expect(page.getByLabel('Package name')).toHaveValue('Repaired Mod')
})
