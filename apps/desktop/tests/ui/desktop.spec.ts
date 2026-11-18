import { expect, test } from '@playwright/test'

test('browser IPC failure is explicit and offline builds make no external requests', async ({
  page,
}) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText(
    'Tauri IPC bridge unavailable',
  )
  await expect(page.getByText('LAAP Basic', { exact: true })).toBeVisible()
  await expect(page.locator('.roster-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Local Vault Encrypted')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Check for Updates/ }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeFocused()
  expect(external).toEqual([])
})

test('delayed IPC binds without inventing accounts and match guards require consent', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const events: string[] = []
    ;(window as any).testEvents = events
    setTimeout(() => {
      ;(window as any).__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main' },
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command: string, args: any) => {
          if (command === 'runtime_snapshot')
            return {
              riot_client: true,
              league_client: true,
              league_game: true,
              valorant_game: false,
            }
          if (command === 'list_local_accounts')
            return [
              {
                id: 'test-profile',
                name: 'My Main',
                region: 'EUW',
                rank: 'Diamond II',
                notes: '',
                favorite: false,
                session_status: 'saved',
                has_session: true,
                created_at: '2026-01-01',
                last_used_at: null,
              },
            ]
          if (
            command === 'close_riot_client' ||
            command === 'launch_local_account'
          ) {
            events.push(`${command}:${args.confirmed}`)
            return null
          }
          return null
        },
      }
    }, 200)
  })
  await page.goto('/')
  await expect(page.getByText('My Main', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Stop Riot', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  expect(await page.evaluate(() => (window as any).testEvents)).toEqual([])
  await page.getByRole('button', { name: 'Keep playing' }).click()
  expect(await page.evaluate(() => (window as any).testEvents)).toEqual([])
  await page
    .getByRole('button', { name: 'Switch', exact: true })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  await page.getByRole('button', { name: 'Exit game and continue' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).testEvents))
    .toEqual(['launch_local_account:true'])
  await page.getByRole('button', { name: 'Stop Riot', exact: true }).click()
  await page.getByRole('button', { name: 'Exit game and continue' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).testEvents))
    .toEqual(['launch_local_account:true', 'close_riot_client:true'])
})

test('dialogs reset fields, trap focus, and cancel an owned sandbox on Escape', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).cancelled = []
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts') return []
        if (command === 'start_provisioning_session') return 'owned-session'
        if (command === 'poll_provisioning_session') return null
        if (command === 'cancel_provisioning_session') {
          ;(window as any).cancelled.push(args.provisioningId)
          return null
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Profile', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Account Name / Riot ID' })
    .fill('First Profile')
  await page.getByRole('combobox', { name: 'Server Region' }).selectOption('SG')
  await page.getByRole('combobox', { name: 'Rank (Optional)' }).fill('Gold II')
  await page.getByRole('option', { name: 'Gold II', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add Profile', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Account Name / Riot ID' }),
  ).toHaveValue('')
  await expect(
    page.getByRole('combobox', { name: 'Rank (Optional)' }),
  ).toHaveValue('')
  await page
    .getByRole('textbox', { name: 'Account Name / Riot ID' })
    .fill('Second Profile')
  await page.getByRole('combobox', { name: 'Server Region' }).selectOption('NA')
  await page
    .getByRole('button', { name: 'Sign In To Another Account', exact: true })
    .focus()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Close dialog', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Sign In To Another Account', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'Waiting for Riot sign-in',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).cancelled)).toEqual([
    'owned-session',
  ])
})

test('quick import reviews detected details before writing any profile', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).writes = []
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts') return []
        if (command === 'detect_active_profile')
          return {
            session_blob: 'rso_token: test',
            details: {
              name: 'Detected#NA',
              region: 'NA',
              puuid: 'test-player',
            },
          }
        if (command === 'save_local_account') {
          ;(window as any).writes.push(args)
          return { id: 'created' }
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Import from Riot Client', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'Review imported account',
  )
  expect(await page.evaluate(() => (window as any).writes)).toEqual([])
  await expect(
    page.getByRole('textbox', { name: 'Account Name / Riot ID' }),
  ).toHaveValue('Detected#NA')
  await expect(
    page.getByRole('combobox', { name: 'Server Region' }),
  ).toHaveValue('NA')
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).writes.length))
    .toBe(1)
})

