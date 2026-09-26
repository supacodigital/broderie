/* Onglets des paramètres — partagés par la page et par le menu latéral, qui
   les liste sous « Paramètres » (26.09). L'onglet vit dans l'URL
   (`?onglet=tax`) ; « Boutique », l'onglet par défaut, n'en a pas besoin.

   Le contenu du site (page d'accueil, bandeau, Notre Histoire, e-mails, textes
   légaux) n'est plus ici : il a son propre espace, réservé au compte
   super-administrateur (Contenu du site — 26.09). */
export const SETTINGS_TABS = [
  { key: 'store',    label: 'Boutique',    desc: 'Nom, email, téléphone' },
  { key: 'pickup',   label: 'Retrait',     desc: 'Adresse et horaires' },
  { key: 'shipping', label: 'Livraison',   desc: 'Tarifs Swiss Post' },
  { key: 'tax',      label: 'TVA',         desc: 'Taux AFC suisses' },
  { key: 'invoice',  label: 'Facturation', desc: 'Coordonnées, échéance' },
  { key: 'security', label: 'Sécurité',    desc: 'Double authentification' },
]

const DEFAULT_TAB = 'store'

// Onglet inconnu ou absent de l'URL → « Boutique »
export function resolveSettingsTab(value) {
  return SETTINGS_TABS.some((t) => t.key === value) ? value : DEFAULT_TAB
}

export function settingsTabPath(key) {
  return key === DEFAULT_TAB ? '/parametres' : `/parametres?onglet=${key}`
}
