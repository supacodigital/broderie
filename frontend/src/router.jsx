import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/layout/Layout/Layout.jsx'
import PrivateRoute from './components/auth/PrivateRoute.jsx'

/* Chargement différé de toutes les pages — code splitting obligatoire */
const Home      = lazy(() => import('./pages/Home/Home.jsx'))
const Catalogue = lazy(() => import('./pages/Catalogue/Catalogue.jsx'))
const Product   = lazy(() => import('./pages/Product/Product.jsx'))
const Cart      = lazy(() => import('./pages/Cart/Cart.jsx'))
const Checkout  = lazy(() => import('./pages/Checkout/Checkout.jsx'))
const Login     = lazy(() => import('./pages/Login/Login.jsx'))
const Register  = lazy(() => import('./pages/Register/Register.jsx'))
const Account   = lazy(() => import('./pages/Account/Account.jsx'))
const NotFound  = lazy(() => import('./pages/NotFound/NotFound.jsx'))
const CGV              = lazy(() => import('./pages/CGV/CGV.jsx'))
const MentionsLegales  = lazy(() => import('./pages/MentionsLegales/MentionsLegales.jsx'))
const PolitiqueRetour  = lazy(() => import('./pages/PolitiqueRetour/PolitiqueRetour.jsx'))
const ForgotPassword   = lazy(() => import('./pages/ForgotPassword/ForgotPassword.jsx'))
const ResetPassword  = lazy(() => import('./pages/ResetPassword/ResetPassword.jsx'))
const OrderDetail    = lazy(() => import('./pages/OrderDetail/OrderDetail.jsx'))

/* Fallback pendant le chargement des chunks */
function PageLoader() {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--rose-pale)',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '3px solid var(--rose-border)',
        borderTopColor: 'var(--rose)',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  )
}

function S({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    /* Toutes les pages partagent le même layout Navbar + Footer */
    element: <Layout />,
    children: [
      { path: '/',                         element: <S><Home /></S> },
      { path: '/catalogue',                element: <S><Catalogue /></S> },
      { path: '/catalogue/:categorySlug',  element: <S><Catalogue /></S> },
      { path: '/produit/:slug',            element: <S><Product /></S> },
      { path: '/connexion',                element: <S><Login /></S> },
      { path: '/inscription',              element: <S><Register /></S> },
      { path: '/cgv',                           element: <S><CGV /></S> },
      { path: '/mentions-legales',              element: <S><MentionsLegales /></S> },
      { path: '/politique-de-retour',           element: <S><PolitiqueRetour /></S> },
      { path: '/mot-de-passe-oublie',           element: <S><ForgotPassword /></S> },
      { path: '/reinitialiser-mot-de-passe',    element: <S><ResetPassword /></S> },

      /* Routes protégées — nécessitent une authentification */
      {
        path: '/panier',
        element: <S><Cart /></S>,
      },
      {
        path: '/commande',
        element: <S><PrivateRoute><Checkout /></PrivateRoute></S>,
      },
      {
        path: '/mon-compte',
        element: <S><PrivateRoute><Account /></PrivateRoute></S>,
      },
      {
        path: '/commandes/:id',
        element: <S><PrivateRoute><OrderDetail /></PrivateRoute></S>,
      },

      { path: '*', element: <S><NotFound /></S> },
    ],
  },
])
