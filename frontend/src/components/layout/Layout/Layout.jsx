import { Outlet, useLocation, ScrollRestoration } from 'react-router-dom'
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
      {/* Chaque nouvelle page s'ouvre en haut, et le bouton Retour restaure la
          position d'où l'on venait — sans cela, on arrivait sur une fiche produit
          au milieu du texte après avoir cliqué depuis le bas du catalogue.

          `getKey` ne retient que le CHEMIN, sans les paramètres : trier le
          catalogue ou cocher un filtre réécrit l'URL (`?sort=price_chf`) sans
          changer de page, et la position doit être conservée. Avec la clé par
          défaut, chaque changement de filtre renvoyait l'utilisatrice en haut
          de la liste qu'elle était en train de parcourir. */}
      <ScrollRestoration getKey={(location) => location.pathname} />

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
