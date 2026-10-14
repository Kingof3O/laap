import { expect, test } from '@playwright/test'
test('tray account intent launches once with live-game confirmation and no stale ID launch', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).launches = []
    ;(window as any).__TAURI_INTERNALS__ = {
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
              id: 'main',
              name: 'Tray Main',
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
        if (command === 'launch_local_account') {
          ;(window as any).launches.push(args)
          return null
        }
        return null
      },
    }
  })
  await page.goto('/')
  await expect(
    page.getByText('Tray Main', { exact: true }).first(),
  ).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('laap:tray-intent', {
        detail: { type: 'switch_account', id: 'main' },
      }),
    ),
  )
  await expect(page.getByRole('dialog')).toContainText(
    'A match is currently in progress',
  )
  expect(await page.evaluate(() => (window as any).launches)).toHaveLength(0)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('laap:tray-intent', {
    detail: { type: 'switch_account', id: 'main' },
  })))
  expect(await page.evaluate(() => (window as any).launches)).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Exit game and continue', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => (window as any).launches.length))
    .toBe(1)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('laap:tray-intent', {
        detail: { type: 'switch_account', id: 'deleted' },
      }),
    ),
  )
  await expect(
    page.getByText('That profile no longer exists. Refresh the roster.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(await page.evaluate(() => (window as any).launches)).toHaveLength(1)
})
