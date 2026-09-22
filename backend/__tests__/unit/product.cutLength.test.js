/* Vente à la coupe — trames et bandes à broder (ADM-12).

   Ces articles se vendent au mètre mais s'achètent par tranches de 10 cm, avec
   un minimum de 50 cm. Ces tests portent sur la cohérence des réglages saisis
   depuis l'administration : c'est elle qui décide si la longueur annoncée sur
   la fiche est bien celle que la boutique vendra. */

const { productCreateSchema } = require('../../validators/product.validator');

const BASE = {
  categoryId: 1,
  slug: 'bande-a-broder-lin',
  priceChf: 16.50,
  taxRateId: 1,
  stock: 4,
  translations: { fr: { name: 'Bande à broder lin' } },
};

const parse = (extra) => productCreateSchema.safeParse({ ...BASE, ...extra });

describe('vente à la coupe — cohérence des réglages (ADM-12)', () => {
  test('accepte les valeurs par défaut : tranches de 10 cm, minimum 50 cm', () => {
    const res = parse({ soldByLength: true, lengthStepCm: 10, lengthMinCm: 50 });
    expect(res.success).toBe(true);
  });

  /* Avec un pas de 10 cm et un minimum de 55, la première longueur réellement
     commandable serait 60 : la fiche annoncerait 55 et la boutique vendrait 60. */
  test("refuse un minimum qui n'est pas un multiple du pas", () => {
    const res = parse({ soldByLength: true, lengthStepCm: 10, lengthMinCm: 55 });
    expect(res.success).toBe(false);
    expect(res.error.issues.some(i => i.path.includes('lengthMinCm'))).toBe(true);
  });

  test('refuse un minimum inférieur au pas de découpe', () => {
    const res = parse({ soldByLength: true, lengthStepCm: 20, lengthMinCm: 10 });
    expect(res.success).toBe(false);
  });

  test('accepte un autre pas cohérent — tranches de 5 cm, minimum 25 cm', () => {
    const res = parse({ soldByLength: true, lengthStepCm: 5, lengthMinCm: 25 });
    expect(res.success).toBe(true);
  });

  /* Un article vendu à l'unité n'a pas de longueur : ses réglages de découpe ne
     doivent jamais être contrôlés, sinon créer un simple kit deviendrait impossible. */
  test('ignore les réglages de découpe sur un article vendu à l\'unité', () => {
    const res = parse({ soldByLength: false, lengthStepCm: 10, lengthMinCm: 55 });
    expect(res.success).toBe(true);
  });

  test('refuse un pas nul ou négatif', () => {
    expect(parse({ soldByLength: true, lengthStepCm: 0, lengthMinCm: 50 }).success).toBe(false);
    expect(parse({ soldByLength: true, lengthStepCm: -5, lengthMinCm: 50 }).success).toBe(false);
  });
});
