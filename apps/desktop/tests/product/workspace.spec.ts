import { test, expect } from '@playwright/test'

const complete = process.env.LAAP_TEST_FLAVOR === 'complete'

test('account and Studio surfaces are available only in the matching edition', async ({ page }, testInfo) => {
  const nativeCalls: string[] = []
  await page.exposeFunction('recordNativeCall', (command: string) => nativeCalls.push(command))
  await page.addInitScript(() => {
    const champion = { id: 'Ahri', name: 'Ahri', title: 'the Nine-Tailed Fox', tags: ['Mage', 'Assassin'] }
    const snapshot = { version: '16.22.1', locale: 'en_US', cached: true }
    const records: Record<string, unknown>[] = []
    const w = window as Window & { __TAURI_INTERNALS__?: unknown; recordNativeCall: (command: string) => void }
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (command: string, args: Record<string, unknown>) => {
        w.recordNativeCall(command)
        switch (command) {
          case 'get_app_version': return '1.0.0'
          case 'catalog_preferences': return { favorites: [], recent: [] }
          case 'catalog_list': return { ...snapshot, data: [champion] }
          case 'catalog_champion': return { ...snapshot, data: { ...champion, lore: 'Test fixture', skins: [{ id: '103000', num: 0, name: 'default', chromas: false }] } }
          case 'customization_preset_list': return records
          case 'customization_preset_save': {
            const record = { ...(args.preset as Record<string, unknown>), id: 'test-id' }
            records.push(record)
            return record
          }
          case 'list_local_accounts': return [{ id: 'opaque-local-id', name: 'Test profile', region: 'EUW', notes: '', favorite: false, has_session: false, session_status: 'Sign in required', created_at: '2026-01-01T00:00:00Z' }]
          case 'mod_list': return []
          case 'theme_preview_load': return null
          default: return null
        }
      },
    }
    localStorage.setItem('laap_auto_check_updates', 'false')
  })
  await page.route('https://ddragon.leagueoflegends.com/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText(complete ? 'LAAP Complete' : 'LAAP Studio', { exact: true })).toBeVisible()
  if (complete) {
    await expect(page.getByRole('button', { name: 'Add Profile' })).toBeVisible()
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
  } else {
    await expect(page.getByRole('button', { name: 'Add Profile' })).toHaveCount(0)
  }
  await expect(page.getByRole('heading', { name: 'Everything starts here' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('overview-1160.png') })
  await page.getByRole('button', { name: 'Catalog', exact: true }).click()
  await expect(page.getByText('Cached copy', { exact: false })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('catalog-1160.png') })
  await page.getByRole('button', { name: 'Ahri Mage' }).click()
  await expect(page.getByText('Ownership unknown.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Create preset' }).click()
  await page.getByRole('textbox', { name: 'Preset name' }).fill('My preview')
  if (complete) {
    await page.getByLabel('Local profile').selectOption('opaque-local-id')
  } else {
    await expect(page.getByLabel('Local profile')).toHaveCount(0)
    expect(nativeCalls).not.toContain('list_local_accounts')
  }
  await page.getByRole('button', { name: 'Save preset' }).click()
  await expect(page.getByText('My preview', { exact: true })).toBeVisible()
  if (complete) await expect(page.getByText('Linked to a local profile', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Mod library', exact: true }).click()
  await expect(page.getByText('Your library is empty.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Validate and import' })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('library-1160.png') })
  await page.getByRole('button', { name: 'Themes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save theme' })).toBeVisible()
  for (const [width, height] of [[960, 640], [1160, 760], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.screenshot({ path: testInfo.outputPath('theme-' + width + '.png') })
  }
  if (!complete) {
    await page.setViewportSize({ width: 1160, height: 760 })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Studio settings' })).toBeVisible()
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await expect(page.getByText('Default Roster Layout', { exact: true })).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Reduced motion' }).check()
    await expect(page.locator('html')).toHaveClass(/reduced-motion/)
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport()
    const titlebar = await page.locator('.titlebar').boundingBox()
    expect(titlebar?.y).toBeGreaterThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath('settings-appearance-1160.png') })
    await page.getByRole('tab', { name: 'Updates', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath('settings-updates-1160.png') })
    await page.getByRole('tab', { name: 'About', exact: true }).click()
    await expect(page.getByText('LAAP Studio · v1.0.0', { exact: false })).toBeVisible()
  }
  expect(nativeCalls).not.toContain('load_access_token')
  expect(nativeCalls).not.toContain('inject_account_session')
})
