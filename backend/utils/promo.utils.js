/* Promotions à durée limitée — source de vérité UNIQUE du prix réellement payé.

   Modèle de prix :
     price_chf         = prix payé PENDANT la promotion
     compare_price_chf = prix normal, affiché barré pendant la promotion
     promo_starts_at / promo_ends_at = fenêtre de validité (NULL = pas de borne)

   Hors de la fenêtre, compare_price_chf redevient le prix payé : une promotion
   expire donc d'elle-même, sans tâche planifiée ni mise à jour des lignes.

   Ces expressions sont injectées dans les SELECT plutôt que stockées en colonnes
   générées : MySQL interdit NOW() dans une expression de colonne générée. Elles
   sont exportées ici pour qu'il n'existe qu'une seule définition du prix effectif
   dans tout le backend — panier, commandes et boutique lisent la même règle. */

// Condition « une promotion est en cours à cet instant ». `alias` = alias de la table products.
const promoActiveSql = (alias = 'p') => `(
  ${alias}.compare_price_chf IS NOT NULL
  AND (${alias}.promo_starts_at IS NULL OR ${alias}.promo_starts_at <= NOW())
  AND (${alias}.promo_ends_at   IS NULL OR ${alias}.promo_ends_at   >= NOW())
)`;

/* Prix réellement payé à cet instant.
   COALESCE : un prix barré absent ramène simplement au prix de base. */
const effectivePriceSql = (alias = 'p') => `(
  CASE WHEN ${promoActiveSql(alias)}
       THEN ${alias}.price_chf
       ELSE COALESCE(${alias}.compare_price_chf, ${alias}.price_chf) END
)`;

/* Prix barré à afficher : uniquement pendant la promotion.
   Hors promo, aucun prix n'est barré — c'est tout l'objet de la fonctionnalité. */
const displayComparePriceSql = (alias = 'p') => `(
  CASE WHEN ${promoActiveSql(alias)} THEN ${alias}.compare_price_chf ELSE NULL END
)`;

/* Bloc de colonnes prêt à insérer dans un SELECT.
   `effective_price_chf` est le prix à utiliser partout côté application ;
   `compare_price_chf` est volontairement écrasé pour que le front n'affiche
   jamais un prix barré hors promotion, sans avoir à connaître les dates. */
const promoPriceColumns = (alias = 'p') => `
  ${effectivePriceSql(alias)} AS effective_price_chf,
  ${displayComparePriceSql(alias)} AS compare_price_chf,
  ${promoActiveSql(alias)} AS is_promo_active
`;

module.exports = {
  promoActiveSql,
  effectivePriceSql,
  displayComparePriceSql,
  promoPriceColumns,
};