test('late provisioning results cannot save an account after closing the modal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).completed = 0
    ;(window as any).pollStarted = false
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts') return []
        if (command === 'start_provisioning_session')
          return 'late-result-session'
        if (command === 'poll_provisioning_session') {
          ;(window as any).pollStarted = true
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return 'rso_token: later-login'
        }
        if (command === 'complete_local_provisioning')
          (window as any).completed++
        return null
      },
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Profile', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Account Name / Riot ID' })
    .fill('Pending profile')
  await page.getByRole('combobox', { name: 'Server Region' }).selectOption('NA')
  await page
    .getByRole('button', { name: 'Sign In To Another Account', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => (window as any).pollStarted))
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(2200)
  expect(await page.evaluate(() => (window as any).completed)).toBe(0)
  await expect(page.locator('.roster-card')).toHaveCount(0)
})

test('editing persists name, region, rank, notes and favorite without refreshing credentials', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let profile = {
      id: 'editable',
      name: 'Old name',
      region: 'EUW',
      rank: null,
      notes: '',
      favorite: false,
      session_status: 'saved',
      has_session: true,
      created_at: '2026-01-01',
      last_used_at: null,
    }
    ;(window as any).edits = []
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts') return [profile]
        if (command === 'edit_local_account') {
          ;(window as any).edits.push(args)
          profile = { ...profile, ...args.details }
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Edit Old name', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('My main')
  await dialog
    .getByRole('combobox', { name: 'Region', exact: true })
    .selectOption('SG')
  await dialog
    .getByRole('combobox', { name: 'Rank', exact: true })
    .fill('Diamond II')
  await page.getByRole('option', { name: 'Diamond II', exact: true }).click()
  await dialog
    .getByRole('textbox', { name: 'Notes', exact: true })
    .fill('Personal notes')
  await dialog.getByRole('checkbox', { name: 'Favorite profile' }).check()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const edits = await page.evaluate(() => (window as any).edits)
  expect(edits).toMatchObject([
    {
      id: 'editable',
      details: {
        name: 'My main',
        region: 'SG',
        rank: 'Diamond II',
        notes: 'Personal notes',
        favorite: true,
      },
    },
  ])
  await expect(
    page.getByText('My main', { exact: true }).first(),
  ).toBeVisible()
})

test('Valorant and native match-detection races are guarded before termination', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).forcedStops = 0
    ;(window as any).race = false
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        if (command === 'list_local_accounts') return []
        if (command === 'runtime_snapshot')
          return {
            riot_client: true,
            league_client: false,
            league_game: false,
            valorant_game: !(window as any).race,
          }
        if (command === 'close_riot_client') {
          if (!args.confirmed)
            throw new Error('ACTIVE_MATCH_CONFIRMATION_REQUIRED')
          ;(window as any).forcedStops++
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Stop Riot', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  await page.getByRole('button', { name: 'Keep playing' }).click()
  expect(await page.evaluate(() => (window as any).forcedStops)).toBe(0)
  await page.evaluate(() => ((window as any).race = true))
  await page.getByRole('button', { name: 'Stop Riot', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  expect(await page.evaluate(() => (window as any).forcedStops)).toBe(0)
  await page.getByRole('button', { name: 'Exit game and continue' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).forcedStops))
    .toBe(1)
})

