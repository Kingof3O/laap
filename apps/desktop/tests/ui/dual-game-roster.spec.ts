import { expect as defaultExpect, test, type Page } from '@playwright/test'

const expect = defaultExpect.configure({ timeout: 15_000 })

async function mockRoster(page: Page, { leagueSeason = false, extraLeagueProfiles = 0 } = {}) {
  await page.addInitScript(({ leagueSeason, extraLeagueProfiles }) => {
    const defaults = {
      region: 'NA', notes: '', favorite: false, session_status: 'saved',
      has_session: true, created_at: '2026-01-01', last_used_at: null,
    }
    const profiles = [
      { ...defaults, id: 'legacy', name: 'Legacy League', rank: 'Silver II', riot_id: leagueSeason ? 'Legacy#NA1' : null },
      { ...defaults, id: 'dual', name: 'Both Games', games: ['league', 'valorant'], rank: 'Diamond II' },
      { ...defaults, id: 'valorant', name: 'VALORANT Main', riot_id: 'Jett#NA1', games: ['valorant'], valorant_rank: null },
      ...Array.from({ length: extraLeagueProfiles }, (_, index) => ({
        ...defaults, id: `extra-${index}`, name: `Extra ${index}`, favorite: index < 2,
      })),
    ]
    const requests: Record<string, unknown>[] = []
    const edits: Record<string, unknown>[] = []
    const launches: Record<string, unknown>[] = []
    let runningGame: unknown
    let resolveStats: (value: unknown) => void = () => {}
    const stats = new Promise((resolve) => { resolveStats = resolve })
    Object.assign(window, {
      opggRequests: requests,
      profileEdits: edits,
      launchRequests: launches,
      resolveStats: () => resolveStats({
        formattedRank: 'Ascendant 1', tier: 'Ascendant', rank: '1',
        game: 'valorant', level: 198,
      }),
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === 'list_local_accounts') return structuredClone(profiles)
          if (command === 'update_tray') Reflect.set(window, 'traySnapshot', args.snapshot)
          if (command === 'runtime_snapshot') return {
            riot_client: Boolean(runningGame),
            league_client: runningGame === 'league',
            league_game: false,
            valorant_game: runningGame === 'valorant',
          }
          if (command === 'launch_local_account') {
            launches.push(args)
            runningGame = args.game
          }
          if (command === 'edit_local_account') {
            const profile = profiles.find(({ id }) => id === args.id)
            if (profile) Object.assign(profile, args.details)
            edits.push(args)
            return null
          }
          if (command === 'update_account_riot_id') {
            const profile = profiles.find(({ id }) => id === args.id)
            if (profile) Object.assign(profile, { riot_id: args.riotId })
            return Boolean(profile)
          }
          if (command === 'open_external_url') Reflect.set(window, 'openedProfileUrl', args.url)
          if (command === 'fetch_opgg_summoner_stats') {
            requests.push(args)
            if (args.game === 'league') return { game: 'league', formattedRank: 'Silver II', wins: 136, losses: 139, winRate: 49 }
            return stats
          }
          if (command === 'apply_opgg_profile') return false
          return null
        },
      },
    })
  }, { leagueSeason, extraLeagueProfiles })
}

