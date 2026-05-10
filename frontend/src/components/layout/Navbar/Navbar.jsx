import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShoppingBag, Search, User, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { useCart } from '../../../contexts/CartContext.jsx'
import NavSearch from './NavSearch.jsx'
import s from './Navbar.module.css'

export default function Navbar() {
  const { t } = useTranslation()
  const { isAuthenticated, user, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()

  const [scrolled,    setScrolled]    = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

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
      {/* ── Bannière promo ── */}
      <div className={s.banner} role="banner">
        <span>🇨🇭 {t('banner.shipping')}</span>
        <span className={s.bannerDot}>·</span>
        <span>{t('banner.newKits')}</span>
        <span className={s.bannerDot}>·</span>
        <span>{t('banner.twint')}</span>
      </div>

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
          <li><a href="#">{t('nav.blog')}</a></li>
          <li>
            <NavLink to="/contact" className={({ isActive }) => isActive ? s.linkActive : ''}>
              {t('nav.contact')}
            </NavLink>
          </li>
        </ul>

        {/* Actions */}
        <div className={s.actions}>
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

      {/* ── Menu mobile ── */}
      <div
        id="mobile-menu"
        className={`${s.mobileMenu} ${menuOpen ? s.mobileMenuOpen : ''}`}
        aria-hidden={!menuOpen}
        aria-label="Menu de navigation mobile"
      >
        {/* Fermer */}
        <button className={s.mobileClose} onClick={closeMenu} aria-label="Fermer le menu">
          <X size={22} />
        </button>

        <ul role="list">
          <li><NavLink to="/catalogue" onClick={closeMenu}>{t('nav.collections')}</NavLink></li>
          <li><NavLink to="/catalogue?badge=nouveaute" onClick={closeMenu}>{t('nav.newArrivals')}</NavLink></li>
          <li><NavLink to="/catalogue?badge=promo" onClick={closeMenu}>{t('nav.promos')}</NavLink></li>
          <li><a href="#" onClick={closeMenu}>{t('nav.blog')}</a></li>
          <li><NavLink to="/contact" onClick={closeMenu}>{t('nav.contact')}</NavLink></li>
          <li className={s.mobileDivider} aria-hidden="true" />
          {isAuthenticated ? (
            <>
              <li><NavLink to="/mon-compte" onClick={closeMenu}>{t('nav.account')}</NavLink></li>
              <li>
                <button className={s.mobileLogout} onClick={handleLogout}>
                  <LogOut size={16} />
                  Déconnexion
                </button>
              </li>
            </>
          ) : (
            <li><NavLink to="/connexion" onClick={closeMenu}>{t('nav.account')}</NavLink></li>
          )}
          <li><NavLink to="/panier" onClick={closeMenu}>{t('nav.cart')}</NavLink></li>
        </ul>
      </div>

      {/* Overlay fermeture menu mobile */}
      {menuOpen && (
        <div
          className={s.overlay}
          aria-hidden="true"
          onClick={closeMenu}
        />
      )}
    </>
  )
}
