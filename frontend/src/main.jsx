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
import { WishlistProvider } from './contexts/WishlistContext.jsx'

/* Animation du spinner de chargement de page */
const spinStyle = document.createElement('style')
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
document.head.appendChild(spinStyle)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <RouterProvider router={router} />
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </GoogleOAuthProvider>,
)
