import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import s from './LangSwitcher.module.css'

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
]

export default function LangSwitcher({ variant = 'navbar' }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) ?? 'fr'
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  function change(code) {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  /* Ferme au clic extérieur et à l'échap — uniquement pertinent pour le dropdown desktop */
  useEffect(() => {
    if (variant !== 'navbar' || !open) return
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [variant, open])

  if (variant === 'mobile') {
    return (
      <div className={s.wrapMobile} role="group" aria-label="Choisir la langue">
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

  const currentLabel = LANGS.find(l => l.code === current)?.label ?? 'FR'
  const otherLangs = LANGS.filter(l => l.code !== current)

  return (
    <div className={s.dropdownWrap} ref={wrapRef}>
      <button
        type="button"
        className={s.dropdownTrigger}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choisir la langue"
      >
        {currentLabel}
        <ChevronDown size={13} className={`${s.chevron} ${open ? s.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ul className={s.dropdownMenu} role="listbox">
          {otherLangs.map(({ code, label }) => (
            <li key={code}>
              <button
                type="button"
                className={s.dropdownOption}
                onClick={() => change(code)}
                lang={code}
                role="option"
                aria-selected={false}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
