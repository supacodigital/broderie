import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, Search, User, LogOut, Menu, X, ChevronRight } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { useCart } from '../../../contexts/CartContext.jsx'
import NavSearch from './NavSearch.jsx'
import LangSwitcher from './LangSwitcher.jsx'
import s from './Navbar.module.css'

export default function Navbar() {
  const { t } = useTranslation()
  const { isAuthenticated, user, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()
  const location = useLocation()

  const [scrolled,    setScrolled]    = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  /* Ferme le menu au changement de route */
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Bloque le scroll body quand menu mobile ouvert */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  function closeMenu() { setMenuOpen(false) }
  function closeSearch() { setSearchOpen(false) }
  function toggleSearch() { setSearchOpen(o => !o); setMenuOpen(false) }

  async function handleLogout() {
    await logout()
    navigate('/')
    closeMenu()
  }

  return (
    <>
      {/* ── Navbar principale ── */}
      <nav
        className={`${s.navbar} ${scrolled ? s.navbarScrolled : ''}`}
        aria-label="Navigation principale"
      >
        {/* Logo */}
        <Link to="/" className={s.logo} aria-label="Au Point-Compté — Accueil" onClick={closeMenu}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="15" stroke="#DB2777" strokeWidth="1.5" fill="#FDF2F8"/>
            <path d="M8 22 Q16 8 24 22" stroke="#DB2777" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <line x1="22" y1="10" x2="26" y2="14" stroke="#DB2777" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="22" cy="10" r="1.5" fill="#DB2777"/>
          </svg>
          <span className={s.logoText}>Au Point-Compté</span>
        </Link>

        {/* Liens principaux — desktop uniquement */}
        <ul className={s.links} role="list">
          <li>
            <NavLink to="/catalogue" className={({ isActive }) => isActive ? s.linkActive : ''}>
              {t('nav.collections')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/catalogue?badge=nouveaute" className={({ isActive }) => isActive ? s.linkActive : ''}>
              {t('nav.newArrivals')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/catalogue?badge=promo" className={({ isActive }) => isActive ? s.linkActive : ''}>
              {t('nav.promos')}
            </NavLink>
          </li>
          <li><Link to="/blog">{t('nav.blog')}</Link></li>
          <li>
            <NavLink to="/contact" className={({ isActive }) => isActive ? s.linkActive : ''}>
              {t('nav.contact')}
            </NavLink>
          </li>
        </ul>

        {/* Actions */}
        <div className={s.actions}>
          {/* Sélecteur de langue — desktop */}
          <div className={s.langDesktop}>
            <LangSwitcher variant="navbar" />
          </div>

          {/* Loupe — ouvre la recherche globale */}
          <button
            className={`${s.iconBtn} ${searchOpen ? s.iconBtnActive : ''}`}
            aria-label={t('nav.search')}
            aria-expanded={searchOpen}
            onClick={toggleSearch}
          >
            <Search size={20} />
          </button>

          {/* Compte — desktop */}
          <div className={s.accountDesktop}>
            {isAuthenticated ? (
              <>
                <Link to="/mon-compte" className={s.iconBtn} aria-label={t('nav.account')} title={user?.first_name ?? t('nav.account')}>
                  <User size={20} />
                </Link>
                <button className={s.iconBtn} onClick={handleLogout} aria-label="Déconnexion">
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <Link to="/connexion" className={s.iconBtn} aria-label={t('nav.account')}>
                <User size={20} />
              </Link>
            )}
          </div>

          {/* Panier */}
          <Link
            to="/panier"
            className={s.iconBtn}
            aria-label={t('nav.cartItems', { count: itemCount })}
          >
            <ShoppingBag size={20} />
            {itemCount > 0 && (
              <span className={s.badge} aria-hidden="true">{itemCount}</span>
            )}
          </Link>

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

      {/* ── Overlay de recherche global ── */}
      <NavSearch open={searchOpen} onClose={closeSearch} />

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

          <NavLink to="/catalogue?badge=nouveaute" className={s.mobileLink} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.newArrivals')}</span>
              <span className={s.mobileLinkSub}>Dernières arrivées</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          <NavLink to="/catalogue?badge=promo" className={s.mobileLink} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.promos')}</span>
              <span className={s.mobileLinkSub}>Offres en cours</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          <NavLink to="/blog" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.blog')}</span>
              <span className={s.mobileLinkSub}>Conseils & inspirations</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          <NavLink to="/contact" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
            <span className={s.mobileLinkContent}>
              <span className={s.mobileLinkText}>{t('nav.contact')}</span>
              <span className={s.mobileLinkSub}>Nous écrire</span>
            </span>
            <ChevronRight size={18} className={s.mobileLinkArrow} />
          </NavLink>

          {/* Compte */}
          <div className={s.mobileDivider} aria-hidden="true" />
          <p className={s.mobileSectionLabel}>Mon espace</p>

          {isAuthenticated ? (
            <>
              <NavLink to="/mon-compte" className={({ isActive }) => `${s.mobileLink} ${isActive ? s.mobileLinkActive : ''}`} onClick={closeMenu}>
                <span className={s.mobileLinkContent}>
                  <span className={s.mobileLinkText}>{t('nav.account')}</span>
                  <span className={s.mobileLinkSub}>{user?.first_name ?? 'Mon profil'}</span>
                </span>
                <User size={18} className={s.mobileLinkArrow} />
              </NavLink>
              <button className={s.mobileLogoutBtn} onClick={handleLogout}>
                <LogOut size={16} />
                Déconnexion
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

          {/* Langue */}
          <div className={s.mobileDivider} aria-hidden="true" />
          <p className={s.mobileSectionLabel}>Langue</p>
          <LangSwitcher variant="mobile" />
        </div>
      </div>
    </>
  )
}
