/* Vente à la coupe — trames et bandes à broder (ticket ADM-12).

   Ces articles se vendent au mètre, mais la cliente en achète la longueur dont
   elle a besoin : par tranches de 10 cm, avec un minimum de 50 cm.

   Convention retenue dans tout le backend :
     * `products.price_chf` est le PRIX AU MÈTRE ;
     * `cart_items.quantity` et `order_items.quantity` comptent des TRONÇONS de
       `length_step_cm`. Commander 60 cm d'une bande à 16.50/m, c'est une
       quantité de 6 à 1.65 le tronçon.

   Compter en tronçons plutôt qu'en centimètres évite d'ajouter une colonne de
   longueur aux lignes de panier et de commande : les totaux, la TVA et les
   remises continuent de fonctionner sans cas particulier, et une commande
   passée avant cette évolution garde son sens. Seul le stock, tenu en
   centimètres, se convertit (voir stockUnits plus bas). */

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

/* Unité du stock (ADM-12).

   `products.stock` compte des PIÈCES, ou des CENTIMÈTRES pour un article vendu
   à la coupe : 2.15 m en stock = 215. La boutique saisit et lit des mètres à
   deux décimales ; seule la base compte en centimètres, ce qui garde une
   colonne entière pour tout le catalogue. */
const CM_PER_METER = 100;

/* Unités de stock retirées par `quantity` : autant de pièces, ou pour un
   article à la coupe la longueur des tronçons (6 tronçons de 10 cm = 60). */
const stockUnits = (product, quantity) =>
  (isSoldByLength(product) ? quantity * stepCm(product) : quantity);

/* Stock disponible exprimé dans l'unité de `quantity` : pièces, ou nombre de
   tronçons entiers que la longueur en stock permet de couper (2.15 m → 21 de
   10 cm). */
const availableQuantity = (product) => {
  const stock = Number(product?.stock) || 0;
  if (!isSoldByLength(product)) return stock;
  return Math.floor(stock / stepCm(product));
};

/* Facteur SQL ramenant un stock à l'unité de vente affichée (pièce ou mètre) :
   les seuils « stock bas » (≤ 5) valent 5 pièces ou 5 m, comme avant le
   passage au centimètre. */
const stockScaleSql = (alias = 'p') =>
  `(CASE WHEN ${alias}.sold_by_length = 1 THEN ${CM_PER_METER} ELSE 1 END)`;

/* Stock lisible dans l'unité de saisie de la boutique : « 2.15 m » pour un
   article à la coupe, le nombre de pièces sinon (exports CSV et Excel). */
const formatStock = (product, stock = product?.stock) =>
  (isSoldByLength(product)
    ? `${(Number(stock || 0) / CM_PER_METER).toFixed(2)} m`
    : String(stock ?? 0));

/* Quantité commandée lisible : tronçons convertis en mètres pour un article à
   la coupe (6 tronçons de 10 cm → « 0.60 m »), pièces sinon. */
const formatQuantity = (product, quantity) =>
  (isSoldByLength(product)
    ? `${((Number(quantity) || 0) * stepCm(product) / CM_PER_METER).toFixed(2)} m`
    : String(quantity));

/* Ligne de commande d'un article à la coupe : quantité en centimètres
   (« 60 cm » pour 6 tronçons de 10 cm) et prix unitaire rapporté au tronçon
   (« / 10 cm ») — ce qui a été facturé, sans reconversion au mètre d'un prix
   déjà arrondi. Pour un article à la pièce : la quantité seule, sans unité. */
const lineQuantityLabel = (item) =>
  (isSoldByLength(item) ? `${lengthFromQuantity(item, Number(item.quantity) || 0)} cm` : String(item.quantity));
const lineUnitSuffix = (item) => (isSoldByLength(item) ? ` / ${stepCm(item)} cm` : '');

module.exports = {
  CM_PER_METER,
  lineQuantityLabel,
  lineUnitSuffix,
  formatStock,
  formatQuantity,
  stockUnits,
  stockScaleSql,
  availableQuantity,
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
