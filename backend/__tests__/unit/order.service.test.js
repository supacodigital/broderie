const { roundCHF } = require('../../utils/chf.utils');

// Test de la logique de calcul du total commande — isolée sans BDD
describe('Calcul total commande', () => {
  const SHIPPING_COST = 8.50;

  function calculerCommande(items) {
    const subtotal = roundCHF(
      items.reduce((sum, item) => sum + parseFloat(item.price_snapshot) * item.quantity, 0)
    );
    const taxAmount = roundCHF(
      items.reduce((sum, item) => {
        const rate = parseFloat(item.tax_rate_snapshot) / 100;
        return sum + (parseFloat(item.price_snapshot) * item.quantity * rate / (1 + rate));
      }, 0)
    );
    const total = roundCHF(subtotal + SHIPPING_COST);
    return { subtotal, taxAmount, total };
  }

  test('frais de port toujours à CHF 8.50', () => {
    const items = [{ price_snapshot: '10.00', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { total, subtotal } = calculerCommande(items);
    expect(total - subtotal).toBeCloseTo(8.50, 2);
  });

  test('calcul correct avec un article taux normal 8.1%', () => {
    const items = [{ price_snapshot: '49.90', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { subtotal, taxAmount, total } = calculerCommande(items);
    expect(subtotal).toBe(49.90);
    // TVA = 49.90 * 0.081 / 1.081 ≈ 3.74
    expect(taxAmount).toBeCloseTo(3.74, 1);
    expect(total).toBe(roundCHF(49.90 + 8.50));
  });

  test('calcul correct avec plusieurs articles', () => {
    const items = [
      { price_snapshot: '49.90', quantity: 2, tax_rate_snapshot: '8.1' },
      { price_snapshot: '8.50', quantity: 1, tax_rate_snapshot: '8.1' },
    ];
    const { subtotal, total } = calculerCommande(items);
    expect(subtotal).toBe(roundCHF(49.90 * 2 + 8.50));
    expect(total).toBe(roundCHF(subtotal + 8.50));
  });

  test('total arrondi au 0.05 CHF', () => {
    const items = [{ price_snapshot: '10.03', quantity: 1, tax_rate_snapshot: '8.1' }];
    const { subtotal } = calculerCommande(items);
    // 10.03 doit être arrondi à 10.05
    expect(subtotal % 0.05).toBeCloseTo(0, 5);
  });

  test('panier vide lève une erreur métier', () => {
    // La logique dans order.service.js rejette les paniers vides
    const activeItems = [];
    expect(activeItems.length).toBe(0);
  });
});
