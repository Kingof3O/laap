import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  LEAGUE_LOCALES,
  TRANSLATIONS,
  type LocaleDefinition,
  type TranslationKey,
} from './i18nData'

export { LEAGUE_LOCALES, TRANSLATIONS, type LocaleDefinition, type TranslationKey }

interface I18nContextType {
  locale: string
  setLocale: (code: string) => void
  t: (key: TranslationKey) => string
  isRtl: boolean
  locales: LocaleDefinition[]
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en_US',
  setLocale: () => {},
  t: (key) => key,
  isRtl: false,
  locales: LEAGUE_LOCALES,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('laap_ui_locale')
      return LEAGUE_LOCALES.some(item => item.code === saved) ? saved! : 'en_US'
    } catch {
      return 'en_US'
    }
  })

  const isRtl = locale === 'ar_AE' || locale.startsWith('ar')

  useEffect(() => {
    try {
      localStorage.setItem('laap_ui_locale', locale)
    } catch {
      // ignore localstorage errors
    }
    document.documentElement.lang = locale.replace('_', '-')
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
  }, [locale, isRtl])

  function setLocale(newLocale: string) {
    if (LEAGUE_LOCALES.some(item => item.code === newLocale)) setLocaleState(newLocale)
  }

  function t(key: TranslationKey): string {
    const langDict = TRANSLATIONS[locale]
    if (langDict && langDict[key]) {
      return langDict[key]
    }
    // Fallback to base language (e.g. es_MX -> es_ES)
    const baseLang = locale.split('_')[0]
    for (const [code, dict] of Object.entries(TRANSLATIONS)) {
      if (code.startsWith(baseLang) && dict[key]) {
        return dict[key]
      }
    }
    // Default fallback to en_US
    return TRANSLATIONS.en_US[key] || key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, isRtl, locales: LEAGUE_LOCALES }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
