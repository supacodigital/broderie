/* Tranche de frais de port applicable à un poids — ticket ADM-10 */
const { pickShippingRate } = require('../../utils/shipping.utils');

const GRID = [
  { min_weight: '10.000', max_weight: '30.000', price_chf: '22.00' },
  { min_weight: '0.000', max_weight: '0.100', price_chf: '3.00' },
  { min_weight: '0.101', max_weight: '2.000', price_chf: '5.00' },
  { min_weight: '2.001', max_weight: '10.000', price_chf: '10.00' },
];
const priceFor = (w) => pickShippingRate(GRID, w).price_chf;

describe('pickShippingRate — tranche de poids', () => {
  test('choisit la première tranche dont le plafond couvre le poids', () => {
    expect(priceFor(0)).toBe('3.00');
    expect(priceFor(0.1)).toBe('3.00');
    expect(priceFor(2)).toBe('5.00');
    expect(priceFor(10)).toBe('10.00');
    expect(priceFor(30)).toBe('22.00');
  });

  // 100.4 g tombait entre 0.100 et 0.101 kg et repartait au tarif le moins cher
  test('un poids entre deux tranches prend la tranche supérieure', () => {
    expect(priceFor(0.1004)).toBe('5.00');
    expect(priceFor(2.0005)).toBe('10.00');
  });

  // Un colis de 31 kg était facturé au tarif d'une lettre
  test('au-delà de la dernière tranche, la plus lourde s\'applique', () => {
    expect(priceFor(31)).toBe('22.00');
    expect(priceFor(250)).toBe('22.00');
  });

  test('poids absent ou négatif : première tranche', () => {
    expect(priceFor(undefined)).toBe('3.00');
    expect(priceFor(-1)).toBe('3.00');
  });

  test('grille vide : aucune tranche', () => {
    expect(pickShippingRate([], 1)).toBeNull();
  });
});
