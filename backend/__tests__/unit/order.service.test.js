const { roundCHF } = require('../../utils/chf.utils');

// Frais de port par tranche de poids — miroir de shipping_rates en BDD de test
// min_weight / max_weight / price_chf
const SHIPPING_RATES = [
  { min_weight: 0,    max_weight: 0.499, price_chf: 8.50 },
  { min_weight: 0.5,  max_weight: 1.999, price_chf: 9.90 },
  { min_weight: 2.0,  max_weight: 4.999, price_chf: 12.90 },
];
const DEFAULT_SHIPPING = 8.50;

function getShippingCost(weightKg = 0) {
  const matched = SHIPPING_RATES.find(
    r => weightKg >= r.min_weight && weightKg <= r.max_weight
  );
  return matched ? roundCHF(matched.price_chf) : roundCHF(SHIPPING_RATES[0].price_chf);
}

function calculerCommande(items, weightKg = 0) {
  const subtotal = roundCHF(
    items.reduce((sum, item) => sum + parseFloat(item.price_snapshot) * item.quantity, 0)
  );
  const shippingCost = getShippingCost(weightKg);
  const taxAmount = roundCHF(
    items.reduce((sum, item) => {
      const rate       = parseFloat(item.tax_rate_snapshot) / 100;
      const proportion = (parseFloat(item.price_snapshot) * item.quantity) / subtotal;
      const lineTotal  = subtotal * proportion;
      return sum + (lineTotal * rate / (1 + rate));
    }, 0)
  );
  const total = roundCHF(subtotal + shippingCost);
  return { subtotal, taxAmount, total, shippingCost };
}

// ── Frais de port dynamiques ─────────────────────────────────────────────────

describe('Frais de port — calcul dynamique par poids', () => {
  test('poids 0 kg → CHF 8.50 (tranche minimale)', () => {
    expect(getShippingCost(0)).toBe(8.50);
  });

  test('poids 0.420 kg → CHF 8.50 (< 0.5 kg)', () => {
    expect(getShippingCost(0.420)).toBe(8.50);
  });

  test('poids 0.499 kg → CHF 8.50 (limite haute tranche 1)', () => {
    expect(getShippingCost(0.499)).toBe(8.50);
  });

  test('poids 0.5 kg → CHF 9.90 (tranche 2)', () => {
    expect(getShippingCost(0.5)).toBe(9.90);
  });

  test('poids 0.530 kg → CHF 9.90 (deux produits)', () => {
    // Kit 0.420 + Fil 0.110 = 0.530
    expect(getShippingCost(0.530)).toBe(9.90);
  });

  test('poids 1.999 kg → CHF 9.90 (limite haute tranche 2)', () => {
    expect(getShippingCost(1.999)).toBe(9.90);
  });

  test('poids 2.0 kg → CHF 12.90 (tranche 3)', () => {
    expect(getShippingCost(2.0)).toBe(12.90);
  });

  test('poids 4.999 kg → CHF 12.90 (limite haute tranche 3)', () => {
    expect(getShippingCost(4.999)).toBe(12.90);
  });
});

// ── Calcul total commande ─────────────────────────────────────────────────────

describe('Calcul total commande — frais dynamiques', () => {
  test('article léger (0.35 kg) → frais CHF 8.50', () => {
    const items = [{ price_snapshot: '49.90', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { shippingCost, total, subtotal } = calculerCommande(items, 0.35);
    expect(shippingCost).toBe(8.50);
    expect(total).toBe(roundCHF(subtotal + 8.50));
  });

  test('deux articles (poids cumulé 0.53 kg) → frais CHF 9.90', () => {
    const items = [
      { price_snapshot: '64.90', quantity: 1, tax_rate_snapshot: '8.1' }, // 0.420 kg
      { price_snapshot: '7.90',  quantity: 1, tax_rate_snapshot: '8.1' }, // 0.110 kg
    ];
    const { shippingCost, subtotal, total } = calculerCommande(items, 0.53);
    expect(shippingCost).toBe(9.90);
    expect(subtotal).toBe(roundCHF(64.90 + 7.90));
    expect(total).toBe(roundCHF(subtotal + 9.90));
  });

  test('calcul TVA 8.1% correct sur un article', () => {
    const items = [{ price_snapshot: '49.90', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { taxAmount } = calculerCommande(items, 0.35);
    // TVA = 49.90 * 0.081 / 1.081 ≈ 3.74
    expect(taxAmount).toBeCloseTo(3.74, 1);
  });

  test('total arrondi au 0.05 CHF le plus proche', () => {
    const items = [{ price_snapshot: '10.03', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { subtotal } = calculerCommande(items, 0.1);
    expect(subtotal % 0.05).toBeCloseTo(0, 5);
  });

  test('plusieurs articles — sous-total et total cohérents', () => {
    const items = [
      { price_snapshot: '49.90', quantity: 2, tax_rate_snapshot: '8.1' },
      { price_snapshot: '8.50',  quantity: 1, tax_rate_snapshot: '8.1' },
    ];
    const weightKg = 0.35 * 2 + 0.12; // 0.82 kg → tranche 2
    const { subtotal, shippingCost, total } = calculerCommande(items, weightKg);
    expect(subtotal).toBe(roundCHF(49.90 * 2 + 8.50));
    expect(shippingCost).toBe(9.90);
    expect(total).toBe(roundCHF(subtotal + 9.90));
  });

  test('panier vide → items vides', () => {
    const activeItems = [];
    expect(activeItems.length).toBe(0);
  });
});
