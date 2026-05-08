const { extractTVA, toHT, toTTC } = require('../../utils/tva.utils');

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
