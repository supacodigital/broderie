import { useEffect, useRef, useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { getCategories } from '../../../services/products.service.js'
import { normalizeLocale } from '../../../utils/locale.js'
import s from './CategoryNav.module.css'

export default function CategoryNav() {
  const { i18n, t } = useTranslation()
  const location     = useLocation()

  const [parents,     setParents]     = useState([])
  const [childrenMap, setChildrenMap] = useState({})
  const [openId,      setOpenId]      = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 })

  const closeTimer   = useRef(null)
  const dropdownRef  = useRef(null)
  const triggerRefs  = useRef({})
  const scrollRef    = useRef(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 0)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows)
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows, parents])

  const scrollBy = useCallback((dir) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }, [])

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

  /* Calcule la position du mega-menu en le recadrant pour qu'il ne déborde pas à droite */
  const computePos = useCallback((rect) => {
    const MENU_WIDTH = 360 // largeur min du mega-menu — voir .dropdown
    const MARGIN     = 16  // marge de sécurité par rapport au bord du viewport
    const maxLeft    = window.innerWidth - MENU_WIDTH - MARGIN
    return { left: Math.max(MARGIN, Math.min(rect.left, maxLeft)), top: rect.bottom }
  }, [])

  const openDropdown = useCallback((id, liEl) => {
    clearTimeout(closeTimer.current)
    setDropdownPos(computePos(liEl.getBoundingClientRect()))
    setOpenId(id)
  }, [computePos])

  const closeDropdown = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpenId(null), 120)
  }, [])

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current)
  }, [])

  /* Navigation clavier sur le lien déclencheur */
  const handleTriggerKeyDown = useCallback((e, cat, liEl) => {
    const children = childrenMap[cat.id] ?? []
    if (!children.length) return

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      clearTimeout(closeTimer.current)
      setDropdownPos(computePos(liEl.getBoundingClientRect()))
      setOpenId(cat.id)
      /* Focus sur le premier lien du dropdown */
      setTimeout(() => {
        dropdownRef.current?.querySelector('a')?.focus()
      }, 50)
    }
  }, [childrenMap, computePos])

  /* Navigation clavier dans le dropdown */
  const handleDropdownKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setOpenId(null)
      /* Rend le focus au trigger */
      const trigger = triggerRefs.current[openId]
      trigger?.focus()
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const links = [...(dropdownRef.current?.querySelectorAll('a') ?? [])]
      const idx   = links.indexOf(document.activeElement)
      links[idx + 1]?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const links = [...(dropdownRef.current?.querySelectorAll('a') ?? [])]
      const idx   = links.indexOf(document.activeElement)
      if (idx <= 0) {
        setOpenId(null)
        triggerRefs.current[openId]?.focus()
      } else {
        links[idx - 1]?.focus()
      }
    }
    if (e.key === 'Tab') {
      /* Ferme le dropdown quand on sort */
      setOpenId(null)
    }
  }, [openId])

  const activeSlug   = location.pathname.split('/catalogue/')[1]?.split('?')[0] ?? ''
  const openCat      = parents.find(p => p.id === openId)
  const openChildren = openId ? (childrenMap[openId] ?? []) : []

  return (
    <>
      <div
        className={s.bar}
        role="navigation"
        aria-label={t('nav.categoriesLabel', 'Navigation par catégories')}
      >
        {canLeft && (
          <button className={`${s.arrow} ${s.arrowLeft}`} onClick={() => scrollBy(-1)} aria-label="Défiler à gauche">
            <ChevronLeft size={16} />
          </button>
        )}
        {canRight && (
          <button className={`${s.arrow} ${s.arrowRight}`} onClick={() => scrollBy(1)} aria-label="Défiler à droite">
            <ChevronRight size={16} />
          </button>
        )}
        <div className={s.scroll} ref={scrollRef}>
          <ul className={s.list} role="list">
            <li className={s.item}>
              <Link
                to="/catalogue"
                className={`${s.link} ${!activeSlug ? s.linkActive : ''}`}
              >
                {t('catalogue.allProducts', 'Tout voir')}
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
                  onMouseEnter={hasChildren ? e => openDropdown(cat.id, e.currentTarget) : undefined}
                  onMouseLeave={hasChildren ? closeDropdown : undefined}
                >
                  <Link
                    to={`/catalogue/${cat.slug}`}
                    ref={el => { triggerRefs.current[cat.id] = el }}
                    className={`${s.link} ${isActive ? s.linkActive : ''} ${openId === cat.id ? s.linkHovered : ''}`}
                    aria-haspopup={hasChildren ? 'true' : undefined}
                    aria-expanded={hasChildren ? openId === cat.id : undefined}
                    onKeyDown={hasChildren ? e => handleTriggerKeyDown(e, cat, e.currentTarget.parentElement) : undefined}
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

      {/* Mega-menu rendu en dehors du scroll wrapper pour éviter le clipping overflow */}
      {openId && openCat && (
        <div
          ref={dropdownRef}
          className={s.dropdown}
          style={{ left: dropdownPos.left, top: dropdownPos.top }}
          onMouseEnter={cancelClose}
          onMouseLeave={closeDropdown}
          onKeyDown={handleDropdownKeyDown}
          role="menu"
          aria-label={`Sous-catégories de ${openCat.name}`}
        >
          <div className={s.dropdownInner}>
            {/* En-tête : nom de la catégorie + lien « Tout voir » + nombre de produits */}
            <div className={s.megaHeader}>
              <span className={s.megaTitle}>{openCat.name}</span>
              <Link
                to={`/catalogue/${openCat.slug}`}
                className={s.megaAllLink}
                role="menuitem"
                onClick={() => setOpenId(null)}
              >
                {t('catalogue.viewAll', 'Tout voir')}
                {openCat.product_count != null && (
                  <span className={s.megaCount}>{openCat.product_count}</span>
                )}
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {/* Sous-catégories réparties automatiquement en colonnes */}
            <ul className={s.subList} role="list">
              {openChildren.map(child => (
                <li key={child.id} className={s.subItem}>
                  <Link
                    to={`/catalogue/${child.slug}`}
                    className={`${s.subLink} ${activeSlug === child.slug ? s.subLinkActive : ''}`}
                    role="menuitem"
                    onClick={() => setOpenId(null)}
                  >
                    <span className={s.subName}>{child.name}</span>
                    {child.product_count != null && (
                      <span className={s.subCount}>{child.product_count}</span>
                    )}
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
