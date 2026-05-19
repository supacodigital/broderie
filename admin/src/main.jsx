import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import App from './App.jsx'
import './index.css'

/* Logs de démarrage — visibles uniquement en développement */
if (import.meta.env.DEV) {
  console.groupCollapsed('%c⚙️  BRODERIE ADMIN — Back-office démarré', 'color:#f59e0b;font-weight:bold;font-size:13px')
  console.log('%cEnv     %c' + import.meta.env.MODE,                                       'color:gray', 'color:#22c55e;font-weight:bold')
  console.log('%cAPI URL %c' + (import.meta.env.VITE_API_URL ?? '/api/v1'),                'color:gray', 'color:#38bdf8')
  console.log('%cVersion %c' + (import.meta.env.VITE_APP_VERSION ?? '(non définie)'),      'color:gray', 'color:#f59e0b')
  console.log('%c⚠️  Accès réservé aux administrateurs',                                   'color:#ef4444;font-weight:bold')
  console.groupEnd()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