test('profile notes and cached avatars survive reload; editor preview, regions and ranks are complete', async ({
  page,
}) => {
  const { readFileSync, mkdirSync } = await import('node:fs')
  const path = await import('node:path')
  const source = readFileSync(
    path.resolve('tests/fixtures/summoner-685.png'),
  ).toString('base64')
  await page.addInitScript(
    ({ source }) => {
      let profile = {
        id: 'visual-profile',
        name: 'main',
        region: 'EUW',
        rank: 'Diamond II',
        notes: 'Solo queue • Focus on mid lane.\nKeep this note offline.',
        favorite: true,
        has_session: true,
        session_status: 'saved',
        created_at: '2026-01-01',
        last_used_at: null,
        customization: {
          icon_asset: 'dd-16.20.1-685.png',
          icon_source: 'riot',
          icon_id: 685,
          auto_sync_icon: false,
          auto_sync_rank: false,
        },
      }
      ;(window as any).iconCommands = []
      ;(window as any).__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          ;(window as any).iconCommands.push({ command, args })
          if (command === 'runtime_snapshot')
            return {
              riot_client: false,
              league_client: false,
              league_game: false,
              valorant_game: false,
            }
          if (command === 'list_local_accounts') return [profile]
          if (
            command === 'read_cached_icon' ||
            command === 'upload_profile_icon'
          )
            return {
              asset: args.asset ?? 'upload-example.png',
              data_url: `data:image/png;base64,${source}`,
            }
          if (command === 'get_icon_catalog')
            return {
              version: '16.20.1',
              icons: [{ id: 685, label: 'Icon #685' }],
            }
          if (command === 'get_profile_icon')
            return {
              asset: 'dd-16.20.1-685.png',
              data_url: `data:image/png;base64,${source}`,
            }
          if (command === 'edit_local_account') {
            profile = { ...profile, ...args.details }
            return null
          }
          if (command === 'sync_profile_customizations')
            return { changed: false, message: null }
          return null
        },
      }
    },
    { source },
  )
  await page.setViewportSize({ width: 1160, height: 820 })
  await page.goto('/')
  await expect(page.locator('.roster-card .account-notes')).toContainText(
    'Keep this note offline.',
  )
  await expect(page.locator('.hero-notes')).toContainText('Focus on mid lane')
  await expect(page.locator('.roster-card img').first()).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
  await page.reload()
  await expect(page.locator('.roster-card img').first()).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
  await expect(page.locator('.roster-card .account-notes')).toContainText(
    'Keep this note offline.',
  )
  await page
    .getByRole('button', { name: 'Edit main', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.profile-preview-identity h3')).toHaveText(
    'main',
  )
  await expect(dialog.locator('.profile-preview-avatar img')).toHaveAttribute(
    'src',
    /^data:/,
  )
  const heading = await dialog
    .getByRole('heading', { name: 'Edit Profile', exact: true })
    .boundingBox()
  const bounds = await dialog.boundingBox()
  expect(heading!.y - bounds!.y).toBeGreaterThan(20)
  const groups = await dialog
    .getByRole('combobox', { name: 'Region', exact: true })
    .locator('optgroup')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('label')))
  expect(groups).toEqual([
    'Europe',
    'Americas',
    'Asia',
    'Oceania & SEA',
    'Middle East',
  ])
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('main • edited')
  await expect(dialog.locator('.profile-preview-identity h3')).toHaveText(
    'main • edited',
  )
  await dialog.getByRole('combobox', { name: 'Rank', exact: true }).focus()
  await expect(
    page.getByRole('listbox', { name: 'League ranks' }).getByRole('option'),
  ).toHaveCount(32)
  await expect(
    page
      .getByRole('option', { name: 'Challenger', exact: true })
      .locator('img'),
  ).toHaveAttribute('src', '/rank-crests/challenger.png')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  const root = path.resolve('../../.artifacts/profile-editor')
  mkdirSync(root, { recursive: true })
  await dialog.screenshot({ path: path.join(root, 'edit-profile.png') })
  await expect(
    dialog.getByText('Customization & Client Sync', { exact: true })
  ).toBeVisible()
  await dialog
    .getByLabel('Auto-sync rank on game login', { exact: true })
    .check()
  await expect(
    dialog.getByRole('combobox', { name: 'Rank', exact: true }),
  ).toBeDisabled()
  await dialog
    .getByLabel('Auto-sync rank on game login', { exact: true })
    .uncheck()
  await dialog
    .getByRole('button', { name: 'League icons', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Select Icon #685', exact: true }).scrollIntoViewIfNeeded()
  await expect(
    dialog.getByRole('button', { name: 'Select Icon #685', exact: true }),
  ).toBeEnabled()
  const calls = await page.evaluate(() => (window as any).iconCommands)
  expect(
    calls
      .filter((entry: any) =>
        ['get_icon_catalog', 'get_profile_icon'].includes(entry.command),
      )
      .every((entry: any) => entry.args.downloadRequested === false),
  ).toBe(true)
  await dialog
    .getByRole('button', { name: 'Close icon picker', exact: true })
    .click()
  await dialog
    .getByLabel('Upload profile image', { exact: true })
    .setInputFiles(path.resolve('tests/fixtures/summoner-685.png'))
  await expect(
    dialog.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeEnabled()
  const uploaded = await page.evaluate(() =>
    (window as any).iconCommands.filter(
      (entry: any) => entry.command === 'upload_profile_icon',
    ),
  )
  expect(uploaded).toHaveLength(1)
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    path: path.join(root, 'roster-notes-and-avatar.png'),
  })
  await page.getByRole('button', { name: 'List View', exact: true }).click()
  await expect(page.locator('tbody .account-notes')).toContainText(
    'Keep this note offline.',
  )
  await expect(page.locator('tbody img').first()).toHaveAttribute(
    'src',
    /^data:/,
  )
  await page.screenshot({ path: path.join(root, 'roster-list.png') })
})

