const { roundCHF, formatCHF } = require('../../utils/chf.utils');

describe('roundCHF', () => {
  test('arrondit au 0.05 supérieur', () => {
    expect(roundCHF(10.03)).toBe(10.05);
    expect(roundCHF(10.08)).toBe(10.10);
  });

  test('arrondit au 0.05 inférieur', () => {
    expect(roundCHF(10.02)).toBe(10.00);
    expect(roundCHF(10.07)).toBe(10.05);
  });

  test('ne modifie pas un montant déjà arrondi', () => {
    expect(roundCHF(10.00)).toBe(10.00);
    expect(roundCHF(10.05)).toBe(10.05);
    expect(roundCHF(10.50)).toBe(10.50);
  });

  test('gère zéro', () => {
    expect(roundCHF(0)).toBe(0);
  });

  test('gère les grands montants', () => {
    expect(roundCHF(199.99)).toBe(200.00);
    expect(roundCHF(1234.56)).toBe(1234.55);
  });
});

describe('formatCHF', () => {
  test('retourne toujours deux décimales', () => {
    expect(formatCHF(10)).toBe('10.00');
    expect(formatCHF(10.5)).toBe('10.50');
    expect(formatCHF(10.03)).toBe('10.05');
  });
});
