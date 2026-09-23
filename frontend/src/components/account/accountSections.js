import { User, Package, Heart } from 'lucide-react'

/* Sections de l'espace client — source unique pour le menu du header, la
   navigation de la page compte et le menu mobile : un lien ajouté ici apparaît
   partout à la fois. `shortKey` : libellé court de la barre d'onglets mobile. */
export const ACCOUNT_SECTIONS = [
  { key: 'profile',  path: '/mon-compte/profil',    icon: User,    labelKey: 'accountNav.profile',  shortKey: 'account.tabProfile',  subKey: 'accountNav.profileSub' },
  { key: 'orders',   path: '/mon-compte/commandes', icon: Package, labelKey: 'accountNav.orders',   shortKey: 'account.tabOrders',   subKey: 'accountNav.ordersSub' },
  { key: 'wishlist', path: '/mon-compte/favoris',   icon: Heart,   labelKey: 'accountNav.wishlist', shortKey: 'account.tabWishlist', subKey: 'accountNav.wishlistSub' },
]

/* Anciennes URLs à onglets (?tab=…) — encore présentes dans des emails déjà
   envoyés et des favoris de navigateur : elles mènent à la page équivalente */
export const LEGACY_TAB_PATHS = {
  profile:   '/mon-compte/profil',
  addresses: '/mon-compte/profil',
  loyalty:   '/mon-compte/profil',
  orders:    '/mon-compte/commandes',
  wishlist:  '/mon-compte/favoris',
}
