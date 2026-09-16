// Tests unitaires length.utils — vente à la coupe (ticket ADM-12)

const L = require('../../utils/length.utils');

// Bande à broder à 16.50 CHF le mètre, vendue par 10 cm, minimum 50 cm
const bande = {
  sold_by_length: 1,
  price_chf: '16.50',
  length_step_cm: 10,
  length_min_cm: 50,
};

// Article ordinaire, vendu à la pièce
const kit = { sold_by_length: 0, price_chf: '45.00' };

describe('length.utils — identification', () => {
  test('reconnaît un article vendu à la coupe', () => {
    expect(L.isSoldByLength(bande)).toBe(true);
    expect(L.isSoldByLength(kit)).toBe(false);
  });

  test('applique les valeurs de repli si les paramètres manquent', () => {
    const sansParams = { sold_by_length: 1, price_chf: '10.00' };
    expect(L.stepCm(sansParams)).toBe(10);
    expect(L.minCm(sansParams)).toBe(50);
  });
});

describe('length.utils — prix', () => {
  test('dérive le prix du tronçon depuis le prix au mètre', () => {
    // 16.50 le mètre → 1.65 les 10 cm
    expect(L.pricePerStep(bande)).toBeCloseTo(1.65, 4);
  });

  /* Le prix du tronçon n'est volontairement PAS arrondi au 0.05 : arrondir
     chaque tronçon puis multiplier ferait dériver le total. */
  test('ne pré-arrondit pas le prix du tronçon', () => {
    const impair = { ...bande, price_chf: '5.50' };
    expect(L.pricePerStep(impair)).toBeCloseTo(0.55, 4);
  });

  test.each([
    [5,  8.25],   // 50 cm
    [6,  9.90],   // 60 cm
    [10, 16.50],  // 1 mètre
    [13, 21.45],  // 1 m 30
  ])('total pour %i tronçons = CHF %f', (qty, attendu) => {
    expect(L.lineTotal(L.pricePerStep(bande), qty)).toBeCloseTo(attendu, 2);
  });

  test('arrondit le total de ligne au 0.05 CHF', () => {
    // 7.00/m → 0.70 le tronçon ; 7 tronçons = 4.90
    const sept = { ...bande, price_chf: '7.00' };
    expect(L.lineTotal(L.pricePerStep(sept), 7)).toBe(4.9);
  });
});

describe('length.utils — conversions', () => {
  test('convertit tronçons ↔ centimètres', () => {
    expect(L.lengthFromQuantity(bande, 6)).toBe(60);
    expect(L.quantityFromLength(bande, 60)).toBe(6);
  });

  test('la quantité minimale vaut 5 tronçons pour 50 cm par pas de 10', () => {
    expect(L.minQuantity(bande)).toBe(5);
  });

  test('arrondit au tronçon le plus proche', () => {
    // 55 cm n'est pas un multiple de 10 : on retient 6 tronçons
    expect(L.quantityFromLength(bande, 55)).toBe(6);
  });
});

/* Régression : `products.stock` compte des MÈTRES, `quantity` des tronçons.
   Comparer les deux directement rendait incommandable tout article de moins de
   5 m en stock — 18 des 30 articles à la coupe du catalogue. */
describe('length.utils — stock disponible', () => {
  test('convertit un stock en mètres vers un nombre de tronçons', () => {
    // 1 m en stock = 10 tronçons de 10 cm
    expect(L.availableQuantity({ ...bande, stock: 1 })).toBe(10);
    expect(L.availableQuantity({ ...bande, stock: 2.5 })).toBe(25);
  });

  test('un article à la pièce garde son stock tel quel', () => {
    expect(L.availableQuantity({ ...kit, stock: 3 })).toBe(3);
  });

  test('1 m en stock permet bien de commander le minimum de 50 cm', () => {
    const dispo = L.availableQuantity({ ...bande, stock: 1 });
    expect(dispo).toBeGreaterThanOrEqual(L.minQuantity(bande));
  });

  test('un stock nul ne permet rien', () => {
    expect(L.availableQuantity({ ...bande, stock: 0 })).toBe(0);
  });
});

/* Le minimum est la règle métier explicite de la cliente : « le minimum est de
   50 cm ». Il est validé côté serveur car un appel direct à l'API ne doit pas
   permettre de contourner le champ de la boutique. */
describe('length.utils — minimum commandable', () => {
  test('refuse une longueur inférieure au minimum', () => {
    const r = L.validateLengthQuantity(bande, 4); // 40 cm
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/50 cm/);
  });

  test('accepte exactement le minimum', () => {
    expect(L.validateLengthQuantity(bande, 5).valid).toBe(true);
  });

  test('accepte au-delà du minimum', () => {
    expect(L.validateLengthQuantity(bande, 12).valid).toBe(true);
  });

  test('respecte un minimum personnalisé par produit', () => {
    const trameLarge = { ...bande, length_min_cm: 100 };
    expect(L.validateLengthQuantity(trameLarge, 9).valid).toBe(false);
    expect(L.validateLengthQuantity(trameLarge, 10).valid).toBe(true);
  });
});
