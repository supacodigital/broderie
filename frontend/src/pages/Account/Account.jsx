import { useState, useEffect, useCallback } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogOut, ChevronRight, Check, BadgeCheck, MailWarning } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import { getMyOrders } from '../../services/orders.service.js'
import { ACCOUNT_SECTIONS, LEGACY_TAB_PATHS } from '../../components/account/accountSections.js'
import Seo from '../../components/seo/Seo.jsx'
import s from './Account.module.css'

/* /mon-compte seul → « Mon profil ». Les anciennes URLs à onglets (?tab=orders…)
   restent valides : elles mènent à la page équivalente. */
export function AccountIndex() {
  const [searchParams] = useSearchParams()
  const target = LEGACY_TAB_PATHS[searchParams.get('tab')] ?? '/mon-compte/profil'
  return <Navigate to={target} replace />
}

/* ── Espace client — en-tête et navigation communs aux pages profil, commandes
   et favoris. Chaque section est une vraie page (URL propre, bouton Retour,
   lien partageable), chargée séparément. ── */
export default function Account() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [userData, setUserData] = useState(user ?? {})

  /* `userData` est une copie locale, enrichie après un enregistrement. Elle était
     figée à la valeur du contexte au premier rendu — donc vide tant que la session
     n'était pas restaurée, et jamais rattrapée ensuite (CLI-06). */
  useEffect(() => {
    if (user) setUserData(prev => ({ ...prev, ...user }))
  }, [user])

  /* Profil enregistré : met à jour l'en-tête (nom, initiales) sans recharger */
  const updateUserData = useCallback((d) => setUserData(u => ({
    ...u, ...d,
    firstName: d.first_name ?? d.firstName ?? u.firstName,
    lastName:  d.last_name  ?? d.lastName  ?? u.lastName,
  })), [])

  const { ids: wishlistIds } = useWishlist()
  const [ordersCount, setOrdersCount] = useState(null)

  /* Badge de compteur commandes — appel léger (limit=1), lu depuis pagination.total */
  useEffect(() => {
    let cancelled = false
    getMyOrders({ limit: 1 }).then(res => {
      if (!cancelled) setOrdersCount(res.pagination?.total ?? null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const counts = { orders: ordersCount, wishlist: wishlistIds.size }
  const current = ACCOUNT_SECTIONS.find(sec => pathname.startsWith(sec.path)) ?? ACCOUNT_SECTIONS[0]

  /* Chaque changement de section ramène en haut, comme une nouvelle page */
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const firstName = userData?.firstName ?? userData?.first_name ?? ''
  const lastName  = userData?.lastName  ?? userData?.last_name  ?? ''
  const initials  = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  /* Statut de confirmation de l'adresse email — affiché à côté de l'avatar */
  const emailVerified = !!userData?.emailVerified

  return (
    <div className={s.page}>
      <Seo title={t(current.labelKey)} noindex />

      {/* ── En-tête — fil d'Ariane jusqu'à la section courante ── */}
      <div className={s.pageHead}>
        <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
          <Link to="/">{t('nav.home')}</Link>
          <ChevronRight size={13} />
          <Link to="/mon-compte/profil">{t('account.breadcrumb')}</Link>
          <ChevronRight size={13} />
          <span aria-current="page">{t(current.labelKey)}</span>
        </nav>
      </div>

      {/* ── Barre supérieure — avatar + navigation entre les sections (desktop/tablette) ── */}
      <div className={s.topBar}>
        <div className={s.topBarAvatar}>
          <div className={s.avatarWrap}>
            <div className={s.avatar}>{initials}</div>
            {/* Pastille de confirmation — apposée sur l'avatar une fois l'adresse vérifiée */}
            {emailVerified && (
              <span className={s.avatarBadge} title={t('account.emailVerifiedTitle')}>
                <BadgeCheck size={16} aria-hidden="true" />
                <span className={s.srOnly}>{t('account.emailVerifiedTitle')}</span>
              </span>
            )}
          </div>
          <div>
            <p className={s.avatarName}>{firstName} {lastName}</p>
            <p className={s.avatarEmail}>{userData?.email}</p>
            {/* Mention explicite sous l'email : la pastille seule reste ambiguë */}
            {emailVerified ? (
              <span className={s.verifiedTag}>
                <Check size={12} aria-hidden="true" />{t('account.emailVerified')}
              </span>
            ) : (
              <span className={s.unverifiedTag}>
                <MailWarning size={12} aria-hidden="true" />{t('account.emailUnverified')}
              </span>
            )}
          </div>
        </div>

        <nav className={s.topTabNav} aria-label={t('accountNav.label')}>
          {ACCOUNT_SECTIONS.map(({ key, path, icon: Icon, labelKey }) => (
            <NavLink
              key={key}
              to={path}
              className={({ isActive }) => `${s.topTabBtn} ${isActive ? s.topTabActive : ''}`}
            >
              <Icon size={16} />
              <span>{t(labelKey)}</span>
              {!!counts[key] && <span className={s.tabBadge}>{counts[key]}</span>}
            </NavLink>
          ))}
        </nav>

        <button className={s.topLogoutBtn} onClick={handleLogout}>
          <LogOut size={15} />
          <span>{t('accountNav.logout')}</span>
        </button>
      </div>

      {/* ── Section courante ── */}
      <div className={s.content}>
        <Outlet context={{ userData, updateUserData }} />
      </div>

      {/* ── Barre de navigation mobile — style app, fixée en bas de l'écran ── */}
      <nav className={s.mobileTabBar} aria-label={t('accountNav.label')}>
        {ACCOUNT_SECTIONS.map(({ key, path, icon: Icon, shortKey }) => (
          <NavLink
            key={key}
            to={path}
            className={({ isActive }) => `${s.mobileTabBtn} ${isActive ? s.mobileTabActive : ''}`}
          >
            <span className={s.mobileTabIconWrap}>
              <Icon size={20} />
              {!!counts[key] && <span className={s.mobileTabDot}>{counts[key] > 9 ? '9+' : counts[key]}</span>}
            </span>
            <span>{t(shortKey)}</span>
          </NavLink>
        ))}
        <button
          className={`${s.mobileTabBtn} ${s.mobileTabBtnLogout}`}
          onClick={handleLogout}
        >
          <span className={s.mobileTabIconWrap}>
            <LogOut size={20} />
          </span>
          <span>{t('accountNav.logout')}</span>
        </button>
      </nav>
    </div>
  )
}