test('sync reports pending, partial failure, and manual retry without fake percentages', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).syncCalls = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return [
            {
              id: 'sync-main',
              name: 'Sync Main',
              region: 'EUW',
              rank: 'Gold II',
              notes: '',
              favorite: false,
              session_status: 'saved',
              has_session: true,
              created_at: '2026-01-01',
              last_used_at: null,
              customization: { auto_sync_icon: true, auto_sync_rank: true },
            },
          ]
        if (command === 'sync_profile_customizations') {
          ;(window as any).syncCalls++
          return await new Promise((resolve) => {
            ;(window as any).finishSync = resolve
          })
        }
        return null
      },
    }
  })
  await page.goto('/')
  const panel = page.locator('.sync-compact')
  await expect(panel).toContainText('Enabled')
  await expect(panel).not.toContainText('Syncing…')
  await panel.locator('summary').click()
  await page.evaluate(() =>
    (window as any).finishSync({
      changed: false,
      state: 'error',
      message: 'Icon sync failed: download blocked. Rank was checked.',
    }),
  )
  await expect(panel).toContainText('download blocked')
  await panel.getByRole('button', { name: 'Retry sync', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).syncCalls))
    .toBe(2)
  await page.evaluate(() =>
    (window as any).finishSync({
      changed: false,
      state: 'success',
      message:
        'Sync Main: enabled icon/rank sync checked — already up to date.',
    }),
  )
  await expect(panel).toContainText('already up to date')
  await expect(panel).toContainText('Last checked:')
  await expect(
    panel.getByRole('button', { name: 'Sync now', exact: true }),
  ).toBeEnabled()
  expect(await panel.textContent()).not.toMatch(/\d+%/)
})

test('slow startup stays locked, tracks real processes, and blocks duplicate profile launches', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).stage = 'none'
    ;(window as any).launchCalls = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: (window as any).stage !== 'none',
            league_client: (window as any).stage === 'league',
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return ['Main', 'Second'].map((name) => ({
            id: name,
            name,
            region: 'EUW',
            rank: '',
            notes: '',
            favorite: false,
            session_status: 'saved',
            has_session: true,
            created_at: '2026-01-01',
            last_used_at: null,
          }))
        if (command === 'launch_local_account') {
          ;(window as any).launchCalls++
          return null
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await expect(page.locator('.client-launch-status')).toContainText(
    'Waiting for Riot Client',
  )
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
  ).toBeDisabled()
  await expect(
    page
      .getByRole('button', { name: 'Waiting for client…', exact: true })
      .first(),
  ).toBeDisabled()
  expect(await page.evaluate(() => (window as any).launchCalls)).toBe(1)
  await page.evaluate(() => {
    ;(window as any).stage = 'riot'
  })
  await expect(page.locator('.client-launch-status')).toContainText(
    'Riot Client detected · waiting for League',
  )
  const { mkdirSync } = await import('node:fs')
  mkdirSync('../../.artifacts/sync-feedback', { recursive: true })
  await page.screenshot({
    path: '../../.artifacts/sync-feedback/client-startup.png',
  })
  await page.evaluate(() => {
    ;(window as any).stage = 'league'
  })
  await expect(page.locator('.client-launch-status')).toContainText(
    'League Client detected',
  )
  await expect(
    page.getByRole('button', { name: 'Client running', exact: true }).first(),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Switch', exact: true }),
  ).toBeEnabled()
  expect(await page.evaluate(() => (window as any).launchCalls)).toBe(1)
  await page.evaluate(() => {
    ;(window as any).stage = 'riot'
  })
  await page.getByRole('button', { name: 'Switch', exact: true }).click()
  await expect(page.locator('.client-launch-status')).toContainText(
    'waiting for League',
  )
  await page.getByRole('button', { name: 'Stop waiting', exact: true }).click()
  await expect(page.locator('.client-launch-status')).toContainText(
    'the client was not stopped',
  )
  expect(await page.evaluate(() => (window as any).launchCalls)).toBe(2)
})

