import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { getCategories } from '../../../services/products.service.js'
import { normalizeLocale } from '../../../utils/locale.js'
import s from './CategoryNav.module.css'

export default function CategoryNav() {
  const { i18n }   = useTranslation()
  const location   = useLocation()

  const [parents,     setParents]     = useState([])
  const [childrenMap, setChildrenMap] = useState({})
  const [scrolled,    setScrolled]    = useState(false)
  const [openId,      setOpenId]      = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 })
  const closeTimer = useRef(null)

  useEffect(() => {
    getCategories(normalizeLocale(i18n.language))
      .then(res => {
        const all = res.data ?? []
        const ps  = all.filter(c => !c.parent_id)
        const cmap = {}
        all.filter(c => c.parent_id).forEach(c => {
          if (!cmap[c.parent_id]) cmap[c.parent_id] = []
          cmap[c.parent_id].push(c)
        })
        setParents(ps)
        setChildrenMap(cmap)
      })
      .catch(() => {})
  }, [i18n.language])

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 72) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Ferme le dropdown au changement de page */
  useEffect(() => { setOpenId(null) }, [location.pathname])

  const handleEnter = useCallback((id, liEl) => {
    clearTimeout(closeTimer.current)
    const rect = liEl.getBoundingClientRect()
    setDropdownPos({ left: rect.left, top: rect.bottom })
    setOpenId(id)
  }, [])

  const handleLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpenId(null), 120)
  }, [])

  const handleDropdownEnter = useCallback(() => {
    clearTimeout(closeTimer.current)
  }, [])

  const activeSlug = location.pathname.split('/catalogue/')[1]?.split('?')[0] ?? ''
  const openCat    = parents.find(p => p.id === openId)
  const openChildren = openId ? (childrenMap[openId] ?? []) : []

  return (
    <>
      <div
        className={`${s.bar} ${scrolled ? s.barScrolled : ''}`}
        role="navigation"
        aria-label="Navigation par catégories"
      >
        <div className={s.scroll}>
          <ul className={s.list} role="list">
            <li className={s.item}>
              <Link
                to="/catalogue"
                className={`${s.link} ${!activeSlug ? s.linkActive : ''}`}
              >
                Tout voir
              </Link>
            </li>

            {parents.map(cat => {
              const children    = childrenMap[cat.id] ?? []
              const hasChildren = children.length > 0
              const isActive    = activeSlug === cat.slug
                || children.some(c => c.slug === activeSlug)

              return (
                <li
                  key={cat.id}
                  className={s.item}
                  onMouseEnter={hasChildren ? e => handleEnter(cat.id, e.currentTarget) : undefined}
                  onMouseLeave={hasChildren ? handleLeave : undefined}
                >
                  <Link
                    to={`/catalogue/${cat.slug}`}
                    className={`${s.link} ${isActive ? s.linkActive : ''} ${openId === cat.id ? s.linkHovered : ''}`}
                    aria-haspopup={hasChildren ? 'true' : undefined}
                    aria-expanded={hasChildren ? openId === cat.id : undefined}
                  >
                    {cat.name}
                    {hasChildren && (
                      <ChevronDown
                        size={12}
                        className={`${s.chevron} ${openId === cat.id ? s.chevronOpen : ''}`}
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Dropdown rendu en dehors du scroll wrapper pour éviter le clipping overflow */}
      {openId && openCat && (
        <div
          className={s.dropdown}
          style={{ left: dropdownPos.left, top: dropdownPos.top }}
          onMouseEnter={handleDropdownEnter}
          onMouseLeave={handleLeave}
          role="region"
          aria-label={`Sous-catégories de ${openCat.name}`}
        >
          <div className={s.dropdownInner}>
            <Link to={`/catalogue/${openCat.slug}`} className={s.dropdownParentLink}>
              Tout — {openCat.name}
            </Link>
            <ul className={s.subList} role="list">
              {openChildren.map(child => (
                <li key={child.id}>
                  <Link
                    to={`/catalogue/${child.slug}`}
                    className={`${s.subLink} ${activeSlug === child.slug ? s.subLinkActive : ''}`}
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
