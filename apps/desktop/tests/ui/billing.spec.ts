import { expect, test } from '@playwright/test'

test('selecting Basic slots preserves locked profiles and redeeming a gift restores the roster', async ({ page }) => {
  await page.addInitScript(() => {
    let signedIn = false
    let pro = false
    let active: string[] = []
    const profiles = ['Alpha', 'Bravo', 'Charlie'].map((name) => ({
      id: name, name, region: 'EUW', notes: '', favorite: false, has_session: true,
      session_status: 'saved', created_at: '2026-01-01', last_used_at: null,
    }))
    const status = () => ({ available: true, signedIn, pro, expiresAt: pro ? 2_000_000_000 : null })
    const slots = () => ({
      pro, canAdd: pro, lockedCount: pro ? 0 : profiles.length - active.length,
      chooseCount: active.length === 0 && !pro ? 2 : 0,
      choices: pro ? [] : profiles.filter((profile) => !active.includes(profile.id)),
    })
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: { ids?: string[]; code?: string; activeId?: string; lockedId?: string }) => {
          switch (command) {
            case 'billing_status': return status()
            case 'list_local_accounts': return profiles.filter((profile) => pro || active.includes(profile.id))
            case 'basic_profile_slots': return slots()
            case 'select_basic_profiles': active = args.ids ?? []; return slots()
            case 'replace_basic_profile':
              active = active.map((id) => id === args.activeId ? args.lockedId ?? id : id)
              return slots()
            case 'billing_send_code': return null
            case 'billing_verify_email':
              if (args.code !== '123456') throw 'Invalid email code.'
              signedIn = true
              return status()
            case 'billing_redeem':
              if (args.code !== 'LAAP-test-gift') throw 'Invalid gift.'
              pro = true
              return status()
          }
          return null
        },
      },
    })
  })
  await page.goto('/')
  const picker = page.getByRole('region', { name: 'Choose active profiles' })
  await picker.getByRole('checkbox', { name: 'Alpha · EUW' }).check()
  await picker.getByRole('checkbox', { name: 'Charlie · EUW' }).check()
  await expect(picker.getByRole('checkbox', { name: 'Bravo · EUW' })).toBeDisabled()
  await picker.getByRole('button', { name: 'Use selected profiles' }).click()
  await expect(page.getByText('2 Profiles', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select Bravo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Change active profiles' }).click()
  await page.getByLabel('Active profile to replace').selectOption('Alpha')
  await page.getByLabel('Saved profile to activate').selectOption('Bravo')
  await page.getByRole('button', { name: 'Replace active profile' }).click()
  await expect(page.getByRole('button', { name: 'Select Bravo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select Alpha' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add Profile', exact: true }).click()
  const billing = page.getByRole('dialog', { name: 'LAAP billing' })
  await billing.getByLabel('Billing email').fill('buyer@example.test')
  await billing.getByRole('button', { name: 'Send email code' }).click()
  await expect(billing.getByText('Check your email for a sign-in code.')).toBeVisible()
  await billing.getByLabel('Email code', { exact: true }).fill('123456')
  await billing.getByRole('button', { name: 'Verify email' }).click()
  for (const plan of ['$3 monthly', '$20 yearly', '$60 lifetime']) {
    await expect(billing.getByRole('button', { name: plan, exact: true })).toBeVisible()
  }
  await billing.getByLabel('Gift code', { exact: true }).fill('LAAP-test-gift')
  await billing.getByRole('button', { name: 'Redeem gift code' }).click()
  await expect(billing.getByRole('heading', { name: 'LAAP Pro' })).toBeVisible()
  await billing.getByRole('button', { name: 'Close billing' }).click()
  await expect(page.getByText('3 Profiles', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select Alpha' })).toBeVisible()
})