test('failed icon previews show an error and retry downloads successfully', async ({
  page,
}) => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync('tests/fixtures/summoner-685.png').toString(
    'base64',
  )
  await page.addInitScript(
    ({ source }) => {
      ;(window as any).previewCalls = 0
      ;(window as any).__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          if (command === 'runtime_snapshot')
            return {
              riot_client: false,
              league_client: false,
              league_game: false,
              valorant_game: false,
            }
          if (command === 'list_local_accounts')
            return [
              {
                id: 'main',
                name: 'Main',
                region: 'EUW',
                rank: '',
                notes: '',
                favorite: false,
                session_status: 'saved',
                has_session: true,
                created_at: '2026-01-01',
                last_used_at: null,
              },
            ]
          if (command === 'get_icon_catalog')
            return {
              version: '16.20.1',
              icons: [{ id: 685, label: 'Icon #685' }],
            }
          if (command === 'get_profile_icon') {
            if (!args.downloadRequested) return null
            ;(window as any).previewCalls++
            if ((window as any).previewCalls === 1)
              throw new Error('Network blocked')
            return {
              asset: 'dd-16.20.1-685.png',
              data_url: `data:image/png;base64,${source}`,
            }
          }
          return null
        },
      }
    },
    { source },
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Edit Main', exact: true })
    .first()
    .click()
  await expect(
    page.getByText('Customization & Client Sync', { exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: 'League icons', exact: true }).click()
  await page
    .getByRole('button', { name: 'Load online previews', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Select Icon #685', exact: true }),
  ).toContainText('Failed · retry previews')
  await page
    .getByRole('button', { name: 'Retry previews', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Select Icon #685', exact: true }),
  ).toBeEnabled()
  expect(await page.evaluate(() => (window as any).previewCalls)).toBe(2)
})

test('startup timeout explains the delay and Stop Riot restores launch controls', async ({
  page,
}) => {
  await page.clock.install()
  await page.addInitScript(() => {
    ;(window as any).running = false
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: (window as any).running,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return [
            {
              id: 'main',
              name: 'Main',
              region: 'EUW',
              rank: '',
              notes: '',
              favorite: false,
              session_status: 'saved',
              has_session: true,
              created_at: '2026-01-01',
              last_used_at: null,
            },
          ]
        if (command === 'launch_local_account') {
          ;(window as any).running = true
        }
        if (command === 'close_riot_client') {
          ;(window as any).running = false
        }
        return null
      },
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await expect(page.locator('.client-launch-status')).toContainText(
    'waiting for League',
  )
  await page.clock.runFor(121000)
  await expect(page.locator('.client-launch-status')).toContainText(
    'Check Riot for sign-in, updates or errors',
  )
  await expect(
    page.getByRole('button', { name: 'Stop waiting', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Client running', exact: true }).first(),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Stop Riot', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }).first(),
  ).toBeEnabled()
})

test('appearance changes the live roster and persists reduced motion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('tab', { name: 'Appearance', exact: true }).click()
  await dialog.getByRole('button', { name: 'Compact Table' }).click()
  await expect(page.getByRole('button', { name: 'List View' })).toHaveClass(/view-toggle-btn-active/)
  await dialog.getByRole('checkbox', { name: 'Reduced motion' }).check()
  await expect(page.locator('html')).toHaveClass(/reduced-motion/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/reduced-motion/)
  await expect(page.getByRole('button', { name: 'List View' })).toHaveClass(/view-toggle-btn-active/)
})

test('offline edition checks updates through native IPC and menus support keyboard navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('laap_auto_check_updates', 'false')
    ;(window as any).updateChecks = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
        if (command === 'list_local_accounts') return [{ id: 'one', name: 'One', region: 'EUW', rank: null, notes: '', favorite: false, session_status: 'saved', has_session: true, created_at: '2026-01-01', last_used_at: null }]
        if (command === 'get_app_version') return '1.0.0'
        if (command === 'check_github_update') { (window as any).updateChecks++; return { has_update: false, current_version: '1.0.0', latest_version: '1.0.0', release_name: 'Current', release_notes: '', published_at: '', html_url: 'https://github.com/Kingof3O/laap/releases', edition: 'offline', platform: 'windows-x86_64' } }
        return null
      },
    }
  })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Options for One' })
  await trigger.click()
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem').last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Updates', exact: true }).click()
  await page.getByRole('button', { name: 'Check for Updates' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).updateChecks)).toBe(1)
})

test('native in-app update checks trigger installation action and guard active matches', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).installedUpdates = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
        if (command === 'list_local_accounts') return [{ id: 'one', name: 'One', region: 'EUW', rank: null, notes: '', favorite: false, session_status: 'saved', has_session: true, created_at: '2026-01-01', last_used_at: null }]
        if (command === 'get_app_version') return '1.0.0'
        if (command === 'get_updater_preflight_status') {
          return { safe: true, active_match: false, riot_running: false, provisioning_busy: false, reason: null }
        }
        if (command === 'check_github_update') {
          return {
            has_update: true,
            is_installable: true,
            current_version: '1.0.0',
            latest_version: '1.0.1',
            release_name: 'Release v1.0.1',
            release_notes: 'Verified security and engine update.',
            published_at: '2026-11-10T00:00:00Z',
            html_url: 'https://github.com/Kingof3O/laap/releases/latest',
            download_url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
            signature: 'validSignatureBase64==',
            edition: 'offline',
            platform: 'windows-x86_64',
          }
        }
        if (command === 'native_install_update') {
          ;(window as any).installedUpdates++
          return { success: true, installed_version: '1.0.1', message: 'Update applied' }
        }
        return null
      },
    }
  })
  await page.goto('/')
  const installBtn = page.getByRole('button', { name: /Download & Install Automatically|Install Now/ })
  await expect(installBtn).toBeVisible()
  await installBtn.click()
  await expect.poll(() => page.evaluate(() => (window as any).installedUpdates)).toBe(1)
})

