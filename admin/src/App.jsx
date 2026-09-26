import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import ScrollToTop from './components/layout/ScrollToTop.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext.jsx'
import AdminLayout from './components/layout/AdminLayout.jsx'

/* Chargement différé de chaque page */
const Login      = lazy(() => import('./pages/Login/Login.jsx'))
const MfaSetup    = lazy(() => import('./pages/Mfa/MfaSetup.jsx'))
const MfaVerify   = lazy(() => import('./pages/Mfa/MfaVerify.jsx'))
const Dashboard  = lazy(() => import('./pages/Dashboard/Dashboard.jsx'))
const Products    = lazy(() => import('./pages/Products/Products.jsx'))
const ProductForm = lazy(() => import('./pages/Products/ProductForm.jsx'))
const Orders      = lazy(() => import('./pages/Orders/Orders.jsx'))
const OrderDetail = lazy(() => import('./pages/Orders/OrderDetail.jsx'))
const Customers  = lazy(() => import('./pages/Customers/Customers.jsx'))
const CustomerDetail = lazy(() => import('./pages/Customers/CustomerDetail.jsx'))
const Reviews    = lazy(() => import('./pages/Reviews/Reviews.jsx'))
const Suppliers   = lazy(() => import('./pages/Suppliers/Suppliers.jsx'))
const SupplierForm = lazy(() => import('./pages/Suppliers/SupplierForm.jsx'))
const Loyalty    = lazy(() => import('./pages/Loyalty/Loyalty.jsx'))
const Invoices   = lazy(() => import('./pages/Invoices/Invoices.jsx'))
const Restock    = lazy(() => import('./pages/Restock/Restock.jsx'))
const Categories = lazy(() => import('./pages/Categories/Categories.jsx'))
const Coupons    = lazy(() => import('./pages/Coupons/Coupons.jsx'))
const Settings    = lazy(() => import('./pages/Settings/Settings.jsx'))
const Newsletter  = lazy(() => import('./pages/Newsletter/Newsletter.jsx'))
// Espace du super-administrateur : contenu du site et son compte
const Content     = lazy(() => import('./pages/Content/Content.jsx'))
const Account     = lazy(() => import('./pages/Account/Account.jsx'))

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

/* Page d'accueil de chaque rôle : l'administrateur gère la boutique, le
   super-administrateur le contenu du site — et rien d'autre (26.09). */
function homePathFor(user) {
  return user?.role === 'super_admin' ? '/contenu' : '/dashboard'
}

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={homePathFor(user)} replace />
}

/* Réserve un groupe de routes à un rôle ; l'autre rôle est renvoyé vers son
   propre espace (un lien partagé ou un ancien favori ne mène pas à une page
   vide en 403). Le serveur refuse de toute façon. */
function RoleRoute({ role }) {
  const { user } = useAuth()
  if (user?.role !== role) return <Navigate to={homePathFor(user)} replace />
  return <Outlet />
}

/* Routes MFA (setup/verification) — accessibles uniquement en sortie directe du login,
   jamais par accès direct à l'URL (pas de session finale à ce stade, donc PrivateRoute
   ne s'applique pas). `user` est aussi accepté : juste après un setup réussi,
   finishMfaSetup() vide mfaPending et navigate('/dashboard') est appelé dans la même
   fonction — sans cette tolérance, un re-render de cette route sur mfaPending===null
   surviendrait avant que la navigation n'ait pris effet et écraserait la redirection
   voulue vers /dashboard par une redirection vers /connexion. */
function MfaRoute({ children }) {
  const { mfaPending, user } = useAuth()
  if (!mfaPending && !user) return <Navigate to="/connexion" replace />
  return children
}

/* Remonte le formulaire à chaque changement d'identifiant.
   Sans cette clé, React Router réutilise la même instance entre /produits/12 et
   /produits/34 (et entre un produit et « nouveau ») : l'état interne — images,
   réduction, erreurs — survivait au changement de fiche, et une réponse réseau
   tardive pouvait écrire les données d'un produit sous l'identifiant d'un autre. */
function KeyedByRouteId({ children }) {
  const { id } = useParams()
  return <div key={id ?? 'new'} style={{ display: 'contents' }}>{children}</div>
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      {/* Chaque page s'ouvre en haut — cf. le composant pour le détail */}
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/connexion" element={<Login />} />
          <Route path="/mfa/configuration" element={<MfaRoute><MfaSetup /></MfaRoute>} />
          <Route path="/mfa/verification"  element={<MfaRoute><MfaVerify /></MfaRoute>} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <UnsavedChangesProvider>
                  <AdminLayout />
                </UnsavedChangesProvider>
              </PrivateRoute>
            }
          >
            <Route index element={<HomeRedirect />} />

            {/* ── Contenu du site — super-administrateur ── */}
            <Route element={<RoleRoute role="super_admin" />}>
              <Route path="contenu"          element={<Content />} />
              <Route path="contenu/:section" element={<Content />} />
              <Route path="compte"           element={<Account />} />
            </Route>

            {/* ── Gestion de la boutique — administrateur ── */}
            <Route element={<RoleRoute role="admin" />}>
            <Route path="dashboard"  element={<Dashboard />} />
            <Route path="produits"   element={<Products />} />
            <Route path="produits/nouveau" element={<KeyedByRouteId><ProductForm /></KeyedByRouteId>} />
            <Route path="produits/:id"     element={<KeyedByRouteId><ProductForm /></KeyedByRouteId>} />
            <Route path="commandes"  element={<Orders />} />
            <Route path="commandes/:id" element={<OrderDetail />} />
            <Route path="factures"   element={<Invoices />} />
            <Route path="reassort"   element={<Restock />} />
            <Route path="clients"    element={<Customers />} />
            <Route path="clients/:id" element={<KeyedByRouteId><CustomerDetail /></KeyedByRouteId>} />
            <Route path="avis"       element={<Reviews />} />
            <Route path="fournisseurs" element={<Suppliers />} />
            <Route path="fournisseurs/nouveau" element={<KeyedByRouteId><SupplierForm /></KeyedByRouteId>} />
            <Route path="fournisseurs/:id"     element={<KeyedByRouteId><SupplierForm /></KeyedByRouteId>} />
            <Route path="fidelite"   element={<Loyalty />} />
            <Route path="categories" element={<Categories />} />
            <Route path="coupons"    element={<Coupons />} />
            <Route path="parametres"  element={<Settings />} />
            <Route path="newsletter"  element={<Newsletter />} />
            </Route>
          </Route>
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