test('the redesigned inspector keeps icon actions and game-specific stats usable at 960px', async ({ page }, testInfo) => {
  await mockRoster(page, { leagueSeason: true })
  await page.setViewportSize({ width: 960, height: 760 })
  await page.goto('/')
  const inspector = page.getByRole('complementary', { name: 'Selected profile details' })
  await page.getByRole('button', { name: 'Select Legacy League' }).click()
  const season = inspector.getByRole('region', { name: 'Season stats' })
  await expect(season).toContainText('49% win rate')
  await expect(season.locator('.season-record-bar')).toBeVisible()
  const launch = inspector.getByRole('button', { name: 'Launch Legacy League' })
  expect((await launch.boundingBox())!.y).toBeLessThan((await season.boundingBox())!.y)
  await expect(inspector.getByText('Profile added')).toBeVisible()
  await expect(inspector.getByText('No notes added.')).toBeVisible()

  const edit = inspector.getByRole('button', { name: 'Manage profile' })
  await expect(edit).toHaveText('')
  await edit.click()
  await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeVisible()
  await page.keyboard.press('Escape')
  const open = season.getByRole('button', { name: 'View on OP.GG' })
  await expect(open).toHaveText('')
  await open.click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'openedProfileUrl')))
    .toBe('https://op.gg/lol/summoners/na/Legacy-NA1')
  await season.getByRole('button', { name: 'Change linked Riot ID' }).click()
  const riotId = season.getByRole('textbox', { name: 'Riot ID' })
  await expect(riotId).toBeFocused()
  await riotId.fill('LegacyNew#NA1')
  await season.getByRole('button', { name: 'Save Riot ID' }).click()
  await expect(season.getByText('LegacyNew#NA1')).toBeVisible()
  await expect(season).toContainText('49% win rate')
  await inspector.screenshot({ path: testInfo.outputPath('league-inspector-960.png') })

  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  await page.getByRole('button', { name: 'Select VALORANT Main' }).click()
  await page.evaluate(() => Reflect.get(window, 'resolveStats')())
  await expect(inspector.locator('.inspector-rank')).toContainText('Ascendant 1')
  await expect(season.getByText('Account level')).toBeVisible()
  await expect(season.getByText('198', { exact: true })).toBeVisible()
  await expect(season.locator('.season-record-bar')).toHaveCount(0)
  await expect(inspector.getByRole('button', { name: /check live match/i })).toHaveCount(0)
  await expect.poll(() => inspector.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await inspector.screenshot({ path: testInfo.outputPath('valorant-inspector-960.png') })
})

test('roster cards fill every row as the available width and account count change', async ({ page }) => {
  await mockRoster(page, { extraLeagueProfiles: 4 })
  await page.setViewportSize({ width: 1720, height: 900 })
  await page.goto('/')
  const roster = page.getByRole('region', { name: 'Account Roster' })
  await expect(roster.locator('.roster-card')).toHaveCount(6)

  const measureRows = () => roster.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const rows: { top: number; cards: DOMRect[] }[] = []
    for (const card of element.children) {
      const rect = card.getBoundingClientRect()
      const row = rows.at(-1)
      if (row && Math.abs(row.top - rect.top) < 1) row.cards.push(rect)
      else rows.push({ top: rect.top, cards: [rect] })
    }
    return rows.map(({ cards }) => {
      const touchesRight = Math.abs(cards[cards.length - 1].right - bounds.right) < 1
      const cappedByMaxWidth = cards.every((card) => card.width <= 520 + 1)
      return {
        count: cards.length,
        fillsRow: Math.abs(cards[0].left - bounds.left) < 1 && (touchesRight || cappedByMaxWidth),
        equalWidths: cards.every((card) => Math.abs(card.width - cards[0].width) < 1),
      }
    })
  })
  const expectRows = async (...counts: number[]) => {
    await expect.poll(measureRows).toEqual(counts.map((count) => ({ count, fillsRow: true, equalWidths: true })))
  }

  await expectRows(4, 2)
  await page.setViewportSize({ width: 1400, height: 900 })
  await expectRows(3, 3)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expectRows(2, 2, 2)
  await page.setViewportSize({ width: 960, height: 900 })
  await expectRows(1, 1, 1, 1, 1, 1)
  await page.getByRole('button', { name: 'Hide details' }).click()
  await expectRows(2, 2, 2)
  const search = page.getByRole('textbox', { name: 'Search accounts or regions' })
  await page.setViewportSize({ width: 1720, height: 900 })
  await page.getByRole('button', { name: 'Show details' }).click()
  const starred = page.getByRole('button', { name: 'Filter starred accounts' })
  await starred.click()
  await expectRows(2)
  await search.fill('extra 1')
  await expectRows(1)
})