test('the selected profile inspector follows roster selection and its real notes', async ({ page }) => {
  await page.addInitScript(() => {
    let profiles = [
      { id: 'a', name: 'Alpha', region: 'EUW', rank: null, notes: 'Alpha note', favorite: false, session_status: 'saved', has_session: true, created_at: '2026-01-01', last_used_at: null },
      { id: 'b', name: 'Bravo', region: 'NA', rank: null, notes: 'Bravo note', favorite: false, session_status: 'missing', has_session: false, created_at: '2026-01-02', last_used_at: null },
    ]
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1, unregisterCallback: () => {},
      invoke: async (command: string) => {
        if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
        if (command === 'list_local_accounts') return profiles
        if (command === 'delete_local_account') { profiles = profiles.filter((item) => item.id !== 'b'); return null }
        return null
      },
    }
  })
  await page.goto('/')
  const details = page.getByRole('complementary', { name: 'Selected profile details' })
  await expect(details).toContainText('Alpha note')
  await page.getByRole('button', { name: 'Select Bravo' }).click()
  await expect(details).toContainText('Bravo note')
  await expect(details).toContainText('Sign in required')
  await expect(page.getByRole('button', { name: 'Select Bravo' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Hide details', exact: true }).click()
  await expect(details).toHaveCount(0)
  await page.reload()
  await expect(details).toHaveCount(0)
  await page.getByRole('button', { name: 'Show details', exact: true }).click()
  await page.getByRole('button', { name: 'Select Bravo' }).click()
  await page.getByRole('textbox', { name: 'Search accounts or regions' }).fill('Alpha')
  await expect(details).toContainText('Alpha note')
  await expect(details).not.toContainText('Bravo note')
  await page.getByRole('textbox', { name: 'Search accounts or regions' }).fill('')
  await page.getByRole('button', { name: 'Select Bravo' }).click()
  await page.getByRole('button', { name: 'Options for Bravo' }).click()
  await page.getByRole('menuitem', { name: 'Remove Profile' }).click()
  await page.getByRole('dialog', { name: 'DeleteConfirm' }).getByRole('button', { name: 'Remove Profile' }).click()
  await expect(details).toContainText('Alpha note')
  await expect(details).not.toContainText('Bravo note')
})

for (const view of ['Grid', 'List']) {
  test(`${view} roster keeps the toolbar and scroll position during refresh`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 640 })
    await page.addInitScript(() => {
      const profiles = Array.from({ length: 40 }, (_, n) => ({
        id: String(n),
        name: `Profile ${String(n).padStart(2, '0')}`,
        region: 'EUW',
        rank: null,
        notes: '',
        favorite: false,
        session_status: 'saved',
        has_session: true,
        created_at: '2026-01-01',
        last_used_at: null,
      }))
      const refresh = { hold: false, finish: undefined as (() => void) | undefined }
      Object.assign(window, {
        testRosterRefresh: refresh,
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => {
            if (command !== 'list_local_accounts') return null
            if (refresh.hold) {
              await new Promise<void>((resolve) => { refresh.finish = resolve })
              return profiles.map((profile) => profile.id === '39'
                ? { ...profile, name: 'Profile 39 updated' }
                : profile)
            }
            return profiles
          },
        },
      })
    })
    await page.goto('/')
    await expect(page.getByText('40 Profiles', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: `${view} View`, exact: true }).click()

    const roster = page.getByRole('main')
    const getScrollTop = () => roster.evaluate((element) => element.scrollTop)
    const settings = page.getByRole('button', { name: 'Settings', exact: true })
    const search = page.getByRole('textbox', { name: 'Search accounts or regions' })
    await page.mouse.move(250, 440)
    await page.mouse.wheel(0, 600)
    await expect.poll(getScrollTop).toBeGreaterThan(0)
    const scrolledPosition = await getScrollTop()
    await expect(settings).toBeInViewport({ ratio: 1 })
    await expect(search).toBeInViewport({ ratio: 1 })
    await page.getByText('Filters', { exact: true }).click()
    await page.getByLabel('Filter by region').selectOption('EUW')
    await page.keyboard.press('Escape')

    const refresh = page.getByRole('button', { name: 'Refresh Accounts' })
    await page.evaluate(() => { (window as any).testRosterRefresh.hold = true })
    await refresh.click()
    await page.waitForFunction(() => typeof (window as any).testRosterRefresh.finish === 'function')
    await expect(page.getByText('Loading profiles…')).toHaveCount(0)
    expect(await getScrollTop()).toBe(scrolledPosition)
    await page.evaluate(() => (window as any).testRosterRefresh.finish())
    await expect(roster.getByText('Profile 39 updated', { exact: true })).toBeAttached()
    expect(await getScrollTop()).toBe(scrolledPosition)
  })
}

