import React, { createContext, useContext, useEffect, useState } from 'react'

export interface LocaleDefinition {
  code: string
  name: string
  nativeName: string
  isRtl?: boolean
}

export const LEAGUE_LOCALES: LocaleDefinition[] = [
  { code: 'en_US', name: 'English (US)', nativeName: 'English (US)' },
  { code: 'en_GB', name: 'English (UK)', nativeName: 'English (UK)' },
  { code: 'de_DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'es_ES', name: 'Spanish (Spain)', nativeName: 'Español (España)' },
  { code: 'es_MX', name: 'Spanish (LatAm)', nativeName: 'Español (Latinoamérica)' },
  { code: 'fr_FR', name: 'French', nativeName: 'Français' },
  { code: 'it_IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pl_PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'el_GR', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'ro_RO', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu_HU', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'cs_CZ', name: 'Czech', nativeName: 'Čeština' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'ja_JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko_KR', name: 'Korean', nativeName: '한국어' },
  { code: 'zh_CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh_TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'tr_TR', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ru_RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'vi_VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th_TH', name: 'Thai', nativeName: 'ไทย' },
  { code: 'ar_AE', name: 'Arabic', nativeName: 'العربية (RTL)', isRtl: true },
]

type TranslationKey =
  | 'nav.catalog'
  | 'nav.presets'
  | 'nav.workshop'
  | 'nav.themes'
  | 'nav.party'
  | 'nav.marketplace'
  | 'nav.settings'
  | 'catalog.search_placeholder'
  | 'catalog.all_champions'
  | 'catalog.random_pick'
  | 'catalog.loading'
  | 'settings.title'
  | 'settings.general'
  | 'settings.appearance'
  | 'settings.updates'
  | 'settings.advanced'
  | 'settings.language'
  | 'settings.language_desc'
  | 'common.save'
  | 'common.cancel'
  | 'common.delete'
  | 'common.export'
  | 'common.import'
  | 'common.status'
  | 'common.enabled'
  | 'common.disabled'

const TRANSLATIONS: Record<string, Partial<Record<TranslationKey, string>>> = {
  en_US: {
    'nav.catalog': 'Catalog',
    'nav.presets': 'Presets',
    'nav.workshop': 'Creator Workshop',
    'nav.themes': 'Themes',
    'nav.party': 'Party Sync',
    'nav.marketplace': 'Marketplace',
    'nav.settings': 'Settings',
    'catalog.search_placeholder': 'Search champions or skins...',
    'catalog.all_champions': 'All Champions',
    'catalog.random_pick': 'Random Pick',
    'catalog.loading': 'Loading catalog...',
    'settings.title': 'Studio Settings',
    'settings.general': 'General',
    'settings.appearance': 'Appearance',
    'settings.updates': 'Updates',
    'settings.advanced': 'Integrations & Advanced',
    'settings.language': 'Application Language',
    'settings.language_desc': 'Select your preferred language for the LAAP application UI and League client catalog.',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.status': 'Status',
    'common.enabled': 'Enabled',
    'common.disabled': 'Disabled',
  },
  de_DE: {
    'nav.catalog': 'Katalog',
    'nav.presets': 'Voreinstellungen',
    'nav.workshop': 'Entwickler-Werkstatt',
    'nav.themes': 'Designs',
    'nav.party': 'Gruppensynchronisierung',
    'nav.marketplace': 'Marktplatz',
    'nav.settings': 'Einstellungen',
    'catalog.search_placeholder': 'Champions oder Skins suchen...',
    'catalog.all_champions': 'Alle Champions',
    'catalog.random_pick': 'Zufallsauswahl',
    'catalog.loading': 'Katalog wird geladen...',
    'settings.title': 'Studio-Einstellungen',
    'settings.general': 'Allgemein',
    'settings.appearance': 'Erscheinungsbild',
    'settings.updates': 'Aktualisierungen',
    'settings.advanced': 'Integrationen & Erweitert',
    'settings.language': 'Programmsprache',
    'settings.language_desc': 'Wählen Sie Ihre bevorzugte Sprache für die LAAP-Benutzeroberfläche und den League-Katalog.',
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.delete': 'Löschen',
    'common.export': 'Exportieren',
    'common.import': 'Importieren',
    'common.status': 'Status',
    'common.enabled': 'Aktiviert',
    'common.disabled': 'Deaktiviert',
  },
  es_ES: {
    'nav.catalog': 'Catálogo',
    'nav.presets': 'Ajustes preestablecidos',
    'nav.workshop': 'Taller del Creador',
    'nav.themes': 'Temas',
    'nav.party': 'Sincronización de Grupo',
    'nav.marketplace': 'Mercado',
    'nav.settings': 'Configuración',
    'catalog.search_placeholder': 'Buscar campeones o aspectos...',
    'catalog.all_champions': 'Todos los campeones',
    'catalog.random_pick': 'Selección aleatoria',
    'catalog.loading': 'Cargando catálogo...',
    'settings.title': 'Configuración de Studio',
    'settings.general': 'General',
    'settings.appearance': 'Apariencia',
    'settings.updates': 'Actualizaciones',
    'settings.advanced': 'Integraciones y avanzado',
    'settings.language': 'Idioma de la aplicación',
    'settings.language_desc': 'Seleccione su idioma preferido para la interfaz de LAAP y el catálogo de League.',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.export': 'Exportar',
    'common.import': 'Importar',
    'common.status': 'Estado',
    'common.enabled': 'Habilitado',
    'common.disabled': 'Deshabilitado',
  },
  fr_FR: {
    'nav.catalog': 'Catalogue',
    'nav.presets': 'Préréglages',
    'nav.workshop': 'Atelier des Créateurs',
    'nav.themes': 'Thèmes',
    'nav.party': 'Sync de Groupe',
    'nav.marketplace': 'Marché',
    'nav.settings': 'Paramètres',
    'catalog.search_placeholder': 'Rechercher des champions ou des skins...',
    'catalog.all_champions': 'Tous les champions',
    'catalog.random_pick': 'Choix aléatoire',
    'catalog.loading': 'Chargement du catalogue...',
    'settings.title': 'Paramètres de Studio',
    'settings.general': 'Général',
    'settings.appearance': 'Apparence',
    'settings.updates': 'Mises à jour',
    'settings.advanced': 'Intégrations et avancé',
    'settings.language': "Langue de l'application",
    'settings.language_desc': "Sélectionnez votre langue pour l'interface de LAAP et le catalogue League.",
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.export': 'Exporter',
    'common.import': 'Importer',
    'common.status': 'Statut',
    'common.enabled': 'Activé',
    'common.disabled': 'Désactivé',
  },
  ar_AE: {
    'nav.catalog': 'الكتالوج',
    'nav.presets': 'الإعدادات المسبقة',
    'nav.workshop': 'ورشة المبتكرين',
    'nav.themes': 'السمات والمظهر',
    'nav.party': 'مزامنة المجموعة',
    'nav.marketplace': 'المتجر المجتمعي',
    'nav.settings': 'الإعدادات',
    'catalog.search_placeholder': 'البحث عن أبطال أو مظاهر...',
    'catalog.all_champions': 'جميع الأبطال',
    'catalog.random_pick': 'اختيار عشوائي',
    'catalog.loading': 'جارٍ تحميل الكتالوج...',
    'settings.title': 'إعدادات الاستوديو',
    'settings.general': 'عام',
    'settings.appearance': 'المظهر',
    'settings.updates': 'التحديثات',
    'settings.advanced': 'عمليات الدمج والميزات المتقدمة',
    'settings.language': 'لغة التطبيق',
    'settings.language_desc': 'اختر لغتك المفضلة لواجهة تطبيق LAAP وكتالوج عميل League.',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.export': 'تصدير',
    'common.import': 'استيراد',
    'common.status': 'الحالة',
    'common.enabled': 'مفعل',
    'common.disabled': 'معطل',
  },
}

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
      return localStorage.getItem('laap_ui_locale') || 'en_US'
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
    setLocaleState(newLocale)
  }

  function t(key: TranslationKey): string {
    const langDict = TRANSLATIONS[locale]
    if (langDict && langDict[key]) {
      return langDict[key]!
    }
    // Fallback to base language (e.g. es_MX -> es_ES)
    const baseLang = locale.split('_')[0]
    for (const [code, dict] of Object.entries(TRANSLATIONS)) {
      if (code.startsWith(baseLang) && dict[key]) {
        return dict[key]!
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
