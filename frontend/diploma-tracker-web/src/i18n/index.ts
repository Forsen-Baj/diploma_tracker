import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import uk from './uk.json'

export const LANGUAGE_STORAGE_KEY = 'dt.language'
export const supportedLanguages = ['uk', 'en'] as const
export type Language = (typeof supportedLanguages)[number]

function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'uk'
  } catch {
    return 'uk'
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    uk: { translation: uk },
    en: { translation: en }
  },
  lng: readStoredLanguage(),
  fallbackLng: 'uk',
  interpolation: { escapeValue: false }
})

document.documentElement.lang = i18n.language

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for the session only.
  }
})

export default i18n