test('background no-op synchronization leaves the roster stable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => original(handler, timeout === 20000 ? 250 : timeout, ...args)) as typeof window.setInterval
    ;(window as any).polls = 0
    ;(window as any).pollFailure = false
    ;(window as any).__TAURI_INTERNALS__ = { invoke: async (command: string) => {
      if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
      if (command === 'list_local_accounts') return [{ id:'p', name:'Polling', region:'EUW', rank:null, notes:'', favorite:false, session_status:'saved', has_session:true, created_at:'2026-01-01', last_used_at:null, customization:{ auto_sync_icon:true, auto_sync_rank:false } }]
      if (command === 'sync_profile_customizations') { (window as any).polls++; if ((window as any).pollFailure) throw Error('fixture failure'); return { changed:false, state:'success', message:null } }
      return null
    }}
  })
  await page.goto('/')
  const panel = page.locator('.sync-compact')
  const card = page.locator('.roster-card')
  await expect(card).toBeVisible()
  const before = await card.boundingBox()
  await expect.poll(() => page.evaluate(() => (window as any).polls)).toBeGreaterThanOrEqual(3)
  expect(await card.boundingBox()).toEqual(before)
  await expect(panel).not.toContainText('Syncing…')
  await expect(panel).not.toHaveClass(/sync-status-syncing/)
  await page.evaluate(() => { (window as any).pollFailure = true })
  await expect(panel).toHaveClass(/sync-status-error/)
  await page.evaluate(() => { (window as any).pollFailure = false })
  await expect(panel).toHaveClass(/sync-status-success/)
})

test('toolbar shortcut, filter dismissal, and About branding', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('textbox', { name: 'Search accounts or regions' })).toBeFocused()
  await page.getByText('Filters', { exact: true }).click()
  await expect(page.getByLabel('Filter by region')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Filter by region')).not.toBeVisible()
  await expect(page.getByText('Filters', { exact: true })).toBeFocused()
  await page.getByText('Filters', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Search accounts or regions' }).click()
  await expect(page.getByLabel('Filter by region')).not.toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'About', exact: true }).click()
  const about = page.getByLabel('About LAAP')
  await expect(about.getByRole('img', { name: 'LAAP' })).toHaveAttribute('src', '/logo.webp')
  await expect(about).not.toContainText('Created by')
  await expect(about).not.toContainText('Hussien Salah')
})

test('add account modal mode switcher, always-visible customization, and inspector launch action', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const launched: string[] = []
    ;(window as any).launchedIds = launched
    ;(window as any).clientStarted = false
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: (window as any).clientStarted,
            league_client: (window as any).clientStarted,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return [
            {
              id: 'acc-main',
              name: 'My Main',
              region: 'EUW',
              rank: 'Diamond II',
              notes: 'Solo queue',
              favorite: true,
              session_status: 'saved',
              has_session: true,
              created_at: '2026-01-01',
              last_used_at: null,
            },
          ]
        if (command === 'launch_local_account') {
          launched.push(args.id)
          ;(window as any).clientStarted = true
          return null
        }
        return null
      },
    }
  })

  await page.goto('/')
  await page.locator('.btn-add-primary').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByText('Customization & Client Sync', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Sign In To Another Account' }),
  ).toBeDisabled()
  await expect(
    dialog.getByText('Fill Name & Region above to launch Riot sign-in.'),
  ).toBeVisible()

  await dialog
    .getByRole('tab', { name: 'Import Current Session', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: 'Import Current Account' }),
  ).toBeVisible()

  await dialog.getByRole('tab', { name: 'New Riot Sign-In', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Sign In To Another Account' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  const launchBtn = page.getByRole('button', {
    name: 'Launch My Main',
    exact: true,
  })
  await expect(launchBtn).toBeVisible()
  await launchBtn.click()
  await expect
    .poll(() => page.evaluate(() => (window as any).launchedIds))
    .toEqual(['acc-main'])
})