test('the compact toolbar stays on one row and cards chart the linked season record', async ({ page }, testInfo) => {
  await mockRoster(page, { leagueSeason: true })
  await page.setViewportSize({ width: 960, height: 700 })
  await page.goto('/')
  const ranked = page.locator('.roster-card').filter({ hasText: 'Legacy League' })
  await expect(ranked).toContainText('49% win rate')
  await expect(ranked).toContainText('136W · 139L')
  await expect(page.locator('.roster-card .season-record')).toHaveCount(1)
  await expect(ranked.locator('.card-rank-emblem .rank-crest')).toHaveCSS('width', '44px')
  const fill = await ranked.locator('.season-record-bar span').evaluate((bar) =>
    bar.getBoundingClientRect().width / bar.parentElement!.getBoundingClientRect().width,
  )
  expect(fill).toBeCloseTo(136 / 275, 2)

  const gameButtons = page.getByRole('group', { name: 'Active game' }).getByRole('button')
  await expect(gameButtons).toHaveText(['', ''])
  await page.getByRole('textbox', { name: 'Search accounts or regions' }).fill('League')
  const toolbar = page.locator('.sub-navbar')
  const controls = toolbar.locator('.game-toggle, .search-box, .star-filter-btn, select, .toolbar-reset-btn, .view-mode-toggle, .btn-add-primary')
  for (const width of [960, 1024, 1200, 1524]) {
    await page.setViewportSize({ width, height: 700 })
    const boxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const { top, right, height } = element.getBoundingClientRect()
        return { middle: top + height / 2, right }
      }),
    )
    expect(boxes).toHaveLength(9)
    expect(Math.max(...boxes.map(({ middle }) => middle)) - Math.min(...boxes.map(({ middle }) => middle))).toBeLessThan(2)
    expect(boxes.every(({ right }) => right <= width)).toBe(true)
  }
  await page.setViewportSize({ width: 960, height: 700 })
  await page.screenshot({ path: testInfo.outputPath('toolbar-and-card-960.png') })
  for (const label of ['Filter by region', 'Filter by rank', 'Sort by']) {
    const dropdown = page.getByRole('combobox', { name: label })
    const option = dropdown.locator('option').nth(1)
    await expect(option).toHaveCSS('color', 'rgb(241, 228, 255)')
    await expect(option).toHaveCSS('background-color', 'rgb(36, 29, 52)')
    if (await dropdown.evaluate(() => CSS.supports('appearance: base-select') && CSS.supports('selector(::picker(select))'))) {
      await dropdown.click()
      await expect.poll(() => dropdown.evaluate((element) => element.matches(':open'))).toBe(true)
      if (label === 'Sort by') await page.screenshot({ path: testInfo.outputPath('toolbar-dropdown-960.png') })
      await page.keyboard.press('Escape')
    }
  }
  await page.reload()
  await expect(ranked).toContainText('49% win rate')
})

test('dual-game cards, table, and rank filters agree while background ranks arrive', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await mockRoster(page)
  await page.setViewportSize({ width: 960, height: 700 })
  await page.goto('/')
  const cards = page.getByRole('region', { name: 'Account Roster' }).locator('.roster-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Both Games' })).toContainText('Diamond II')
  await expect(cards.filter({ hasText: 'Legacy League' })).toBeVisible()
  await expect(cards.filter({ hasText: 'VALORANT Main' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Hide details' }).click()
  const valorant = page.getByRole('button', { name: 'VALORANT', exact: true })
  await valorant.click()
  await expect(valorant).toHaveAttribute('aria-pressed', 'true')
  const rankFilter = page.getByRole('combobox', { name: 'Filter by rank' })
  await expect(rankFilter).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toBeInViewport({ ratio: 1 })
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Legacy League' })).toHaveCount(0)
  await expect(cards.filter({ hasText: 'Both Games' })).not.toContainText('Diamond II')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'traySnapshot')?.accounts?.map((account: { id: string }) => account.id))).toEqual(['dual', 'valorant'])
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('laap:tray-intent', {
    detail: { type: 'switch_account', id: 'legacy' },
  })))
  await expect(page.getByText('That profile is unavailable for the selected game.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'launchRequests'))).toEqual([])
  const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
  expect(first!.y).toBe(second!.y)
  expect(second!.x + second!.width).toBeLessThanOrEqual(960)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'opggRequests'))).toEqual([
    { summonerName: 'Jett', tagLine: 'NA1', game: 'valorant', region: 'na' },
  ])
  await page.evaluate(() => Reflect.get(window, 'resolveStats')())
  const rankedCard = cards.filter({ hasText: 'VALORANT Main' })
  await expect(rankedCard).toContainText('Ascendant 1')
  const crest = rankedCard.locator('img[src="/rank-crests/valorant/ascendant_1.png"]')
  await expect.poll(() => crest.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('valorant-grid-960.png') })

  await page.getByRole('button', { name: 'List View' }).click()
  const rows = page.locator('.roster-table tbody tr')
  await expect(rows.filter({ hasText: 'Both Games' })).toContainText('Unranked')
  await page.getByRole('button', { name: 'Sort by Rank' }).click()
  await expect(rows.first()).toContainText('VALORANT Main')
  await rankFilter.selectOption('rank:ascendant 1')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('VALORANT Main')
  await expect(rows.first().getByRole('button', { name: 'Remove Account' })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('valorant-table-960.png') })

  await page.reload()
  await expect(valorant).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.filter({ hasText: 'VALORANT Main' })).toContainText('Ascendant 1')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'opggRequests'))).toEqual([])
})

