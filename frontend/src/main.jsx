import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'

/* Initialisation i18n — doit être importé avant les composants */
import './i18n/index.js'

import './index.css'
import { router } from './router.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { CartProvider } from './contexts/CartContext.jsx'
import { CartDrawerProvider } from './contexts/CartDrawerContext.jsx'
import { WishlistProvider } from './contexts/WishlistContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'

/* Animation du spinner de chargement de page */
const spinStyle = document.createElement('style')
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
document.head.appendChild(spinStyle)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/* Logs de démarrage — visibles uniquement en développement */
if (import.meta.env.DEV) {
  const pkg = { version: import.meta.env.VITE_APP_VERSION ?? '(non définie)' }
  console.groupCollapsed('%c🛍️  BRODERIE — Frontend démarré', 'color:#6366f1;font-weight:bold;font-size:13px')
  console.log('%cEnv         %c' + import.meta.env.MODE,      'color:gray', 'color:#22c55e;font-weight:bold')
  console.log('%cAPI URL     %c' + (import.meta.env.VITE_API_URL ?? '/api/v1'), 'color:gray', 'color:#38bdf8')
  console.log('%cVersion     %c' + pkg.version,               'color:gray', 'color:#f59e0b')
  console.log('%cGoogle Auth %c' + (GOOGLE_CLIENT_ID ? '✅ configuré' : '⚠️  VITE_GOOGLE_CLIENT_ID manquant'), 'color:gray', 'color:inherit')
  console.groupEnd()
}

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <AuthProvider>
      {/* ToastProvider au sommet — tout contexte/composant en dessous peut afficher des toasts */}
      <ToastProvider>
        <CartProvider>
          <CartDrawerProvider>
            <WishlistProvider>
              <RouterProvider router={router} />
            </WishlistProvider>
          </CartDrawerProvider>
        </CartProvider>
      </ToastProvider>
    </AuthProvider>
  </GoogleOAuthProvider>,
)
