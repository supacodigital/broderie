import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/* Remonte en haut à chaque changement de page.
 *
 * Seul le CHEMIN est surveillé, jamais les paramètres : filtres, tri et onglets
 * de l'administration vivent dans l'URL (`?category_id=101`, `?onglet=legal`).
 * En écoutant l'URL entière, cocher un filtre au milieu d'une liste de produits
 * renverrait l'utilisatrice en haut à chaque clic.
 *
 * L'administration utilise BrowserRouter, où le <ScrollRestoration /> de React
 * Router n'est pas disponible — d'où ce composant plutôt qu'une importation.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    /* `instant` et non `smooth` : un défilement animé sur un changement de page
       donne l'impression que la page bouge encore alors qu'elle est déjà prête,
       et le réglage système « animations réduites » doit être respecté. */
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