test('a late VALORANT stats response cannot populate the League inspector', async ({ page }) => {
  test.setTimeout(60_000)
  await mockRoster(page)
  await page.goto('/')
  const inspector = page.getByRole('complementary', { name: 'Selected profile details' })
  await expect(inspector).toContainText('Both Games')
  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  await page.getByRole('button', { name: 'Select VALORANT Main', exact: true }).click()
  await expect(inspector).toContainText('VALORANT Main')
  await expect(inspector.getByRole('button', { name: 'Refresh season stats' })).toBeDisabled()
  await page.getByRole('button', { name: 'League of Legends', exact: true }).click()
  await expect(inspector).toContainText('Both Games')
  await page.evaluate(() => Reflect.get(window, 'resolveStats')())
  await expect(inspector).toContainText('No Riot ID linked')
  await expect(inspector).not.toContainText('Ascendant 1')
  await expect(inspector).toContainText('Diamond II')
})

test('editing to VALORANT-only saves the correct rank and switches the roster', async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await mockRoster(page)
  await page.setViewportSize({ width: 960, height: 640 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit Both Games', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Profile' })
  const league = dialog.getByRole('checkbox', { name: 'League of Legends' })
  const valorant = dialog.getByRole('checkbox', { name: 'VALORANT', exact: true })
  await expect(league).toBeChecked()
  await expect(valorant).toBeChecked()
  await league.uncheck()
  await expect(valorant).toBeDisabled()
  await expect.poll(() => dialog.locator('.profile-col-primary').evaluate((column) =>
    column.getBoundingClientRect().width / column.parentElement!.getBoundingClientRect().width,
  )).toBeGreaterThan(0.95)
  const rank = dialog.getByRole('combobox', { name: 'VALORANT rank (optional)' })
  const autoSync = dialog.getByRole('checkbox', { name: 'Auto-sync VALORANT rank from OP.GG' })
  await autoSync.check()
  await expect(rank).toBeDisabled()
  await autoSync.uncheck()
  await rank.fill('Immortal 2')
  await dialog.getByRole('option', { name: 'Immortal 2', exact: true }).click()
  await expect(dialog.locator('.profile-preview')).toContainText('Immortal 2')
  await expect(dialog.locator('.profile-preview')).not.toContainText('Diamond II')
  await page.screenshot({ path: testInfo.outputPath('valorant-editor-960.png') })
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'VALORANT', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.roster-card').filter({ hasText: 'Both Games' })).toContainText('Immortal 2')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'profileEdits'))).toEqual([
    expect.objectContaining({
      id: 'dual',
      details: expect.objectContaining({ games: ['valorant'], rank: null, valorant_rank: 'Immortal 2' }),
    }),
  ])
})

