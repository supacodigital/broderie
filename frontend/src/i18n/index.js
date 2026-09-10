import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import frCommon from './fr/common.json'

/* Site 100 % francophone — marché Suisse romand. i18next est conservé pour
   la structure des textes (t('clé')) et un éventuel ajout de langue plus tard,
   mais une seule ressource est chargée et il n'y a pas de détection. */
i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: frCommon },
    },
    lng: 'fr',
    fallbackLng: 'fr',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
