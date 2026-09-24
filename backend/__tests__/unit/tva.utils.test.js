const { extractTVA, toHT, toTTC, computeOrderVat } = require('../../utils/tva.utils');

describe('extractTVA — extraction TVA depuis le TTC', () => {
  test('taux normal 8.1%', () => {
    // 108.10 TTC → TVA = 108.10 * 0.081 / 1.081 ≈ 8.10
    const tva = extractTVA(108.10, 0.081);
    expect(tva).toBe(8.10);
  });

  test('taux réduit 2.6%', () => {
    const tva = extractTVA(102.60, 0.026);
    expect(tva).toBe(2.60);
  });

  test('taux hôtelier 3.8%', () => {
    const tva = extractTVA(103.80, 0.038);
    expect(tva).toBe(3.80);
  });

  test('retourne 0 pour un montant nul', () => {
    expect(extractTVA(0, 0.081)).toBe(0);
  });
});

describe('toHT — conversion TTC → HT', () => {
  test('taux normal 8.1%', () => {
    const ht = toHT(108.10, 0.081);
    expect(ht).toBe(100.00);
  });
});

describe('toTTC — conversion HT → TTC', () => {
  test('taux normal 8.1%', () => {
    const ttc = toTTC(100, 0.081);
    expect(ttc).toBe(108.10);
  });

  test('taux réduit 2.6%', () => {
    const ttc = toTTC(100, 0.026);
    expect(ttc).toBe(102.60);
  });
});

/* ADM-14 — TVA d'une commande, frais de port compris, au centime.
   Source unique : order.service la stocke, la facture la réimprime. */
describe('computeOrderVat — TVA de la commande, port compris', () => {
  const item = (price, qty, rate = '8.10') => ({ unit_price: price, quantity: qty, tax_rate_snapshot: rate });

  test('le port porte la TVA de la marchandise (facture 2026-000009)', () => {
    const vat = computeOrderVat({ items: [item('33.75', 1)], discountedSubtotal: 33.75, shippingCost: 11.25 });
    expect(vat.total).toBe(3.37);
    expect(vat.parts).toEqual([{
      ratePercent: 8.1, itemsTTC: 33.75, shippingTTC: 11.25, baseTTC: 45, tvaAmount: 3.37, baseHT: 41.63,
    }]);
  });

  test('TVA au centime, pas au 5 centimes', () => {
    // 15.50 × 8.1 / 108.1 = 1.1614 → 1.16 (l'arrondi CHF donnait 1.15)
    expect(computeOrderVat({ items: [item('15.50', 1)], discountedSubtotal: 15.5, shippingCost: 0 }).total).toBe(1.16);
  });

  test('sans port (retrait en boutique) : TVA sur les seuls articles', () => {
    const vat = computeOrderVat({ items: [item('100.00', 1)], discountedSubtotal: 100, shippingCost: 0 });
    expect(vat.total).toBe(7.49);
    expect(vat.parts[0].shippingTTC).toBe(0);
  });

  test('plusieurs taux : port et remise répartis au prorata, bases exactes', () => {
    const vat = computeOrderVat({
      items: [item('33.35', 1, '8.10'), item('16.65', 1, '2.60')],
      discountedSubtotal: 45.00, // 50.00 - 5.00 de remise
      shippingCost: 8.50,
    });
    expect(vat.parts.map((p) => p.ratePercent)).toEqual([2.6, 8.1]);
    // Aucun centime perdu ni créé par la répartition
    const sum = (key) => Math.round(vat.parts.reduce((s, p) => s + p[key], 0) * 100) / 100;
    expect(sum('itemsTTC')).toBe(45.00);
    expect(sum('shippingTTC')).toBe(8.50);
    expect(sum('baseTTC')).toBe(53.50);
    expect(Math.round((sum('baseHT') + vat.total) * 100) / 100).toBe(53.50);
  });

  test('remise de 100 % : le port reste taxé', () => {
    const vat = computeOrderVat({ items: [item('20.00', 1)], discountedSubtotal: 0, shippingCost: 8.50 });
    expect(vat.parts[0].itemsTTC).toBe(0);
    expect(vat.parts[0].shippingTTC).toBe(8.5);
    expect(vat.total).toBe(0.64);
  });

  test('taux manquant : repli sur 8.1 %', () => {
    const vat = computeOrderVat({ items: [{ unit_price: '10.00', quantity: 1 }], discountedSubtotal: 10, shippingCost: 0 });
    expect(vat.parts[0].ratePercent).toBe(8.1);
  });
});
