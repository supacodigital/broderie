/* Tranche de frais de port applicable à un montant d'articles — ticket ADM-10
   (« le modèle par tranches de poids est inadapté »). */
const { pickShippingRate } = require('../../utils/shipping.utils');

const GRID = [
  { max_amount_chf: null,    price_chf: '15.00' }, // au-delà
  { max_amount_chf: '50.00', price_chf: '9.00' },
  { max_amount_chf: '100.00', price_chf: '12.00' },
];
const priceFor = (amount) => pickShippingRate(GRID, amount).price_chf;

describe('pickShippingRate — tranche de montant', () => {
  test('choisit la première tranche dont le plafond couvre le montant', () => {
    expect(priceFor(0)).toBe('9.00');
    expect(priceFor(50)).toBe('9.00');
    expect(priceFor(100)).toBe('12.00');
  });

  test('un montant entre deux plafonds prend la tranche supérieure', () => {
    expect(priceFor(50.05)).toBe('12.00');
  });

  test('au-delà du dernier plafond, la tranche « au-delà » s\'applique', () => {
    expect(priceFor(100.05)).toBe('15.00');
    expect(priceFor(5000)).toBe('15.00');
  });

  test('une seule tranche sans plafond : forfait pour toutes les commandes', () => {
    const forfait = [{ max_amount_chf: null, price_chf: '9.00' }];
    expect(pickShippingRate(forfait, 0).price_chf).toBe('9.00');
    expect(pickShippingRate(forfait, 999).price_chf).toBe('9.00');
  });

  test('sans tranche « au-delà », la plus haute s\'applique', () => {
    const capped = [{ max_amount_chf: '50.00', price_chf: '9.00' }, { max_amount_chf: '100.00', price_chf: '12.00' }];
    expect(pickShippingRate(capped, 250).price_chf).toBe('12.00');
  });

  test('montant absent ou négatif : première tranche', () => {
    expect(priceFor(undefined)).toBe('9.00');
    expect(priceFor(-1)).toBe('9.00');
  });

  test('grille vide : aucune tranche', () => {
    expect(pickShippingRate([], 1)).toBeNull();
  });
});
