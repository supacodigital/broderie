import { Link, useLocation } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../../contexts/CartContext.jsx'
import s from './ValidateCartButton.module.css'

/* Pages où le bouton n'a pas lieu d'être : le panier et le tunnel de commande
   mènent déjà à la validation, et les écrans d'authentification n'ont rien à voir
   avec l'achat en cours. `/commandes/:id` (historique) n'est pas concerné. */
const HIDDEN_PATHS = [
  '/panier',
  '/commande',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialiser-mot-de-passe',
]

/* Bouton « Valider mon panier » — raccourci permanent en bas de l'écran.
   Répond au signalement de la cliente : « quand le client met dans son panier, il doit
   remonter en haut de la page pour confirmer ». Le compteur du panier est dans la barre
   de navigation, donc hors écran dès qu'on descend dans une fiche produit.

   Le bouton indique le nombre d'articles et le total, pour que le client sache où il en
   est sans ouvrir quoi que ce soit. */
export default function ValidateCartButton() {
  const { itemCount, subtotal } = useCart()
  const { t } = useTranslation()
  const { pathname } = useLocation()

  /* Panier vide : rien à valider, le bouton masquerait du contenu pour rien. */
  if (itemCount === 0 || HIDDEN_PATHS.includes(pathname)) return null

  return (
    <Link
      to="/panier"
      className={s.button}
      aria-label={t('cart.validateCartAria', { count: itemCount })}
    >
      <span className={s.iconWrap} aria-hidden="true">
        <ShoppingBag size={18} />
        {/* key : rejoue l'animation à chaque ajout, ce qui signale la prise en
            compte sans déplacer le bouton ni interrompre la navigation. */}
        <span key={itemCount} className={s.badge}>
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </span>

      <span className={s.labels}>
        <span className={s.label}>{t('cart.validateCart')}</span>
        <span className={s.total}>CHF {subtotal.toFixed(2)}</span>
      </span>
    </Link>
  )
}
