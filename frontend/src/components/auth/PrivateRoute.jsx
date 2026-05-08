import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.jsx'

/* Protège les routes qui nécessitent une authentification.
   Redirige vers /connexion en conservant la destination pour y revenir après login. */
export default function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  /* Pendant la restauration de session (refresh silencieux), on attend */
  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />
  }

  return children
}
