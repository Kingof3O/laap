import { test, expect } from '@playwright/test'

test('StudioSettings, ModLibrary, and ClientStatusPage wire external game adapter lifecycle end-to-end', async ({ page }) => {
  const customModHash = 'a'.repeat(64)
  const failedModHash = 'b'.repeat(64)
  const paidModHash = 'c'.repeat(64)

  let adapterConfig = {
    adapterPath: null as string | null,
    expectedSha256: null as string | null,
    userConsentGranted: false,
    clearanceAcknowledged: false,
    autoApplyInChampSelect: false,
    lastVerifiedSha256: null as string | null,
    lastVerifiedVersion: null as string | null,
  }

  let leaguePath = 'C:\\Riot Games\\League of Legends'
  let detectedBuild = '14.18.612.44'
  let appliedInGame = false
  let activeModHash: string | null = null
  let autoApplyMods = false
  let monitorEnabled = false
  let champSource: 'ModLibrary' | 'Preset' = 'ModLibrary'

  let runtimeEntries = [
    {
      sha256: customModHash,
      state: 'safe-to-store',
      detail: 'Safe in library.',
      updatedAt: null as number | null,
    },
    {
      sha256: failedModHash,
      state: 'failed',
      detail: 'Candidate failed validation.',
      updatedAt: 1700000000,
    },
    {
      sha256: paidModHash,
      state: 'incompatible',
      detail: 'Excluded by feature-policy.json.',
      updatedAt: null as number | null,
    },
  ]

  function currentProbe() {
    if (!adapterConfig.adapterPath) {
      return {
        state: 'notInstalled',
        available: false,
        compatible: false,
        appliedInGame: false,
        busy: false,
        discoverySource: null,
        binaryPath: null,
        binarySha256: null,
        version: null,
        supportedGameBuilds: [],
        supportedFormats: [],
        leagueInstall: {
          leaguePath,
          gameDir: `${leaguePath}\\Game`,
          gameExePath: `${leaguePath}\\Game\\League of Legends.exe`,
          detectedBuild,
          isDetected: true,
          source: 'custom',
          validationError: null,
        },
        activeMods: [],
        activeMatchRunning: false,
        consentGranted: adapterConfig.userConsentGranted,
        clearanceAcknowledged: adapterConfig.clearanceAcknowledged,
        autoApplyInChampSelect: autoApplyMods,
        detail: 'No user-installed external game mod adapter CLI configured.',
        documentedSubcommands: ['get_version', 'get_supported_game_build', 'validate_candidate', 'stage_candidate', 'activate_staged', 'status', 'stop', 'restore_defaults'],
        checkedAt: 1700000000,
      }
    }

    const compatible = detectedBuild.startsWith('14.18')
    const consented = adapterConfig.userConsentGranted && adapterConfig.clearanceAcknowledged
    const state = !compatible
      ? 'unsupportedGameBuild'
      : appliedInGame
        ? 'applied'
        : consented
          ? 'compatible'
          : 'blockedByPolicy'

    return {
      state,
      available: compatible,
      compatible,
      appliedInGame,
      busy: false,
      discoverySource: 'configured',
      binaryPath: adapterConfig.adapterPath,
      binarySha256: 'deadbeef'.repeat(8),
      version: '2.4.0',
      supportedGameBuilds: ['14.18.*'],
      supportedFormats: ['fantome', 'modpkg', 'zip'],
      leagueInstall: {
        leaguePath,
        gameDir: `${leaguePath}\\Game`,
        gameExePath: `${leaguePath}\\Game\\League of Legends.exe`,
        detectedBuild,
        isDetected: true,
        source: 'custom',
        validationError: null,
      },
      activeMods: activeModHash ? [activeModHash] : [],
      activeMatchRunning: false,
      consentGranted: adapterConfig.userConsentGranted,
      clearanceAcknowledged: adapterConfig.clearanceAcknowledged,
      autoApplyInChampSelect: autoApplyMods,
      detail: compatible
        ? `Adapter 2.4.0 verified for League build ${detectedBuild}.`
        : `League build ${detectedBuild} is outside supported builds [14.18.*].`,
      documentedSubcommands: ['get_version', 'get_supported_game_build', 'validate_candidate', 'stage_candidate', 'activate_staged', 'status', 'stop', 'restore_defaults'],
      checkedAt: 1700000000,
    }
  }

  await page.exposeFunction('adapterNative', async (command: string, args: any) => {
    if (command === 'plugin:event|listen') return 1
    if (command === 'window_is_maximized') return false
    if (command === 'catalog_list') return { version: '14.18.1', locale: 'en_US', data: [], cached: true }
    if (command === 'customization_preset_list' || command === 'creator_list_projects') return []
    if (command === 'discord_get_status') return { enabled: false, clientId: null, connected: false, statusText: 'Disabled' }
    if (command === 'provider_list_statuses') return []
    if (command === 'get_game_install_info') return currentProbe().leagueInstall
    if (command === 'set_game_path') {
      leaguePath = args.path
      return leaguePath
    }
    if (command === 'clear_game_path') return currentProbe().leagueInstall

    if (command === 'game_adapter_get_config') return adapterConfig
    if (command === 'game_adapter_save_config') {
      adapterConfig = { ...adapterConfig, ...args.config }
      if (adapterConfig.adapterPath && adapterConfig.userConsentGranted && adapterConfig.clearanceAcknowledged) {
        runtimeEntries = runtimeEntries.map((entry) =>
          entry.sha256 === customModHash ? { ...entry, state: 'adapter-ready', detail: 'Ready for adapter validation.' } : entry,
        )
      }
      return adapterConfig
    }
    if (command === 'game_adapter_pick_executable') return 'C:\\Tools\\league-mod-adapter.exe'
    if (command === 'game_adapter_probe') return currentProbe()
    if (command === 'game_adapter_get_mod_states') return runtimeEntries
    if (command === 'game_adapter_validate_mod') {
      runtimeEntries = runtimeEntries.map((entry) =>
        entry.sha256 === args.sha256
          ? { ...entry, state: 'adapter-ready', detail: 'Validated against external adapter 2.4.0 for build 14.18.612.44.' }
          : entry,
      )
      return runtimeEntries.find((e) => e.sha256 === args.sha256)
    }
    if (command === 'game_adapter_restore_defaults') {
      appliedInGame = false
      activeModHash = null
      runtimeEntries = runtimeEntries.map((entry) =>
        entry.state === 'applied' ? { ...entry, state: 'safe-to-store', detail: 'Restored defaults.' } : entry,
      )
      return {
        state: 'compatible',
        restoredInGame: true,
        deferredReason: null,
        message: 'Stopped adapter and restored League defaults cleanly.',
      }
    }

    if (command === 'mod_list') {
      return [
        {
          archiveBytes: 20480,
          enabled: true,
          priority: 10,
          format: 'fantome',
          manifest: {
            modId: 'custom-ahri',
            displayName: 'Custom Ahri Outfit',
            version: '1.0.0',
            author: 'Original creator',
            license: 'CC-BY-4.0',
            sha256: customModHash,
            containsPaidRiotContent: false,
            files: [{ relativePath: 'DATA/Characters/Ahri/Custom.dds', sha256: customModHash, sizeBytes: 1024 }],
          },
        },
        {
          archiveBytes: 8192,
          enabled: false,
          priority: 5,
          format: 'modpkg',
          manifest: {
            modId: 'broken-lux',
            displayName: 'Broken Lux Test',
            version: '1.0.0',
            author: 'Original creator',
            license: 'CC-BY-4.0',
            sha256: failedModHash,
            containsPaidRiotContent: false,
            files: [],
          },
        },
        {
          archiveBytes: 4096,
          enabled: false,
          priority: 1,
          format: 'zip',
          manifest: {
            modId: 'excluded-paid',
            displayName: 'Excluded Paid Skin',
            version: '1.0.0',
            author: 'Unknown',
            license: 'All rights reserved',
            sha256: paidModHash,
            containsPaidRiotContent: true,
            files: [],
          },
        },
      ]
    }
    if (command === 'mod_detect_conflicts') return { hasConflicts: false, conflicts: [] }
    if (command === 'mod_apply_single' || command === 'mod_stage_overlay') {
      appliedInGame = true
      activeModHash = args?.sha256 ?? customModHash
      runtimeEntries = runtimeEntries.map((entry) =>
        entry.sha256 === activeModHash
          ? { ...entry, state: 'applied', detail: 'Activated via external adapter 2.4.0.' }
          : entry,
      )
      return {
        stagedModsCount: 1,
        stagedFilesCount: 1,
        skippedOrFailedMods: [],
        stagingDirectory: 'C:\\Temp\\staging',
        gameOverlayDirectory: leaguePath,
        backupManifestPath: null,
        message: 'Staged 1 file(s) in LAAP sandbox and Activated 1 custom mod(s) for League build 14.18.612.44 via external adapter 2.4.0.',
        adapterState: 'applied',
        appliedInGame: true,
        deferredReason: null,
      }
    }
    if (command === 'mod_rollback' || command === 'in_game_runner_restore_defaults') {
      appliedInGame = false
      activeModHash = null
      runtimeEntries = runtimeEntries.map((entry) =>
        entry.state === 'applied' ? { ...entry, state: 'adapter-ready', detail: 'Restored defaults.' } : entry,
      )
      return {
        restoredFilesCount: 1,
        stagingCleaned: true,
        gameOverlayCleaned: true,
        message: 'Removed 1 LAAP-owned staged file(s). Stopped adapter and restored League defaults cleanly.',
        adapterState: 'compatible',
        deferredReason: null,
      }
    }

    if (command === 'gameflow_status') return { connected: true, phase: 'ChampSelect' }
    if (command === 'in_game_runner_get_config') {
      return { monitorEnabled, pollIntervalMs: 2000, autoApplyMods }
    }
    if (command === 'in_game_runner_save_config') {
      monitorEnabled = args.config.monitorEnabled
      autoApplyMods = Boolean(args.config.autoApplyMods)
      return { monitorEnabled, pollIntervalMs: 2000, autoApplyMods }
    }
    if (command === 'in_game_runner_set_enabled') {
      monitorEnabled = Boolean(args.enabled)
      return monitorEnabled
    }
    if (command === 'in_game_runner_poll_now' || command === 'in_game_runner_get_status') {
      const probe = currentProbe()
      return {
        enabled: monitorEnabled,
        phase: 'champSelect',
        clientConnected: true,
        gameflowPhase: 'ChampSelect',
        detectedChampionId: 103,
        detectedChampionName: 'Ahri',
        resolvedLoadout: champSource === 'ModLibrary'
          ? {
              championId: 103,
              championName: 'Ahri',
              skinOrModName: 'Custom Ahri Outfit',
              source: 'ModLibrary',
              modHash: customModHash,
              fileCount: 1,
              appliedInGame,
              limitation: appliedInGame ? 'Activated via external adapter.' : 'Ready via verified external adapter.',
            }
          : {
              championId: 103,
              championName: 'Ahri',
              skinOrModName: 'Preset Metadata Only',
              source: 'Preset',
              modHash: null,
              fileCount: 0,
              appliedInGame: false,
              limitation: 'Preview metadata only.',
            },
        adapterAvailable: probe.available,
        adapterStatus: `${probe.state} (${probe.detail})`,
        adapterState: probe.state,
        adapterVersion: probe.version,
        detectedGameBuild: probe.leagueInstall.detectedBuild,
        matchApplyStatus: appliedInGame ? 'applied' : 'ready',
        activeAppliedModHash: activeModHash,
        autoApplyMods,
        consentGranted: probe.consentGranted && probe.clearanceAcknowledged,
        recentEvents: [],
        errorMessage: null,
      }
    }
    if (command === 'in_game_runner_apply_matched_mod') {
      appliedInGame = true
      activeModHash = customModHash
      return {
        stagedModsCount: 1,
        stagedFilesCount: 1,
        skippedOrFailedMods: [],
        stagingDirectory: 'C:\\Temp\\staging',
        gameOverlayDirectory: leaguePath,
        backupManifestPath: null,
        message: 'Activated Custom Ahri Outfit via external adapter 2.4.0.',
        adapterState: 'applied',
        appliedInGame: true,
        deferredReason: null,
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
      invoke: (command: string, args: any) => (window as any).adapterNative(command, args),
    }
  })

  await page.goto('/')

  // 1. StudioSettings: configure external adapter & explicit consent/clearance
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Advanced' }).click()

  await expect(page.getByTestId('studio-adapter-state-badge')).toHaveText('Not Installed')
  await expect(page.getByTestId('studio-league-build')).toHaveText('14.18.612.44')

  await page.getByLabel('External adapter executable path').fill('C:\\Tools\\league-mod-adapter.exe')
  await page.getByRole('button', { name: 'Save & Verify Adapter' }).click()
  await expect(page.getByTestId('studio-adapter-state-badge')).toHaveText('Opt-in / Policy Confirmation Required')

  await page.getByRole('checkbox', { name: /Enable external custom mod adapter integration/i }).check()
  await page.getByRole('checkbox', { name: /Riot \/ Vanguard compliance responsibility/i }).check()
  await expect(page.getByTestId('studio-adapter-state-badge')).toHaveText('Compatible')
  await expect(page.getByTestId('studio-adapter-verification-summary')).toContainText('2.4.0')
  await expect(page.getByTestId('studio-adapter-verification-summary')).toContainText('Source: configured')

  // Verify unsupported build surface cleanly
  detectedBuild = '14.20.999.1'
  await page.getByRole('button', { name: 'Save & Verify Adapter' }).click()
  await expect(page.getByTestId('studio-adapter-state-badge')).toHaveText('Unsupported Game Build')

  // Restore compatible build
  detectedBuild = '14.18.612.44'
  await page.getByRole('button', { name: 'Save & Verify Adapter' }).click()
  await expect(page.getByTestId('studio-adapter-state-badge')).toHaveText('Compatible')

  // Return to workspace
  await page.getByRole('button', { name: 'Settings', exact: true }).click()

  // 2. ModLibrary: render per-mod runtime states and wire Validate / Apply / Rollback
  await page.getByRole('button', { name: 'Mod library', exact: true }).click()
  await expect(page.getByTestId('modlib-adapter-badge')).toHaveText('Compatible')
  await expect(page.getByTestId(`mod-runtime-badge-${customModHash}`)).toHaveText('Adapter Ready')
  await expect(page.getByTestId(`mod-runtime-badge-${failedModHash}`)).toHaveText('Failed')
  await expect(page.getByTestId(`mod-runtime-badge-${paidModHash}`)).toHaveText('Incompatible')

  await page.getByRole('button', { name: 'Apply Enabled Mods' }).click()
  await expect(page.getByTestId(`mod-runtime-badge-${customModHash}`)).toHaveText('Applied')
  await expect(page.getByRole('status')).toContainText('Activated 1 custom mod(s)')

  await page.getByRole('button', { name: 'Rollback & Restore Defaults' }).click()
  await expect(page.getByTestId(`mod-runtime-badge-${customModHash}`)).toHaveText('Adapter Ready')

  // 3. ClientStatusPage: live adapter compatibility, match apply status, opt-in controls
  await page.getByRole('button', { name: 'Client', exact: true }).click()
  await page.getByRole('checkbox', { name: /Allow read-only access to my running League client/i }).check()
  await page.getByRole('button', { name: 'Read client status' }).click()

  await expect(page.getByTestId('client-adapter-status-label')).toContainText('Compatible')
  await expect(page.getByTestId('client-match-apply-status')).toHaveText('ready')

  await page.getByRole('checkbox', { name: /Opt-in: auto-apply matching custom/i }).check()
  await page.getByRole('button', { name: 'Apply Matched Mod' }).click()
  await expect(page.getByTestId('client-match-apply-status')).toHaveText('applied')
  await expect(page.getByTestId('client-adapter-status-label')).toContainText('Applied in Game')

  await page.getByRole('button', { name: 'Stop & Restore Defaults' }).click()
  await expect(page.getByTestId('client-match-apply-status')).toHaveText('ready')
})

test('ModLibrary renders deferred state and ClientStatusPage disables Apply Matched Mod for Presets', async ({ page }) => {
  const customModHash = 'd'.repeat(64)

  await page.exposeFunction('presetNative', async (command: string) => {
    if (command === 'plugin:event|listen') return 1
    if (command === 'window_is_maximized') return false
    if (command === 'catalog_list') return { version: '14.18.1', locale: 'en_US', data: [], cached: true }
    if (command === 'customization_preset_list' || command === 'creator_list_projects') return []
    if (command === 'game_adapter_probe') {
      return {
        state: 'deferred',
        available: true,
        compatible: true,
        appliedInGame: false,
        busy: false,
        discoverySource: 'configured',
        binaryPath: 'C:\\Tools\\league-mod-adapter.exe',
        binarySha256: 'deadbeef'.repeat(8),
        version: '2.4.0',
        supportedGameBuilds: ['14.18.*'],
        supportedFormats: ['fantome', 'modpkg', 'zip'],
        leagueInstall: {
          leaguePath: 'C:\\Riot Games\\League of Legends',
          gameDir: 'C:\\Riot Games\\League of Legends\\Game',
          gameExePath: 'C:\\Riot Games\\League of Legends\\Game\\League of Legends.exe',
          detectedBuild: '14.18.612.44',
          isDetected: true,
          source: 'custom',
          validationError: null,
        },
        activeMods: [],
        activeMatchRunning: true,
        consentGranted: true,
        clearanceAcknowledged: true,
        autoApplyInChampSelect: false,
        detail: 'Active match in progress; adapter operations deferred.',
        documentedSubcommands: ['get_version', 'get_supported_game_build', 'validate_candidate', 'stage_candidate', 'activate_staged', 'status', 'stop', 'restore_defaults'],
        checkedAt: 1700000000,
      }
    }
    if (command === 'game_adapter_get_config') {
      return {
        adapterPath: 'C:\\Tools\\league-mod-adapter.exe',
        expectedSha256: null,
        userConsentGranted: true,
        clearanceAcknowledged: true,
        autoApplyInChampSelect: false,
      }
    }
    if (command === 'game_adapter_get_mod_states') {
      return [
        {
          sha256: customModHash,
          state: 'deferred',
          detail: 'Active League match detected; deferred until Lobby or EndOfGame.',
          updatedAt: 1700000000,
        },
      ]
    }
    if (command === 'mod_list') {
      return [
        {
          archiveBytes: 2048,
          enabled: true,
          priority: 1,
          format: 'fantome',
          manifest: {
            modId: 'deferred-mod',
            displayName: 'Deferred Custom Mod',
            version: '1.0.0',
            author: 'Creator',
            license: 'CC-BY-4.0',
            sha256: customModHash,
            containsPaidRiotContent: false,
            files: [],
          },
        },
      ]
    }
    if (command === 'mod_detect_conflicts') return { hasConflicts: false, conflicts: [] }
    if (command === 'gameflow_status') return { connected: true, phase: 'ChampSelect' }
    if (command === 'in_game_runner_get_config') {
      return { monitorEnabled: false, pollIntervalMs: 2000, autoApplyMods: false }
    }
    if (command === 'in_game_runner_poll_now' || command === 'in_game_runner_get_status') {
      return {
        enabled: false,
        phase: 'champSelect',
        clientConnected: true,
        gameflowPhase: 'ChampSelect',
        detectedChampionId: 103,
        detectedChampionName: 'Ahri',
        resolvedLoadout: {
          championId: 103,
          championName: 'Ahri',
          skinOrModName: 'Catalog Preset Entry',
          source: 'Preset',
          modHash: null,
          fileCount: 0,
          appliedInGame: false,
          limitation: 'Preview metadata only.',
        },
        adapterAvailable: true,
        adapterStatus: 'Deferred (Active match in progress)',
        adapterState: 'deferred',
        adapterVersion: '2.4.0',
        detectedGameBuild: '14.18.612.44',
        matchApplyStatus: 'preset-excluded',
        activeAppliedModHash: null,
        autoApplyMods: false,
        consentGranted: true,
        recentEvents: [],
        errorMessage: null,
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
      invoke: (command: string, args: any) => (window as any).presetNative(command, args),
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Mod library', exact: true }).click()
  await expect(page.getByTestId('modlib-adapter-badge')).toHaveText('Deferred (Match Active)')
  await expect(page.getByTestId(`mod-runtime-badge-${customModHash}`)).toHaveText('Deferred')

  await page.getByRole('button', { name: 'Client', exact: true }).click()
  await page.getByRole('checkbox', { name: /Allow read-only access to my running League client/i }).check()
  await page.getByRole('button', { name: 'Read client status' }).click()
  await expect(page.getByTestId('client-match-apply-status')).toHaveText('preset-excluded')
  await expect(page.getByRole('button', { name: 'Apply Matched Mod' })).toBeDisabled()
})
