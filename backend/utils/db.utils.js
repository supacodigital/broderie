const { AppError } = require('../middlewares/errorHandler');

// Associe une clé/contrainte MySQL (extraite du message d'erreur brut) à un message métier clair.
// Clé : fragment du nom de la contrainte tel qu'il apparaît dans err.sqlMessage.
const DUPLICATE_MESSAGES = {
  uq_products_slug:        'Ce slug est déjà utilisé par un autre produit.',
  uq_products_sku:         'Cette référence (SKU) est déjà utilisée par un autre produit.',
  uq_prod_trans_slug_locale: 'Ce slug est déjà utilisé pour cette langue.',
  uq_categories_slug:      'Ce slug est déjà utilisé par une autre catégorie.',
  uq_tags_slug:            'Ce slug est déjà utilisé par un autre tag.',
  uq_coupons_code:         'Ce code promo est déjà utilisé.',
  uq_users_email:          'Cette adresse email est déjà utilisée.',
  uq_newsletter_email:     'Cette adresse email est déjà inscrite à la newsletter.',
};

const FK_MESSAGES = {
  fk_products_category: 'La catégorie sélectionnée est introuvable.',
  fk_products_supplier: 'Le fournisseur sélectionné est introuvable.',
  fk_products_tax:      'Le taux de TVA sélectionné est introuvable.',
  fk_categories_parent: 'La catégorie parente sélectionnée est introuvable.',
  fk_product_tags_tag:  "Un des tags sélectionnés est introuvable.",
};

// Convertit une erreur MySQL connue (doublon, clé étrangère invalide) en AppError lisible.
// Retourne l'erreur d'origine si elle n'est pas reconnue — laisse errorHandler.js gérer le 500 générique.
const mapDbError = (error) => {
  if (error.code === 'ER_DUP_ENTRY') {
    const key = Object.keys(DUPLICATE_MESSAGES).find((k) => error.sqlMessage?.includes(k));
    return new AppError(key ? DUPLICATE_MESSAGES[key] : 'Cette valeur est déjà utilisée.', 409);
  }

  if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
    const key = Object.keys(FK_MESSAGES).find((k) => error.sqlMessage?.includes(k));
    return new AppError(key ? FK_MESSAGES[key] : 'Une référence liée est introuvable.', 400);
  }

  if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
    return new AppError('Impossible de supprimer : cet élément est encore utilisé ailleurs.', 400);
  }

  return error;
};

module.exports = { mapDbError };
