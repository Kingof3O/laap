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
  await expect(page.getByText('Offline Edition', { exact: true })).toBeVisible()
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
    page.getByText('★ My main', { exact: true }).first(),
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
    .getByRole('button', { name: 'Edit ★ main', exact: true })
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
})
