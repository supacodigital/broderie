import { useState, useEffect, useRef, useId } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User, LogOut, ChevronRight } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { useWishlist } from '../../../contexts/WishlistContext.jsx'
import { getMyOrders } from '../../../services/orders.service.js'
import { ACCOUNT_SECTIONS } from '../../account/accountSections.js'
import s from './AccountMenu.module.css'

/* Délais du survol : un court temps avant d'ouvrir évite d'ouvrir le menu en
   traversant le header ; une marge avant de fermer laisse le temps de
   descendre du bouton vers le panneau sans qu'il se referme */
const HOVER_OPEN_MS  = 80
const HOVER_CLOSE_MS = 180

/* ── Menu du compte (desktop) — s'ouvre au survol de l'avatar ou au clic,
   se referme avec Échap, un clic à l'extérieur ou un changement de page ── */
export default function AccountMenu() {
  const { t } = useTranslation()
  const { isAuthenticated, user, logout } = useAuth()
  const { ids: wishlistIds } = useWishlist()
  const location = useLocation()
  const navigate = useNavigate()
  const panelId = useId()

  const [open, setOpen] = useState(false)
  const [ordersCount, setOrdersCount] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const hoverTimer = useRef(null)

  /* Nouvelle page → menu fermé. Ajustement pendant le rendu plutôt que dans
     un effet : le menu ne s'affiche jamais un instant sur la nouvelle page. */
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setOpen(false)
  }

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  /* Nombre de commandes — demandé à la première ouverture seulement, pas à
     chaque page vue (appel léger : limit=1, total lu dans la pagination) */
  const shouldFetchOrders = open && isAuthenticated && ordersCount === null
  useEffect(() => {
    if (!shouldFetchOrders) return
    let cancelled = false
    getMyOrders({ limit: 1 })
      .then(res => { if (!cancelled) setOrdersCount(res.pagination?.total ?? 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [shouldFetchOrders])

  /* Clic à l'extérieur et touche Échap */
  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /* Survol : souris uniquement — au doigt, le « survol » simulé ouvrirait puis
     refermerait aussitôt le menu avec le clic qui suit */
  function onPointerEnter(e) {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS)
  }
  function onPointerLeave(e) {
    if (e.pointerType !== 'mouse') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }

  /* Le focus quitte le menu au clavier (Tab) → il se referme */
  function onBlur(e) {
    if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false)
  }

  /* À la souris, le survol a déjà ouvert le menu : le clic qui suit ne doit
     pas le refermer. Clavier et tactile, eux, ouvrent et ferment en alternance. */
  function onTriggerClick(e) {
    clearTimeout(hoverTimer.current)
    if (e.nativeEvent.pointerType === 'mouse') setOpen(true)
    else setOpen(o => !o)
  }

  async function handleLogout() {
    setOpen(false)
    await logout()
    navigate('/')
  }

  const initials = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .join('')

  /* Sous-titre de chaque lien : le compteur quand il est connu, sinon une aide */
  function subtitle(key, subKey) {
    if (key === 'orders' && ordersCount > 0) return t('accountNav.ordersCount', { count: ordersCount })
    if (key === 'wishlist' && wishlistIds.size > 0) return t('accountNav.wishlistCount', { count: wishlistIds.size })
    return t(subKey)
  }

  /* Après connexion depuis ce menu, retour sur la page en cours */
  const returnState = { from: location }

  return (
    <div
      ref={rootRef}
      className={s.root}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className={isAuthenticated && initials ? s.avatarTrigger : s.iconTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('accountNav.menuLabel')}
        onClick={onTriggerClick}
      >
        {isAuthenticated && initials ? initials : <User size={20} />}
      </button>

      <div id={panelId} className={s.panel} data-open={open}>
        {isAuthenticated ? (
          <>
            <div className={s.head}>
              <span className={s.headAvatar} aria-hidden="true">{initials || <User size={16} />}</span>
              <span className={s.headText}>
                <span className={s.headName}>{t('accountNav.hello', { name: user?.first_name ?? '' })}</span>
                <span className={s.headEmail}>{user?.email}</span>
              </span>
            </div>

            <nav aria-label={t('accountNav.label')}>
              <ul className={s.list} role="list">
                {ACCOUNT_SECTIONS.map(({ key, path, icon: Icon, labelKey, subKey }) => (
                  <li key={key}>
                    <NavLink
                      to={path}
                      className={({ isActive }) => `${s.item} ${isActive ? s.itemActive : ''}`}
                    >
                      <span className={s.itemIcon}><Icon size={17} /></span>
                      <span className={s.itemText}>
                        <span className={s.itemLabel}>{t(labelKey)}</span>
                        <span className={s.itemSub}>{subtitle(key, subKey)}</span>
                      </span>
                      <ChevronRight size={15} className={s.itemArrow} aria-hidden="true" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className={s.footer}>
              <button type="button" className={s.logout} onClick={handleLogout}>
                <LogOut size={15} />
                {t('accountNav.logout')}
              </button>
            </div>
          </>
        ) : (
          <div className={s.guest}>
            <p className={s.guestTitle}>{t('accountNav.guestTitle')}</p>
            <p className={s.guestSub}>{t('accountNav.guestSub')}</p>
            <Link to="/connexion" state={returnState} className={s.primaryBtn}>
              {t('accountNav.login')}
            </Link>
            <Link to="/inscription" state={returnState} className={s.secondaryBtn}>
              {t('accountNav.register')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
