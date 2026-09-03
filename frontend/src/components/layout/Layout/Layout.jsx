import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../Navbar/Navbar.jsx'
import CategoryNav from '../Navbar/CategoryNav.jsx'
import Footer from '../Footer/Footer.jsx'
import CookieBanner from '../../ui/CookieBanner/CookieBanner.jsx'
import EmailVerificationBanner from '../../ui/EmailVerificationBanner/EmailVerificationBanner.jsx'
import Toaster from '../../ui/Toaster/Toaster.jsx'
import s from './Layout.module.css'

export default function Layout() {
  const { pathname } = useLocation()
  /* Sur la page d'accueil, la barre catégories est rendue par Home, sous le hero.
     Partout ailleurs, elle reste collée sous la Navbar. */
  const showCategoryNav = pathname !== '/'

  return (
    <div className={s.root}>
      <Navbar />
      {showCategoryNav && <CategoryNav />}
      <EmailVerificationBanner />
      <main className={s.main}>
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
      <Toaster />
    </div>
  )
}
