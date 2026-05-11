import { useTranslation } from 'react-i18next'
import s from './LangSwitcher.module.css'

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
]

export default function LangSwitcher({ variant = 'navbar' }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) ?? 'fr'

  function change(code) {
    i18n.changeLanguage(code)
  }

  return (
    <div className={`${s.wrap} ${variant === 'mobile' ? s.wrapMobile : ''}`} role="group" aria-label="Choisir la langue">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          className={`${s.btn} ${current === code ? s.btnActive : ''}`}
          onClick={() => change(code)}
          aria-pressed={current === code}
          lang={code}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
