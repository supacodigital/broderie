import { Outlet } from 'react-router-dom'
import Navbar from '../Navbar/Navbar.jsx'
import CategoryNav from '../Navbar/CategoryNav.jsx'
import Footer from '../Footer/Footer.jsx'
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
    </div>
  )
}
