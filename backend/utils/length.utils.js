/* Vente à la coupe — trames et bandes à broder (ticket ADM-12).

   Ces articles se vendent au mètre, mais la cliente en achète la longueur dont
   elle a besoin : par tranches de 10 cm, avec un minimum de 50 cm.

   Convention retenue dans tout le backend :
     * `products.price_chf` est le PRIX AU MÈTRE ;
     * `cart_items.quantity` et `order_items.quantity` comptent des TRONÇONS de
       `length_step_cm`. Commander 60 cm d'une bande à 16.50/m, c'est une
       quantité de 6 à 1.65 le tronçon.

   Compter en tronçons plutôt qu'en centimètres évite d'ajouter une colonne de
   longueur aux lignes de panier et de commande : les totaux, la TVA, les
   remises et le décompte de stock continuent de fonctionner sans cas
   particulier, et une commande passée avant cette évolution garde son sens. */

const { roundCHF } = require('./chf.utils');

// Valeurs de repli si un produit est marqué « à la coupe » sans paramètres
const DEFAULT_STEP_CM = 10;
const DEFAULT_MIN_CM = 50;

const isSoldByLength = (product) => !!product?.sold_by_length;

const stepCm = (product) => Number(product?.length_step_cm) || DEFAULT_STEP_CM;
const minCm  = (product) => Number(product?.length_min_cm)  || DEFAULT_MIN_CM;

/* Prix d'un tronçon, dérivé du prix au mètre.
   Volontairement NON arrondi au 0.05 : arrondir chaque tronçon puis multiplier
   ferait dériver le total (1.65 → 1.65 × 6 = 9.90, mais 16.50/10 = 1.65 exact ;
   sur une bande à 7.00/m le tronçon vaut 0.70, et un arrondi prématuré sur des
   prix comme 5.50/m fausserait la note). L'arrondi CHF s'applique au total de
   la ligne, jamais au prix unitaire intermédiaire. */
const pricePerStep = (product) => {
  const perMeter = parseFloat(product.price_chf);
  return (perMeter * stepCm(product)) / 100;
};

// Longueur totale (cm) correspondant à un nombre de tronçons
const lengthFromQuantity = (product, quantity) => quantity * stepCm(product);

// Nombre de tronçons correspondant à une longueur en cm
const quantityFromLength = (product, lengthCm) => Math.round(lengthCm / stepCm(product));

// Quantité minimale commandable, exprimée en tronçons
const minQuantity = (product) => Math.ceil(minCm(product) / stepCm(product));

/* Valide une quantité de tronçons pour un article vendu à la coupe.
   Retourne { valid: true } ou { valid: false, message } — message en français,
   directement affichable par la boutique. */
const validateLengthQuantity = (product, quantity) => {
  const min = minQuantity(product);
  if (quantity < min) {
    return {
      valid: false,
      message: `Longueur minimale de ${minCm(product)} cm pour cet article.`,
    };
  }
  return { valid: true };
};

/* Total d'une ligne vendue à la coupe, arrondi au 0.05 CHF.
   `unitPrice` est le prix du tronçon tel qu'il a été figé à l'ajout au panier —
   on ne recalcule jamais depuis le prix courant, sinon une hausse de tarif
   modifierait une commande déjà passée. */
const lineTotal = (unitPrice, quantity) => roundCHF(parseFloat(unitPrice) * quantity);

module.exports = {
  isSoldByLength,
  stepCm,
  minCm,
  pricePerStep,
  lengthFromQuantity,
  quantityFromLength,
  minQuantity,
  validateLengthQuantity,
  lineTotal,
};
