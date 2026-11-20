import { expect, test, type Page } from '@playwright/test'

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
              if (!signedIn) throw 'Verify your billing email to continue.'
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
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  const licenseTab = settings.getByRole('tab', { name: 'License & Billing' })
  await expect(licenseTab).toHaveAttribute('aria-selected', 'true')
  await settings.getByRole('button', { name: 'View plans' }).click()
  await expect(settings).toHaveCount(0)
  const billing = page.getByRole('dialog', { name: 'LAAP billing' })
  for (const plan of ['$3 monthly', '$20 yearly', '$60 lifetime']) {
    await expect(billing.getByRole('radio', { name: plan, exact: true })).toBeVisible()
  }
  await billing.getByRole('button', { name: 'Redeem a gift code' }).click()
  await billing.getByLabel('Gift code', { exact: true }).fill('LAAP-test-gift')
  await billing.getByRole('button', { name: 'Continue with email' }).click()
  await billing.getByLabel('Billing email').fill('buyer@example.test')
  await billing.getByRole('button', { name: 'Send email code' }).click()
  await expect(billing.getByText(/Enter the code sent to/)).toBeVisible()
  await billing.getByLabel('Email code', { exact: true }).fill('123456')
  await billing.getByRole('button', { name: 'Verify & redeem gift' }).click()
  await expect(billing.getByRole('heading', { name: 'LAAP Pro' })).toBeVisible()
  await billing.getByRole('button', { name: 'Close billing' }).click()
  await expect(page.getByText('3 Profiles', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select Alpha' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(settings.locator('.brand-edition-name')).toHaveText('Pro')
  await expect(settings.getByRole('heading', { name: 'LAAP Pro', exact: true })).toBeVisible()
  await expect(settings.getByText(/Offline access valid through/)).toBeVisible()
  await settings.getByRole('button', { name: 'Manage billing' }).click()
  await expect(billing.getByRole('button', { name: 'Check license' })).toBeVisible()
  await expect(billing.getByRole('button', { name: 'Transfer PC' })).toBeEnabled()
})

async function mockCheckout(page: Page) {
  await page.addInitScript(() => {
    const calls: { command: string; args: Record<string, unknown> }[] = []
    let signedIn = false
    let pro = false
    const status = () => ({ available: true, signedIn, pro })
    Object.assign(window, {
      billingCalls: calls,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command.startsWith('billing_') && command !== 'billing_status') calls.push({ command, args })
          switch (command) {
            case 'billing_status': return status()
            case 'list_local_accounts': return []
            case 'billing_verify_email':
              if (args.code !== '12345678') throw 'Invalid email code.'
              signedIn = true
              return status()
            case 'billing_open_page':
              if (!signedIn) throw 'Verify your billing email to continue.'
              return null
            case 'billing_transfer':
              if (!signedIn || args.code !== '87654321') throw 'A fresh transfer code is required.'
              pro = true
              return status()
            case 'billing_activate':
              pro = true
              return status()
          }
          return null
        },
      },
    })
  })
}

test('upgrade carries the chosen plan through email verification into checkout', async ({ page }, testInfo) => {
  await mockCheckout(page)
  await page.setViewportSize({ width: 960, height: 640 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Upgrade', exact: true }).click()
  const billing = page.getByRole('dialog', { name: 'LAAP billing' })
  await billing.getByRole('radio', { name: '$3 monthly' }).check()
  await billing.screenshot({ path: testInfo.outputPath('upgrade-plans.png') })
  await billing.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(billing).toContainText('Monthly Pro')
  const email = billing.getByLabel('Billing email')
  const send = billing.getByRole('button', { name: 'Send email code' })
  await email.fill('buyer@example.test')
  await send.click()
  const code = billing.getByLabel('Email code', { exact: true })
  await expect(code).toBeFocused()
  await billing.screenshot({ path: testInfo.outputPath('upgrade-verification.png') })
  const verify = billing.getByRole('button', { name: 'Verify & open checkout' })
  await code.fill('000000')
  await verify.click()
  await expect(billing.getByRole('alert')).toContainText('Invalid email code.')
  await code.fill('1234 5678')
  await verify.click()
  await expect(billing.getByRole('heading', { name: 'Complete your upgrade' })).toBeVisible()
  await expect(billing).toContainText('Monthly Pro')
  const calls = () => page.evaluate(() => Reflect.get(window, 'billingCalls'))
  await expect.poll(calls).toContainEqual({ command: 'billing_open_page', args: { plan: 'monthly' } })
  await billing.getByRole('button', { name: 'Activate Pro' }).click()
  await expect(billing.getByRole('heading', { name: 'LAAP Pro' })).toBeVisible()
})

test('transferring from a signed-out computer requires sign-in and a fresh transfer code', async ({ page }, testInfo) => {
  await mockCheckout(page)
  await page.setViewportSize({ width: 960, height: 640 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Upgrade', exact: true }).click()
  const billing = page.getByRole('dialog', { name: 'LAAP billing' })
  const closedHeight = (await billing.boundingBox())!.height
  await billing.getByText('Already have Pro?', { exact: true }).click()
  const transfer = billing.getByRole('button', { name: 'Transfer PC' })
  await expect(transfer).toBeVisible()
  const openHeight = (await billing.boundingBox())!.height
  expect(openHeight - closedHeight).toBeLessThanOrEqual(40)
  const actionTops = await billing.locator('.billing-existing-actions button').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().top),
  )
  expect(actionTops).toHaveLength(3)
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThan(1)
  await billing.screenshot({ path: testInfo.outputPath('upgrade-existing-license.png'), animations: 'disabled' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await transfer.click()
  await expect(billing.locator('.billing-modal-body')).toHaveCSS('animation-name', 'none')
  await billing.getByLabel('Billing email').fill('buyer@example.test')
  const send = billing.getByRole('button', { name: 'Send email code' })
  const code = billing.getByLabel('Email code', { exact: true })
  await send.click()
  await code.fill('12345678')
  await billing.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(billing).toContainText('Request a fresh code')
  await send.click()
  await code.fill('87654321')
  await billing.getByRole('button', { name: 'Confirm transfer' }).click()
  await expect(billing.getByRole('heading', { name: 'LAAP Pro' })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'billingCalls'))).toEqual([
    { command: 'billing_send_code', args: { email: 'buyer@example.test' } },
    { command: 'billing_verify_email', args: { email: 'buyer@example.test', code: '12345678' } },
    { command: 'billing_send_code', args: { email: 'buyer@example.test' } },
    { command: 'billing_transfer', args: { email: 'buyer@example.test', code: '87654321' } },
  ])
})
