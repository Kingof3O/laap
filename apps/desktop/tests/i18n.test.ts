import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAGUE_LOCALES, TRANSLATIONS, type TranslationKey } from '../src/context/i18nData.ts'

test('i18n 22 League client locales comprehensive coverage', async (t) => {
  await t.test('declares all 22 official League client locales', () => {
    assert.equal(LEAGUE_LOCALES.length, 22)
    const codes = new Set(LEAGUE_LOCALES.map((l) => l.code))
    assert.equal(codes.size, 22)
    assert.ok(codes.has('en_US'))
    assert.ok(codes.has('en_GB'))
    assert.ok(codes.has('de_DE'))
    assert.ok(codes.has('es_ES'))
    assert.ok(codes.has('es_MX'))
    assert.ok(codes.has('fr_FR'))
    assert.ok(codes.has('it_IT'))
    assert.ok(codes.has('pl_PL'))
    assert.ok(codes.has('el_GR'))
    assert.ok(codes.has('ro_RO'))
    assert.ok(codes.has('hu_HU'))
    assert.ok(codes.has('cs_CZ'))
    assert.ok(codes.has('pt_BR'))
    assert.ok(codes.has('ja_JP'))
    assert.ok(codes.has('ko_KR'))
    assert.ok(codes.has('zh_CN'))
    assert.ok(codes.has('zh_TW'))
    assert.ok(codes.has('tr_TR'))
    assert.ok(codes.has('ru_RU'))
    assert.ok(codes.has('vi_VN'))
    assert.ok(codes.has('th_TH'))
    assert.ok(codes.has('ar_AE'))
  })

  await t.test('Arabic locale has isRtl flag enabled', () => {
    const ar = LEAGUE_LOCALES.find((l) => l.code === 'ar_AE')
    assert.ok(ar)
    assert.equal(ar.isRtl, true)
  })

  await t.test('every one of the 22 locales has non-empty translations for all 26 keys', () => {
    const keys: TranslationKey[] = [
      'nav.catalog',
      'nav.presets',
      'nav.workshop',
      'nav.themes',
      'nav.party',
      'nav.marketplace',
      'nav.settings',
      'catalog.search_placeholder',
      'catalog.all_champions',
      'catalog.random_pick',
      'catalog.loading',
      'settings.title',
      'settings.general',
      'settings.appearance',
      'settings.updates',
      'settings.advanced',
      'settings.language',
      'settings.language_desc',
      'common.save',
      'common.cancel',
      'common.delete',
      'common.export',
      'common.import',
      'common.status',
      'common.enabled',
      'common.disabled',
    ]

    for (const locale of LEAGUE_LOCALES) {
      const dict = TRANSLATIONS[locale.code]
      assert.ok(dict, `Missing translation dictionary for locale: ${locale.code}`)
      for (const key of keys) {
        const val = dict[key]
        assert.ok(
          typeof val === 'string' && val.trim().length > 0,
          `Locale ${locale.code} missing or empty string for key "${key}"`,
        )
      }
    }
  })
})