test('a running League client still allows switching the same profile to VALORANT', async ({ page }) => {
  test.setTimeout(60_000)
  await mockRoster(page)
  await page.goto('/')
  const dual = page.locator('.roster-card').filter({ hasText: 'Both Games' })
  await dual.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(dual.getByRole('button', { name: 'Client running' })).toBeDisabled()
  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  await dual.getByRole('button', { name: 'Switch', exact: true }).click()
  await expect(page.getByText('VALORANT detected. Continue in the game.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'launchRequests'))).toEqual([
    { id: 'dual', confirmed: false, game: 'league' },
    { id: 'dual', confirmed: false, game: 'valorant' },
  ])
})

test('displays OP.GG top champions and agents with icons only, hover tooltips, and RR/combat stats parity', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const defaults = {
      region: 'EUW', notes: '', favorite: false, session_status: 'saved',
      has_session: true, created_at: '2026-01-01', last_used_at: null,
    }
    const profiles = [
      { ...defaults, id: 'main-euw', name: 'Main - EUW', rank: 'Platinum II', riot_id: 'Kingof3O#EUW', games: ['league'] },
      { ...defaults, id: 'main-val', name: 'Main - EUNE', valorant_rank: 'Silver 3', riot_id: 'Kingof3O#2516', games: ['valorant'] },
    ]
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === 'list_local_accounts') return structuredClone(profiles)
          if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
          if (command === 'fetch_opgg_summoner_stats') {
            if (args.game === 'league') {
              return {
                game: 'league',
                formattedRank: 'Platinum II (17 LP)',
                wins: 136,
                losses: 139,
                winRate: 49,
                topChampions: [
                  { name: 'Wukong', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/MonkeyKing.png', winRate: 62, count: 38 },
                  { name: 'Diana', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Diana.png', winRate: 54, count: 26 },
                ],
              }
            }
            return {
              game: 'valorant',
              formattedRank: 'Silver 3',
              rr: 64,
              level: 286,
              wins: 42,
              losses: 38,
              winRate: 53,
              combatStats: { kd: 1.15, headshotRate: 26 },
              topChampions: [
                { name: 'Jett', iconUrl: 'https://c-valorant-api.op.gg/Assets/Characters/ADD6443A-41BD-E414-F6AD-E58D267F4E95_small.png', winRate: 58, count: 24 },
              ],
            }
          }
          return null
        },
      },
    })
  })

  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')

  // 1. League profile inspector
  await page.getByRole('button', { name: 'Select Main - EUW' }).click()
  const inspector = page.getByRole('complementary', { name: 'Selected profile details' })
  const season = inspector.getByRole('region', { name: 'Season stats' })
  await expect(season.locator('.inspector-top-heroes-label')).toHaveText('Most Played')
  const leagueHeroPill = season.locator('.inspector-hero-pill').first()
  await expect(leagueHeroPill).toBeVisible()
  await expect(leagueHeroPill).toHaveAttribute('title', 'Wukong · 62% WR (38 games)')
  // Verify icon is rendered, but hero name is NOT visible text
  await expect(leagueHeroPill.locator('.inspector-hero-icon')).toBeVisible()
  await expect(leagueHeroPill).toContainText('62%')
  await expect(leagueHeroPill).not.toContainText('Wukong')

  // 2. Switch to VALORANT and inspect
  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  await page.getByRole('button', { name: 'Select Main - EUNE' }).click()

  // Verify Valorant RR in rank card: Silver 3 (64 RR)
  await expect(inspector.locator('.inspector-rank')).toContainText('Silver 3 (64 RR)')
  // Verify Account level, K/D, HS%
  await expect(season.getByText('Account level')).toBeVisible()
  await expect(season.getByText('286')).toBeVisible()
  await expect(season.getByText('K/D')).toBeVisible()
  await expect(season.getByText('1.15')).toBeVisible()
  await expect(season.getByText('HS%')).toBeVisible()
  await expect(season.getByText('26%')).toBeVisible()
  // Verify Season Record bar
  await expect(season.locator('.season-record-bar')).toBeVisible()
  await expect(season).toContainText('53% win rate')

  // Verify Top Agents: Jett icon + 58% WR, name only in hover tooltip
  await expect(season.locator('.inspector-top-heroes-label')).toHaveText('Top Agents')
  const valHeroPill = season.locator('.inspector-hero-pill').first()
  await expect(valHeroPill).toBeVisible()
  await expect(valHeroPill).toHaveAttribute('title', 'Jett · 58% WR (24 games)')
  await expect(valHeroPill.locator('.inspector-hero-icon')).toBeVisible()
  await expect(valHeroPill).toContainText('58%')
  await expect(valHeroPill).not.toContainText('Jett')

  await page.screenshot({ path: testInfo.outputPath('opgg-top-heroes-and-val-rr.png') })
})

