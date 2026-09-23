import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, Search, User, Heart, LogOut, Menu, X, ChevronRight } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { useCart } from '../../../contexts/CartContext.jsx'
import { useCartDrawer } from '../../../contexts/CartDrawerContext.jsx'
import { useWishlist } from '../../../contexts/WishlistContext.jsx'
import NavSearch from './NavSearch.jsx'
import { openKeyboardDuringTap } from '../../../utils/touchKeyboard.js'
import AccountMenu from './AccountMenu.jsx'
import { ACCOUNT_SECTIONS } from '../../account/accountSections.js'
import CartDrawer from '../CartDrawer/CartDrawer.jsx'
import s from './Navbar.module.css'

export default function Navbar() {
  const { t } = useTranslation()
  const { isAuthenticated, user, logout } = useAuth()
  const { itemCount } = useCart()
  const { openCartDrawer } = useCartDrawer()
  const { ids: wishlistIds } = useWishlist()
  const wishlistCount = wishlistIds.size
  const navigate = useNavigate()
  const location = useLocation()

  const [scrolled,    setScrolled]    = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  /* Ferme le menu au changement de route */
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Sur la page d'accueil, la navbar est transparente par-dessus le hero
     tant qu'on n'a pas scrollé ; elle reprend son fond opaque au scroll. */
  const overlay = location.pathname === '/' && !scrolled

  /* Bloque le scroll body quand menu mobile ouvert */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  function closeMenu() { setMenuOpen(false) }
  function closeSearch() { setSearchOpen(false) }
  function toggleSearch() {
    /* Mobile : le clavier doit s'ouvrir pendant le tap, sinon Safari iOS le refuse
       au champ du tiroir qui apparaît juste après (CLI-01). Même seuil que le
       tiroir dans NavSearch.module.css. */
    if (!searchOpen && window.matchMedia?.('(max-width: 768px)').matches) {
      openKeyboardDuringTap()
    }
    setSearchOpen(o => !o)
    setMenuOpen(false)
  }

  /* Initiales du client connecté (ex. "Julie Dupont" → "JD") */
  const initials = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .join('')

  async function handleLogout() {
    await logout()
    navigate('/')
    closeMenu()
  }

  return (
    <>
      {/* ── Navbar principale ── */}
      <nav
        className={`${s.navbar} ${scrolled ? s.navbarScrolled : ''} ${overlay ? s.navbarOverlay : ''}`}
        aria-label="Navigation principale"
      >
        {/* Logo */}
        <Link to="/" className={s.logo} aria-label="Au Point-Compté — Accueil" onClick={closeMenu}>
          <img
            src="/logo.png"
            alt="Au Point-Compté"
            className={s.logoImg}
            width="180"
            height="54"
          />
        </Link>

        {/* Liens principaux — desktop uniquement. Pas d'état actif : simples liens. */}
        <ul className={s.links} role="list">
          <li>
            <Link to="/catalogue">{t('nav.collections')}</Link>
          </li>
          <li>
            <Link to="/catalogue?sort=created_at&order=desc">{t('nav.newArrivals')}</Link>
          </li>
          <li>
            <Link to="/notre-histoire">{t('nav.about')}</Link>
          </li>
        </ul>

        {/* Actions */}
        <div className={s.actions}>
          {/* Recherche — le champ se déploie à gauche de la loupe (desktop),
              le tiroir prend le relais sous 768 px.
              `data-nav-search-toggle` sur le bouton : NavSearch s'en sert pour
              ne pas traiter un clic sur la loupe comme un « clic en dehors »,
              ce qui neutraliserait la bascule. */}
          <NavSearch open={searchOpen} onClose={closeSearch} />

          <button
            className={`${s.iconBtn} ${searchOpen ? s.iconBtnActive : ''}`}
            aria-label={t('nav.search')}
            aria-expanded={searchOpen}
            onClick={toggleSearch}
            data-nav-search-toggle
          >
            <Search size={20} />
          </button>

          {/* Favoris — desktop + mobile, pointe vers la page favoris du compte */}
          <div className={s.wishlistBtn}>
            <Link
              to="/mon-compte/favoris"
              className={s.iconBtn}
              aria-label={t('nav.wishlistItems', { count: wishlistCount })}
              title={t('nav.wishlist')}
            >
              <Heart size={20} />
              {wishlistCount > 0 && (
                <span className={s.badge} aria-hidden="true">{wishlistCount}</span>
              )}
            </Link>
          </div>

          {/* Compte — desktop : menu au survol ou au clic */}
          <div className={s.accountDesktop}>
            <AccountMenu />
          </div>

          {/* Panier — ouvre le drawer latéral */}
          <button
            type="button"
            className={s.iconBtn}
            aria-label={t('nav.cartItems', { count: itemCount })}
            onClick={openCartDrawer}
          >
            <ShoppingBag size={20} />
            {itemCount > 0 && (
              <span className={s.badge} aria-hidden="true">{itemCount}</span>
            )}
          </button>

          {/* Burger — mobile uniquement */}
          <button
            className={`${s.iconBtn} ${s.burger}`}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* ── Menu mobile plein écran ── */}
      <div
        id="mobile-menu"
        className={`${s.mobileMenu} ${menuOpen ? s.mobileMenuOpen : ''}`}
        aria-hidden={!menuOpen}
        aria-modal="true"
        role="dialog"
        aria-label="Menu de navigation"
      >
        {/* En-tête */}
        <div className={s.mobileHeader}>
          <Link to="/" className={s.mobileHeaderLogo} onClick={closeMenu}>
            Au Point-Compté
          </Link>
          <button className={s.mobileClose} onClick={closeMenu} aria-label="Fermer le menu">
            <X size={22} />
          </button>
        </div>

        {/* Corps */}
        <div className={s.mobileBody}>
          {/* Panier — CTA en haut */}
          <Link to="/panier" className={s.mobileCartBtn} onClick={closeMenu}>
            <span className={s.mobileCartLabel}>
              <ShoppingBag size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              {t('nav.cart')}
            </span>
            <span className={s.mobileCartCount}>{itemCount > 0 ? itemCount : '0'}</span>
          </Link>

          {/* Navigation */}
          <p className={s.mobileSectionLabel}>Navigation</p>

          <NavLink to="/catalogue" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.collections')}</span>
              <span className={s.mobileLinkSub}>Tous nos produits</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          <NavLink to="/catalogue?sort=created_at&order=desc" className={s.mobileLink} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.newArrivals')}</span>
              <span className={s.mobileLinkSub}>Dernières arrivées</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          <NavLink to="/notre-histoire" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.about')}</span>
              <span className={s.mobileLinkSub}>{t('nav.aboutSub')}</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          {/* Compte */}
          <div className={s.mobileDivider} aria-hidden="true" />
          <p className={s.mobileSectionLabel}>Mon espace</p>

          {isAuthenticated ? (
            <>
              {/* Mêmes sections que le menu du compte desktop */}
              {ACCOUNT_SECTIONS.map(({ key, path, icon: Icon, labelKey, subKey }) => (
                <NavLink key={key} to={path} className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
                  <span className={s.mobileLinkContent}>
                    <span className={s.mobileLinkText}>{t(labelKey)}</span>
                    <span className={s.mobileLinkSub}>
                      {key === 'wishlist' && wishlistCount > 0 ? t('accountNav.wishlistCount', { count: wishlistCount }) : t(subKey)}
                    </span>
                  </span>
                  {key === 'profile' && initials
                    ? <span className={s.mobileAvatar} aria-hidden="true">{initials}</span>
                    : <Icon size={18} className={s.mobileLinkArrow} />}
                </NavLink>
              ))}
              <button className={s.mobileLogoutBtn} onClick={handleLogout}>
                <LogOut size={16} />
                {t('accountNav.logout')}
              </button>
            </>
          ) : (
            <NavLink to="/connexion" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
              <span className={s.mobileLinkContent}>
                <span className={s.mobileLinkText}>{t('nav.account')}</span>
                <span className={s.mobileLinkSub}>Se connecter</span>
              </span>
              <User size={18} className={s.mobileLinkArrow} />
            </NavLink>
          )}
        </div>
      </div>

      {/* ── Drawer panier latéral ── */}
      <CartDrawer />
    </>
  )
}
