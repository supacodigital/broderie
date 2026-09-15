import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../Navbar/Navbar.jsx'
import CategoryNav from '../Navbar/CategoryNav.jsx'
import Footer from '../Footer/Footer.jsx'
import AnnouncementBanner from '../../ui/AnnouncementBanner/AnnouncementBanner.jsx'
import CookieBanner from '../../ui/CookieBanner/CookieBanner.jsx'
import EmailVerificationBanner from '../../ui/EmailVerificationBanner/EmailVerificationBanner.jsx'
import Toaster from '../../ui/Toaster/Toaster.jsx'
import ValidateCartButton from '../../ui/ValidateCartButton/ValidateCartButton.jsx'
import s from './Layout.module.css'

export default function Layout() {
  const { pathname } = useLocation()
  /* Sur la page d'accueil, la barre catégories est rendue par Home, sous le hero.
     Partout ailleurs, elle reste collée sous la Navbar. */
  const showCategoryNav = pathname !== '/'

  return (
    <div className={s.root}>
      {/* Au-dessus de la navbar : une annonce doit être vue avant la navigation */}
      <AnnouncementBanner />
      <Navbar />
      {showCategoryNav && <CategoryNav />}
      <main className={s.main}>
        <Outlet />
      </main>
      <Footer />
      {/* Ancrée en bas de l'écran : contrairement au haut de page, elle ne défile
          pas avec le contenu et reste donc visible sur toutes les pages tant que
          l'adresse n'est pas confirmée. */}
      <EmailVerificationBanner />
      <CookieBanner />
      <ValidateCartButton />
      <Toaster />
    </div>
  )
}