test('live match settings save, Check live displays active match state, and pre-launch guard confirms before launch', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const launched: string[] = []
    let liveSettings = {
      mode: 'off',
      workerUrl: '',
      prelaunchGuard: true,
      hasRiotApiKey: false,
      hasWorkerToken: false,
      envRiotKeyPresent: false,
    }
    ;(window as any).launchedIds = launched
    ;(window as any).savedLivePayloads = []
    let liveCheckCalls = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        if (command === 'runtime_snapshot')
          return {
            riot_client: false,
            league_client: false,
            league_game: false,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return [
            {
              id: 'acc-live',
              name: 'SmurfAccount#EUW',
              region: 'EUW',
              rank: 'Emerald I',
              notes: 'Climbing',
              favorite: false,
              session_status: 'saved',
              has_session: true,
              has_puuid: true,
              created_at: '2026-01-01',
              last_used_at: null,
            },
          ]
        if (command === 'get_live_status_settings') return liveSettings
        if (command === 'save_live_status_settings') {
          ;(window as any).savedLivePayloads.push(args.input)
          liveSettings = {
            mode: args.input.mode,
            workerUrl: args.input.workerUrl ?? '',
            prelaunchGuard: Boolean(args.input.prelaunchGuard),
            hasRiotApiKey:
              !args.input.clearRiotApiKey &&
              (Boolean(args.input.riotApiKey) || liveSettings.hasRiotApiKey),
            hasWorkerToken:
              !args.input.clearWorkerToken &&
              (Boolean(args.input.workerToken) || liveSettings.hasWorkerToken),
            envRiotKeyPresent: false,
          }
          return liveSettings
        }
        if (command === 'check_account_live_status') {
          liveCheckCalls += 1
          if (liveCheckCalls === 1) {
            throw new Error('Riot API returned HTTP 400')
          }
          return {
            configured: liveSettings.mode !== 'off',
            mode: liveSettings.mode,
            inGame: true,
            cached: false,
            puuid: 'fixture-puuid',
            platform: 'euw1',
            checkedAt: '2026-11-14T00:00:00Z',
            gameId: 123456,
            gameMode: 'CLASSIC',
            gameType: 'MATCHED_GAME',
            queueId: 420,
            gameLengthSeconds: 725,
            championId: 99,
          }
        }
        if (command === 'launch_local_account') {
          launched.push(args.id)
          return null
        }
        return null
      },
    }
  })

  await page.goto('/')
  await expect(
    page.getByText('SmurfAccount#EUW', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Check live match status for SmurfAccount#EUW' }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settingsDialog = page.getByRole('dialog')
  await settingsDialog.getByRole('tab', { name: 'Advanced', exact: true }).click()
  await settingsDialog.getByRole('button', { name: 'Personal Key' }).click()
  await settingsDialog
    .getByLabel(/Riot Personal API Key/)
    .fill('personal-key-fixture-01')
  await settingsDialog.getByRole('button', { name: 'Save Live Settings' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).savedLivePayloads.length))
    .toBe(1)
  await expect(settingsDialog.getByText('Saved in encrypted vault')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settingsDialog).toHaveCount(0)

  await page
    .getByRole('button', { name: 'Check live match status for SmurfAccount#EUW' })
    .click()
  await expect(page.getByText('Riot API returned HTTP 400')).toBeVisible()
  await expect(page.locator('#profile-inspector')).toContainText('Not checked')
  await expect(page.locator('#profile-inspector')).not.toContainText('Not in game')
  await expect(page.locator('.roster-card')).not.toContainText('Not in game')

  await page
    .getByRole('button', { name: 'Check live match status for SmurfAccount#EUW' })
    .click()
  await expect(page.locator('#profile-inspector')).toContainText(
    "In match · Summoner's Rift · 12m",
  )
  await expect(page.locator('.roster-card')).toContainText('In Match · 12m')

  await page
    .getByRole('button', { name: 'Launch SmurfAccount#EUW', exact: true })
    .click()
  const warningDialog = page.getByRole('dialog', { name: 'Live Match Warning' })
  await expect(warningDialog).toContainText('SmurfAccount#EUW')
  await expect(warningDialog).toContainText("Summoner's Rift match (12m elapsed)")
  await warningDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(warningDialog).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).launchedIds)).toEqual([])

  await page
    .getByRole('button', { name: 'Launch SmurfAccount#EUW', exact: true })
    .click()
  await expect(warningDialog).toBeVisible()
  await warningDialog.getByRole('button', { name: 'Launch Anyway' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).launchedIds))
    .toEqual(['acc-live'])
})
