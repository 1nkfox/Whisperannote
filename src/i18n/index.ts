// FILE: src/i18n/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Configure react-i18next with Russian default language and English fallback.
//   SCOPE: i18next instance initialization and exported useTranslation hook for renderer modules.
//   DEPENDS: i18next, react-i18next, src/i18n/resources.ts
//   LINKS: M-I18N, V-M-I18N
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   i18n - initialized i18next instance.
//   changeLanguage - typed wrapper for language switching.
//   useTranslation - react-i18next hook re-export.
// END_MODULE_MAP
import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, resources } from './resources'

export type SupportedLanguage = keyof typeof resources

// START_BLOCK_INIT_I18N
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: {
    escapeValue: false
  },
  returnNull: false
})
// END_BLOCK_INIT_I18N

// START_CONTRACT: changeLanguage
//   PURPOSE: Switch renderer language to a supported locale.
//   INPUTS: { language: SupportedLanguage - target locale }
//   OUTPUTS: Promise<void> - resolves after i18next applies the language
//   SIDE_EFFECTS: updates global i18next language state
//   LINKS: M-I18N, V-M-I18N
// END_CONTRACT: changeLanguage
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(language)
}

export { i18n, useTranslation }
export { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, resources }
