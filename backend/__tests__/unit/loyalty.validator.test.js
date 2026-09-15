// Tests unitaires du validateur de paliers de fidélité — aucune BDD requise.
// Non-régression : un palier « percent » à 100 offrait la commande entière au client.

const { tierShapeSchema, MAX_PERCENT } = require('../../validators/loyalty.validator');

const validTier = (overrides = {}) => ({
  name: 'Argent',
  minSpendChf: 200,
  rewardType: 'fixed',
  rewardValue: 20,
  rewardValidityDays: 90,
  ...overrides,
});

describe('loyalty.validator — plafond des remises en pourcentage', () => {
  test('refuse une remise de 100 %', () => {
    const res = tierShapeSchema.safeParse(validTier({ rewardType: 'percent', rewardValue: 100 }));
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(['rewardValue']);
  });

  test(`refuse une remise juste au-dessus de ${MAX_PERCENT} %`, () => {
    const res = tierShapeSchema.safeParse(validTier({ rewardType: 'percent', rewardValue: MAX_PERCENT + 1 }));
    expect(res.success).toBe(false);
  });

  test(`accepte une remise de ${MAX_PERCENT} %`, () => {
    const res = tierShapeSchema.safeParse(validTier({ rewardType: 'percent', rewardValue: MAX_PERCENT }));
    expect(res.success).toBe(true);
  });

  test('le plafond ne s\'applique pas aux montants fixes en CHF', () => {
    const res = tierShapeSchema.safeParse(validTier({ rewardType: 'fixed', rewardValue: 200 }));
    expect(res.success).toBe(true);
  });
});

describe('loyalty.validator — champs obligatoires', () => {
  test('accepte un palier complet et valide', () => {
    expect(tierShapeSchema.safeParse(validTier()).success).toBe(true);
  });

  test('refuse un nom vide', () => {
    expect(tierShapeSchema.safeParse(validTier({ name: '   ' })).success).toBe(false);
  });

  test('refuse un type de récompense inconnu', () => {
    expect(tierShapeSchema.safeParse(validTier({ rewardType: 'points' })).success).toBe(false);
  });

  test('refuse un seuil ou une valeur négative', () => {
    expect(tierShapeSchema.safeParse(validTier({ minSpendChf: -10 })).success).toBe(false);
    expect(tierShapeSchema.safeParse(validTier({ rewardValue: 0 })).success).toBe(false);
  });
});
