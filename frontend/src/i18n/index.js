import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import frCommon from './fr/common.json'
import deCommon from './de/common.json'
import enCommon from './en/common.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: frCommon },
      de: { common: deCommon },
      en: { common: enCommon },
    },
    /* Français par défaut — marché Suisse romand prioritaire */
    fallbackLng: 'fr',
    defaultNS: 'common',
    /* Normalise fr-FR → fr, de-CH → de, etc. */
    load: 'languageOnly',
    /* Détection : localStorage → navigator → 'fr' */
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
