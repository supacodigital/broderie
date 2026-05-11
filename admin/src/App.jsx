import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'

/* Chargement différé de chaque page */
const Login      = lazy(() => import('./pages/Login/Login.jsx'))
const Dashboard  = lazy(() => import('./pages/Dashboard/Dashboard.jsx'))
const Products   = lazy(() => import('./pages/Products/Products.jsx'))
const Orders     = lazy(() => import('./pages/Orders/Orders.jsx'))
const Customers  = lazy(() => import('./pages/Customers/Customers.jsx'))
const Reviews    = lazy(() => import('./pages/Reviews/Reviews.jsx'))
const Suppliers  = lazy(() => import('./pages/Suppliers/Suppliers.jsx'))
const Loyalty    = lazy(() => import('./pages/Loyalty/Loyalty.jsx'))
const Categories = lazy(() => import('./pages/Categories/Categories.jsx'))
const Coupons    = lazy(() => import('./pages/Coupons/Coupons.jsx'))
const Settings    = lazy(() => import('./pages/Settings/Settings.jsx'))
const Newsletter  = lazy(() => import('./pages/Newsletter/Newsletter.jsx'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Chargement…
    </div>
  )
}

/* Route protégée — redirige vers /connexion si pas admin */
function PrivateRoute({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <PageLoader />
  if (!user || !isAdmin) return <Navigate to="/connexion" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/connexion" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AdminLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"  element={<Dashboard />} />
            <Route path="produits"   element={<Products />} />
            <Route path="commandes"  element={<Orders />} />
            <Route path="clients"    element={<Customers />} />
            <Route path="avis"       element={<Reviews />} />
            <Route path="fournisseurs" element={<Suppliers />} />
            <Route path="fidelite"   element={<Loyalty />} />
            <Route path="categories" element={<Categories />} />
            <Route path="coupons"    element={<Coupons />} />
            <Route path="parametres"  element={<Settings />} />
            <Route path="newsletter"  element={<Newsletter />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
