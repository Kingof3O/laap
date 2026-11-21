import { expect, test } from '@playwright/test'
import path from 'node:path'

const TARGET_DIR = 'C:/Users/hessa/.gemini/antigravity/brain/f40ff0ce-a142-445f-822d-95fe6c065d8e/redesigned'

function mockWorkspaceData(page: any, { empty = false, loading = false } = {}) {
  return page.addInitScript(({ empty, loading }) => {
    if (loading) {
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: () => new Promise(() => {}),
        },
      })
      return
    }

    if (empty) {
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: async (cmd: string) => {
            if (cmd === 'list_local_accounts') return []
            if (cmd === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
            return null
          },
        },
      })
      return
    }

    const profiles = [
      {
        id: 'p1',
        name: 'Main - EUW',
        region: 'EUW',
        notes: 'Climbing to Emerald before season split ends. Duo with support main.',
        favorite: true,
        session_status: 'saved',
        has_session: true,
        games: ['league'],
        rank: 'Platinum II',
        riot_id: 'Kingof3O#EUW',
        created_at: '2026-01-01',
        last_used_at: '2026-11-20T18:30:00Z',
      },
      {
        id: 'p2',
        name: 'Smurf - NA',
        region: 'NA',
        notes: 'Off-role practice account for mid lane assassins.',
        favorite: false,
        session_status: 'saved',
        has_session: true,
        games: ['league'],
        rank: 'Gold IV',
        riot_id: 'ShadowBlade#NA1',
        created_at: '2026-02-15',
        last_used_at: '2026-11-19T14:10:00Z',
      },
      {
        id: 'p3',
        name: 'Alt - EUNE',
        region: 'EUNE',
        notes: '',
        favorite: false,
        session_status: 'expired',
        has_session: false,
        games: ['league', 'valorant'],
        rank: 'Unranked',
        valorant_rank: 'Silver 1',
        riot_id: 'Ghost#EUNE',
        created_at: '2026-03-10',
        last_used_at: null,
      },
      {
        id: 'p4',
        name: 'Val Main - EU',
        region: 'EU',
        notes: 'Competitive 5-stack initiator.',
        favorite: true,
        session_status: 'saved',
        has_session: true,
        games: ['valorant'],
        valorant_rank: 'Silver 3',
        riot_id: 'Kingof3O#2516',
        created_at: '2026-04-01',
        last_used_at: '2026-11-20T21:00:00Z',
      },
      {
        id: 'p5',
        name: 'Val Alt - NA',
        region: 'NA',
        notes: '',
        favorite: false,
        session_status: 'saved',
        has_session: true,
        games: ['valorant'],
        valorant_rank: 'Ascendant 1',
        riot_id: 'JettCarry#NA1',
        created_at: '2026-05-12',
        last_used_at: '2026-11-18T19:00:00Z',
      },
    ]

    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args: any) => {
          if (cmd === 'list_local_accounts') return structuredClone(profiles)
          if (cmd === 'runtime_snapshot') return { riot_client: false, league_client: false, league_game: false, valorant_game: false }
          if (cmd === 'fetch_opgg_summoner_stats') {
            if (args.game === 'league') {
              if (args.name?.includes('EUW') || args.riotId?.includes('EUW')) {
                return {
                  game: 'league',
                  formattedRank: 'Platinum II (17 LP)',
                  tier: 'Platinum',
                  rank: 'II',
                  lp: 17,
                  wins: 136,
                  losses: 139,
                  winRate: 49,
                  level: 342,
                  topChampions: [
                    { name: 'Wukong', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/MonkeyKing.png', winRate: 62, count: 38 },
                    { name: 'Diana', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Diana.png', winRate: 54, count: 26 },
                    { name: 'Yasuo', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Yasuo.png', winRate: 50, count: 20 },
                  ],
                }
              }
              return {
                game: 'league',
                formattedRank: 'Gold IV (45 LP)',
                tier: 'Gold',
                rank: 'IV',
                lp: 45,
                wins: 28,
                losses: 12,
                winRate: 70,
                level: 115,
                topChampions: [
                  { name: 'Lee Sin', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/LeeSin.png', winRate: 75, count: 20 },
                  { name: 'Zed', iconUrl: 'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Zed.png', winRate: 65, count: 15 },
                ],
              }
            }
            if (args.game === 'valorant') {
              return {
                game: 'valorant',
                formattedRank: 'Silver 3 (45 RR)',
                tier: 'Silver',
                rank: '3',
                rr: 45,
                wins: 42,
                losses: 38,
                winRate: 53,
                level: 286,
                combatStats: { kd: 1.15, headshotRate: 24 },
                topChampions: [
                  { name: 'Sova', iconUrl: '/valorant-icon.webp', winRate: 58, count: 45 },
                  { name: 'Jett', iconUrl: '/valorant-icon.webp', winRate: 50, count: 25 },
                ],
              }
            }
          }
          return null
        },
      },
    })
  }, { empty, loading })
}

test('capture full desktop workspace - League 1160x760', async ({ page }) => {
  await mockWorkspaceData(page)
  await page.setViewportSize({ width: 1160, height: 760 })
  await page.goto('/')
  await expect(page.locator('.roster-card').first()).toBeVisible()
  await page.locator('.roster-card').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(TARGET_DIR, 'workspace-league-1160.png') })

  const inspector = page.locator('#profile-inspector')
  if (await inspector.isVisible()) {
    await inspector.screenshot({ path: path.join(TARGET_DIR, 'inspector-league-selected.png') })
  }

  const firstCard = page.locator('.roster-card').first()
  await firstCard.screenshot({ path: path.join(TARGET_DIR, 'account-cards-detail.png') })
})

test('capture full desktop workspace - VALORANT 1160x760', async ({ page }) => {
  await mockWorkspaceData(page)
  await page.setViewportSize({ width: 1160, height: 760 })
  await page.goto('/')
  await page.getByRole('button', { name: 'VALORANT', exact: true }).click()
  await expect(page.locator('.roster-card').first()).toBeVisible()
  await page.locator('.roster-card').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(TARGET_DIR, 'workspace-valorant-1160.png') })
})

test('capture narrow desktop layout - 960x760', async ({ page }) => {
  await mockWorkspaceData(page)
  await page.setViewportSize({ width: 960, height: 760 })
  await page.goto('/')
  await page.locator('.roster-card').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(TARGET_DIR, 'workspace-narrow-960.png') })
})

test('capture workspace loading state', async ({ page }) => {
  await mockWorkspaceData(page, { loading: true })
  await page.setViewportSize({ width: 1160, height: 760 })
  await page.goto('/')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(TARGET_DIR, 'workspace-loading-state.png') })
})

test('capture workspace empty state', async ({ page }) => {
  await mockWorkspaceData(page, { empty: true })
  await page.setViewportSize({ width: 1160, height: 760 })
  await page.goto('/')
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(TARGET_DIR, 'workspace-empty-state.png') })
})
