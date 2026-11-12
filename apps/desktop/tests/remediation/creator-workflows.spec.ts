import { test, expect } from '@playwright/test'

// These are browser UI contract tests. Native acceptance is recorded separately.
for (const source of ['project', 'quick', 'repair']) {
  test(`Creator ${source} import requires explicit local use and redistribution review`, async ({ page }) => {
    const imports: any[] = []
    const project = { id: 'original-project', name: 'Original project', author: 'Original artist', version: '1.0.0', description: '', champion: 'Ahri', skinNum: 0, tags: [], createdAt: '2026-11-12', updatedAt: '2026-11-12',
      files: [{ relativePath: 'assets/original.png', sizeBytes: 1, sha256: 'a'.repeat(64), formatType: 'Texture', dataBase64: 'AA==' }] }
    const manifest = { schemaVersion: 1, modId: 'original.image', displayName: 'Original image', author: 'Original artist', version: '1.0.0', license: 'Private / local-only', rightToDistribute: false, containsPaidRiotContent: false, sha256: 'a'.repeat(64), supportedGameBuilds: [], championIds: [], files: project.files }
    await page.exposeFunction('workflowNative', (command: string, args: any) => {
      if (command === 'list_local_accounts') throw Error('Studio may not access the vault')
      if (command === 'creator_list_projects') return [{ ...project, fileCount: 1 }]
      if (command === 'creator_get_project') return project
      if (command === 'creator_save_project') return args.project
      if (command === 'creator_export_fantome') return 'UEsDBA=='
      if (command === 'creator_build_package') { expect(args.request.rightToDistribute).toBe(false); return { archive: 'UEsDBA==', manifest } }
      if (command === 'fantome_read_meta') return { name: 'Repaired original', author: 'Original artist', version: '1', license: 'Private / local-only' }
      if (command === 'fantome_inspect_package') {
        expect(args.archiveBase64).toBeTruthy()
        return { isValid: false, metaFound: true, fileCount: 2, issuesFound: ['Noncanonical casing'], warnings: [], hasSkeleton: false }
      }
      if (command === 'fantome_repair_package') {
        expect(args.archiveBase64).toBeTruthy()
        return { repaired: true, actionsTaken: ['Normalized original asset path'], repairedArchiveBase64: 'UEsDBA==' }
      }
      if (command === 'mod_inspect') {
        expect(args.declaration.rightToDistribute).toBe(false)
        expect(args.declaration.license).toBe('Private / local-only')
        return { ...manifest, ...args.declaration }
      }
      if (command === 'mod_import') { imports.push(args); return null }
      if (command === 'mod_list' || command === 'customization_preset_list') return []
      if (command === 'catalog_list') return { version: '16.22.1', locale: 'en_US', data: [], cached: true }
      if (command === 'plugin:event|listen') return 1
      return null
    })
    await page.addInitScript(() => {
      localStorage.setItem('laap_auto_check_updates', 'false')
      ;(window as any).__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1, unregisterCallback: () => {}, invoke: (command: string, args: any) => (window as any).workflowNative(command, args) }
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Creator', exact: true }).click()
    if (source === 'project') {
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await page.getByRole('button', { name: 'Import into local Mod Library', exact: true }).click()
    } else if (source === 'quick') {
      await page.getByRole('button', { name: 'Quick Image Pack' }).click()
      for (const [label, value] of [['Package ID', 'original.image'], ['Display name', 'Original image'], ['Author', 'Original artist'], ['License', 'Private / local-only']]) await page.getByLabel(label, { exact: true }).fill(value)
      await page.getByLabel('Original images').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: Buffer.from([0]) })
      await page.getByRole('checkbox', { name: /I have rights to package/ }).check()
      await page.getByRole('button', { name: 'Build package', exact: true }).click()
      await page.getByRole('button', { name: 'Import into local Mod Library', exact: true }).click()
    } else {
      await page.getByRole('button', { name: 'Fantome Repair', exact: true }).click()
      await page.locator('input[type=file]').setInputFiles({ name: 'original.fantome', mimeType: 'application/zip', buffer: Buffer.from('PK') })
      await page.getByRole('button', { name: 'Repair & Normalize Package', exact: true }).click()
      await page.getByRole('button', { name: 'Import into local Mod Library', exact: true }).click()
    }
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('checkbox', { name: /redistribution/ })).not.toBeChecked()
    await dialog.getByLabel('License or permission', { exact: true }).fill('Private / local-only')
    await dialog.getByRole('checkbox', { name: /permission to use/ }).check()
    await dialog.getByRole('button', { name: 'Review permissions and contents' }).click()
    await expect(dialog).toContainText('Not granted — local use only')
    expect(imports).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Confirm local import' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Game-side application is unavailable' })).toContainText('Game-side application is unavailable')
    expect(imports).toHaveLength(1)
    expect(imports[0].rightsConfirmed).toBe(true)
    expect(imports[0].manifest.rightToDistribute).toBe(false)
  })
}

test('Creator save failure is visible and retry plus project exit preserve the latest draft', async ({ page }) => {
  let persisted = { id: 'save-failure-project', name: 'Original draft', author: 'Fixture author', version: '1', description: '', champion: 'Ahri', skinNum: 0, tags: [], files: [], createdAt: '2026-11-12', updatedAt: '2026-11-12' }
  let saves = 0
  await page.exposeFunction('failureNative', async (command: string, args: any) => {
    if (command === 'creator_list_projects') return [{ ...persisted, fileCount: 0 }]
    if (command === 'creator_get_project') return persisted
    if (command === 'creator_save_project') {
      if (++saves === 1) throw Error('Disk full fixture')
      persisted = args.project
      return persisted
    }
    if (command === 'mod_list' || command === 'customization_preset_list') return []
    if (command === 'catalog_list') return { version: '16.22.1', locale: 'en_US', data: [], cached: true }
    if (command === 'plugin:event|listen') return 1
    return null
  })
  await page.addInitScript(() => {
    localStorage.setItem('laap_auto_check_updates', 'false')
    ;(window as any).__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1, unregisterCallback: () => {}, invoke: (command: string, args: any) => (window as any).failureNative(command, args) }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Creator', exact: true }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByLabel('Skin / project name').fill('Changed draft')
  await expect(page.getByRole('alert')).toContainText('Disk full fixture')
  await expect(page.getByText('Save failed — retry required', { exact: true })).toBeVisible()
  expect(persisted.name).toBe('Original draft')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  await expect(page.getByText('Saved to this device', { exact: true })).toBeVisible()
  expect(persisted.name).toBe('Changed draft')
  await page.getByLabel('Skin / project name').fill('Intermediate draft')
  await page.getByLabel('Skin / project name').fill('Latest draft')
  await page.getByRole('button', { name: '← Back to projects', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Latest draft', exact: true })).toBeVisible()
  expect(persisted.name).toBe('Latest draft')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByLabel('Skin / project name')).toHaveValue('Latest draft')
})