test('account cards display top 3 most-played champions on the right side of rank with hover tooltips and login saved in bottom row', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const defaults = {
      region: 'EUW', notes: '', favorite: false, session_status: 'saved',
      has_session: true, created_at: '2026-01-01', last_used_at: null,
    }
    const profiles = [
      { ...defaults, id: 'main-euw', name: 'Main - EUW', rank: 'Platinum II', riot_id: 'Kingof3O#EUW', games: ['league'] },
      { ...defaults, id: 'main-val', name: 'Main - EUNE', valorant_rank: 'Silver 3', riot_id: 'Kingof3O#2516', games: ['valorant'] },
    ]
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === 'list_local_accounts') return structuredClone(profiles)
          if (command === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
          if (command === 'fetch_opgg_summoner_stats') {
            if (args.game === 'league') {
              return {
                game: 'league',
                formattedRank: 'Platinum II (17 LP)',
                wins: 136,
                losses: 139,
                winRate: 49,
                topChampions: [
                  { name: 'Wukong', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/MonkeyKing.png', winRate: 62, count: 38 },
                  { name: 'Diana', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Diana.png', winRate: 54, count: 26 },
                  { name: 'Yasuo', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Yasuo.png', winRate: 50, count: 20 },
                ],
              }
            }
            return {
              game: 'valorant',
              formattedRank: 'Silver 3',
              wins: 42,
              losses: 38,
              winRate: 53,
            }
          }
          return null
        },
      },
    })
  })

  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')

  // 1. Verify League Account Card
  const leagueCard = page.locator('.roster-card').filter({ hasText: 'Main - EUW' })
  await expect(leagueCard).toBeVisible()

  // Verify Top Champions container on the right of rank section
  const cardTopChamps = leagueCard.locator('.card-top-champions')
  await expect(cardTopChamps).toBeVisible()
  await expect(cardTopChamps.locator('.card-top-champions-label')).toHaveText('Most Played')

  const champItems = cardTopChamps.locator('.card-champion-item')
  await expect(champItems).toHaveCount(3)

  // Verify first champion (Wukong)
  const wukong = champItems.first()
  await expect(wukong.locator('.card-champion-img')).toBeVisible()
  await expect(wukong).toHaveAttribute('title', 'Wukong · 62% WR (38 games)')

  // Hover over Wukong to trigger premium tooltip
  await wukong.hover()
  const tooltip = wukong.locator('.card-champion-tooltip')
  await expect(tooltip).toBeVisible()
  await expect(tooltip.locator('.card-champion-tooltip-name')).toHaveText('Wukong')
  await expect(tooltip.locator('.card-champion-tooltip-games')).toHaveText('38 games')
  await expect(tooltip.locator('.card-champion-tooltip-wr')).toHaveText('62% WR')

  // Verify Login saved status pill is in the bottom row
  const bottomMeta = leagueCard.locator('.card-bottom-row .card-bottom-meta')
  await expect(bottomMeta.locator('.card-status-pill')).toContainText('Login saved')

  // 2. Switch to VALORANT and verify champion section is not rendered
  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  const valCard = page.locator('.roster-card').filter({ hasText: 'Main - EUNE' })
  await expect(valCard).toBeVisible()
  await expect(valCard.locator('.card-top-champions')).toHaveCount(0)

  await page.screenshot({ path: testInfo.outputPath('card-top-champions.png') })
})
