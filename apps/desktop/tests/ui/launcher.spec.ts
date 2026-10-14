import { expect, test, type Page } from '@playwright/test'
async function launcherFixture(
  page: Page,
  options: { enabled?: boolean; client?: boolean; game?: boolean } = {},
) {
  await page.addInitScript((options) => {
    const state = {
      view: {
        windows: true,
        settings: {
          riot_client_path: null as string | null,
          presence_enabled: options.enabled ?? false,
          presence_mode: 'online',
        },
        detected_client: {
          path: 'E:\\Games & Apps\\Riot Client\\RiotClientServices.exe',
          source: 'Riot installation record',
        },
        detection_error: null,
        presence_ready: options.enabled ?? false,
        presence_supported: true,
      },
      client: options.client ?? false,
      game: options.game ?? false,
      helper: false,
      applied: null as string | null,
      delayPresence: false,
      calls: [] as { command: string; args: any }[],
      finishPresence: null as null | (() => void),
    }
    ;(window as any).launcherFixture = state
    const status = () => ({
      enabled: state.view.settings.presence_enabled,
      desired_mode: state.view.settings.presence_mode,
      applied_mode: state.applied,
      state: !state.client
        ? 'next_launch'
        : !state.helper
          ? 'restart_required'
          : state.applied === state.view.settings.presence_mode
            ? 'active'
            : 'waiting',
      message: !state.client
        ? `Appear ${state.view.settings.presence_mode} on next login.`
        : !state.helper
          ? 'Restart Riot with presence controls to change online/offline status for this session.'
          : state.applied === state.view.settings.presence_mode
            ? `LAAP Presence: ${state.applied} filter is active.`
            : 'Waiting for League chat to connect before confirming presence…',
    })
    const apply = async () => {
      if (state.helper) {
        if (state.delayPresence)
          return await new Promise((resolve) => {
            state.finishPresence = () => {
              state.applied = state.view.settings.presence_mode
              state.delayPresence = false
              resolve(status())
            }
          })
        state.applied = state.view.settings.presence_mode
      }
      return status()
    }
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        state.calls.push({ command, args })
        if (command === 'runtime_snapshot')
          return {
            riot_client: state.client,
            league_client: state.client,
            league_game: state.game,
            valorant_game: false,
          }
        if (command === 'list_local_accounts')
          return [
            {
              id: 'main',
              name: 'Main',
              region: 'EUW',
              rank: 'Gold II',
              notes: '',
              favorite: false,
              session_status: 'saved',
              has_session: true,
              created_at: '2026-01-01',
              last_used_at: null,
            },
          ]
        if (command === 'get_launcher_settings') return state.view
        if (command === 'save_launcher_settings') {
          if (args.riotClientPath === 'missing.exe')
            throw new Error(
              'Choose an existing RiotClientServices.exe file, or its Riot Client folder.',
            )
          state.view.settings.riot_client_path = args.riotClientPath
          state.view.settings.presence_enabled = args.presenceEnabled
          if (args.riotClientPath)
            state.view.detected_client = {
              path: args.riotClientPath,
              source: 'Saved path override',
            }
          return state.view
        }
        if (command === 'prepare_presence_support') {
          state.view.presence_ready = true
          return state.view
        }
        if (command === 'get_presence_status') return status()
        if (command === 'set_presence_mode') {
          state.view.settings.presence_mode = args.mode
          return await apply()
        }
        if (command === 'retry_presence') return await apply()
        if (
          command === 'launch_local_account' ||
          command === 'restart_riot_presence'
        ) {
          if (state.game && !args.confirmed)
            throw new Error('ACTIVE_MATCH_CONFIRMATION_REQUIRED')
          state.client = true
          state.game = false
          state.helper = state.view.settings.presence_enabled
          state.applied = null
          return null
        }
        if (command === 'close_riot_client') {
          state.client = false
          state.helper = false
          return null
        }
        return null
      },
    }
  }, options)
}

