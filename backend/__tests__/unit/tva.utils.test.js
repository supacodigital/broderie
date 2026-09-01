const { extractTVA, toHT, toTTC, ventilateTVAByRate } = require('../../utils/tva.utils');

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

describe('ventilateTVAByRate — ventilation par taux (LTVA art. 26)', () => {
  test('un seul taux : une entrée', () => {
    const parts = ventilateTVAByRate([
      { unit_price: '10.00', quantity: 2, tax_rate_snapshot: '8.10' },
      { unit_price: '30.00', quantity: 1, tax_rate_snapshot: '8.10' },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].ratePercent).toBe(8.1);
    expect(parts[0].baseTTC).toBe(50.00);
    expect(parts[0].tvaAmount).toBe(extractTVA(50.00, 0.081));
  });

  test('deux taux : triés par taux croissant', () => {
    const parts = ventilateTVAByRate([
      { unit_price: '20.00', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '10.00', quantity: 1, tax_rate_snapshot: '2.60' },
    ]);
    expect(parts.map((p) => p.ratePercent)).toEqual([2.6, 8.1]);
    expect(parts[0].baseTTC).toBe(10.00);
    expect(parts[1].baseTTC).toBe(20.00);
  });

  test('trois taux distincts', () => {
    const parts = ventilateTVAByRate([
      { unit_price: '10.00', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '10.00', quantity: 1, tax_rate_snapshot: '3.80' },
      { unit_price: '10.00', quantity: 1, tax_rate_snapshot: '2.60' },
    ]);
    expect(parts.map((p) => p.ratePercent)).toEqual([2.6, 3.8, 8.1]);
  });

  test('snapshot de taux manquant : repli sur 8.1 %', () => {
    const parts = ventilateTVAByRate([
      { unit_price: '10.00', quantity: 1 },
      { unit_price: '10.00', quantity: 1, tax_rate_snapshot: null },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].ratePercent).toBe(8.1);
    expect(parts[0].baseTTC).toBe(20.00);
  });

  test('applique le discountRatio à la base', () => {
    const parts = ventilateTVAByRate(
      [{ unit_price: '100.00', quantity: 1, tax_rate_snapshot: '8.10' }],
      0.9,
    );
    expect(parts[0].baseTTC).toBe(90.00);
  });

  test('liste vide : tableau vide', () => {
    expect(ventilateTVAByRate([])).toEqual([]);
  });

  test('arrondit la base au 0.05 CHF', () => {
    const parts = ventilateTVAByRate([
      { unit_price: '10.03', quantity: 1, tax_rate_snapshot: '8.10' },
    ]);
    expect(parts[0].baseTTC * 20 % 1).toBe(0); // multiple de 0.05
  });
});
