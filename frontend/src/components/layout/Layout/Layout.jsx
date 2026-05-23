import { Outlet } from 'react-router-dom'
import Navbar from '../Navbar/Navbar.jsx'
import CategoryNav from '../Navbar/CategoryNav.jsx'
import Footer from '../Footer/Footer.jsx'
import CookieBanner from '../../ui/CookieBanner/CookieBanner.jsx'
import Toaster from '../../ui/Toaster/Toaster.jsx'
import s from './Layout.module.css'

export default function Layout() {
  return (
    <div className={s.root}>
      <Navbar />
      <CategoryNav />
      <main className={s.main}>
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
      <Toaster />
    </div>
  )
}
