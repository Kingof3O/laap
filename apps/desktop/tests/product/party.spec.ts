import { once } from 'node:events'
import { test, expect } from '@playwright/test'
import { createCommunityServer } from '../../../community-api/src/party'

test('two Chromium clients can create, join and leave a party with consent', async ({ page, browser, baseURL }) => {
  const relay = createCommunityServer({ origins: new Set([new URL(baseURL!).origin]) })
  const context = await browser.newContext()
  try {
    relay.server.listen(4171, '127.0.0.1')
    await once(relay.server, 'listening')
    const guest = await context.newPage()
    for (const member of [page, guest]) {
      await member.addInitScript(() => localStorage.setItem('laap_auto_check_updates', 'false'))
      await member.goto(baseURL!)
      if (process.env.LAAP_TEST_FLAVOR === 'complete') {
        await member.getByRole('button', { name: 'Studio', exact: true }).click()
      }
      await member.getByRole('button', { name: 'Party', exact: true }).click()
      await expect(member.getByRole('button', { name: 'Create room' })).toHaveCount(0)
      await member.getByRole('checkbox', { name: /Connect to the community relay/ }).check()
    }
    await page.getByRole('button', { name: 'Create room' }).click()
    const invite = page.getByRole('heading', { name: /Invite code/ }).locator('code')
    await expect(invite).toHaveText(/^[a-f0-9]{12}$/)
    await guest.getByRole('textbox', { name: 'Invite code' }).fill((await invite.textContent())!)
    await guest.getByRole('button', { name: 'Join room' }).click()
    await expect(page.getByText(/2 member\(s\)/)).toBeVisible()
    await expect(guest.getByText(/2 member\(s\)/)).toBeVisible()
    await guest.getByRole('checkbox', { name: /Connect to the community relay/ }).uncheck()
    await expect(page.getByText(/1 member\(s\)/)).toBeVisible()
  } finally {
    await context.close()
    if (relay.server.listening) await relay.close()
  }
})