test('custom-drive discovery, saved overrides and explicit presence setup are visible in Settings', async ({
  page,
}) => {
  await launcherFixture(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  await expect(dialog).toContainText(
    'E:\\Games & Apps\\Riot Client\\RiotClientServices.exe',
  )
  const path = dialog.getByLabel('Riot Client path override (optional)', {
    exact: true,
  })
  await path.fill('missing.exe')
  await dialog
    .getByRole('button', { name: 'Save launcher settings', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText('Choose an existing')
  await path.fill('F:\\Custom Folder\\RiotClientServices.exe')
  await dialog
    .getByRole('button', { name: 'Save launcher settings', exact: true })
    .click()
  await expect(dialog).toContainText('Found using Saved path override')
  await expect(dialog).not.toContainText(/deceive/i)
  await expect(
    dialog.getByLabel('Enable LAAP Presence for future logins'),
  ).toBeDisabled()
  await dialog
    .getByRole('button', { name: 'Prepare presence controls', exact: true })
    .click()
  await expect(
    dialog.getByLabel('Enable LAAP Presence for future logins'),
  ).toBeEnabled()
  await expect(
    dialog.getByLabel('Enable LAAP Presence for future logins'),
  ).not.toBeChecked()
  await dialog.getByLabel('Enable LAAP Presence for future logins').check()
  await dialog
    .getByRole('button', { name: 'Save launcher settings', exact: true })
    .click()
  await expect(
    page.getByLabel('Online presence', { exact: true }),
  ).toBeVisible()
  const { mkdirSync } = await import('node:fs')
  mkdirSync('../../.artifacts/launcher', { recursive: true })
  await dialog.locator('.settings-body').evaluate((element) => {
    element.scrollTop = 0
  })
  await dialog.screenshot({ path: '../../.artifacts/launcher/settings.png' })
})

test('startup presence is saved and live toggles require confirmation without relaunching', async ({
  page,
}) => {
  await launcherFixture(page, { enabled: true })
  await page.goto('/')
  const select = page.getByLabel('Online presence', { exact: true })
  await select.selectOption('offline')
  await expect(page.locator('.presence-status')).toContainText(
    'Appear offline on next login',
  )
  expect(
    await page.evaluate(() =>
      (window as any).launcherFixture.calls.filter(
        (c: any) => c.command === 'launch_local_account',
      ),
    ),
  ).toHaveLength(0)
  await page.evaluate(() => {
    ;(window as any).launcherFixture.delayPresence = true
  })
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await expect(page.locator('.presence-status')).toContainText(
    'Applying presence…',
  )
  await expect(page.locator('.presence-status')).not.toContainText(
    'LAAP Presence: offline filter is active',
  )
  await expect(select).toBeDisabled()
  await page.evaluate(() => (window as any).launcherFixture.finishPresence())
  await expect(page.locator('.presence-status')).toContainText(
    'LAAP Presence: offline filter is active',
  )
  await select.selectOption('online')
  await expect(page.locator('.presence-status')).toContainText(
    'LAAP Presence: online filter is active',
  )
  expect(
    await page.evaluate(() =>
      (window as any).launcherFixture.calls.filter(
        (c: any) => c.command === 'launch_local_account',
      ),
    ),
  ).toHaveLength(1)
})

test('a normally opened client requires an explicit guarded restart to enable presence', async ({
  page,
}) => {
  await launcherFixture(page, { enabled: true, client: true, game: true })
  await page.goto('/')
  await page
    .getByLabel('Online presence', { exact: true })
    .selectOption('offline')
  await expect(page.locator('.presence-status')).toContainText(
    'Restart Riot with presence controls',
  )
  await expect(page.locator('.presence-status')).not.toContainText(
    'LAAP Presence: offline filter is active',
  )
  await page
    .getByRole('button', {
      name: 'Restart Riot with presence controls',
      exact: true,
    })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  expect(
    await page.evaluate(() =>
      (window as any).launcherFixture.calls.filter(
        (c: any) => c.command === 'restart_riot_presence',
      ),
    ),
  ).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Exit game and continue', exact: true })
    .click()
  await expect(page.locator('.presence-status')).toContainText(
    'LAAP Presence: offline filter is active',
  )
  const restarts = await page.evaluate(() =>
    (window as any).launcherFixture.calls.filter(
      (c: any) => c.command === 'restart_riot_presence',
    ),
  )
  expect(restarts).toHaveLength(1)
  expect(restarts[0].args.confirmed).toBe(true)
})
