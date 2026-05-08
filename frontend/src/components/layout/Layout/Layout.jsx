import { Outlet } from 'react-router-dom'
import Navbar from '../Navbar/Navbar.jsx'
import Footer from '../Footer/Footer.jsx'
import s from './Layout.module.css'

export default function Layout() {
  return (
    <div className={s.root}>
      <Navbar />
      <main className={s.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
