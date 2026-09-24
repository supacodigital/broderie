const { compareUnitPrice, salePercent } = require('../../utils/sale.utils');

/* CLI-14 — prix normal d'un article acheté en action, à l'unité facturée */
describe('sale.utils', () => {
  test('article à la pièce : prix normal du snapshot', () => {
    expect(compareUnitPrice({ compare_price_chf: '2.00' }, { unit_price: '1.50' })).toBe(2);
  });

  test('vente à la coupe : prix au mètre ramené au tronçon', () => {
    expect(compareUnitPrice({ compare_price_chf: '4.00' }, { unit_price: '0.30', sold_by_length: 1, length_step_cm: 10 })).toBe(0.4);
  });

  test.each([
    [{ compare_price_chf: null }, { unit_price: '10.00' }],
    [{}, { unit_price: '10.00' }],
    [{ compare_price_chf: '10.00' }, { unit_price: '10.00' }],   // pas de remise réelle
    [{ compare_price_chf: '8.00' }, { unit_price: '10.00' }],    // prix « normal » inférieur
  ])('hors action : null (%j)', (snapshot, item) => {
    expect(compareUnitPrice(snapshot, item)).toBeNull();
  });

  test('remise en pour cent', () => {
    expect(salePercent(1.5, 2)).toBe(25);
    expect(salePercent(10, null)).toBe(0);
  });
});
