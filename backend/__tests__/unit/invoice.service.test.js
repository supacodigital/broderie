// Tests unitaires invoice.service — génération PDF facture

const { generateInvoicePDF, computeTaxBreakdown } = require('../../services/invoice.service');
const { roundCHF } = require('../../utils/chf.utils');

function makeOrder(overrides = {}) {
  return {
    id: 1042,
    created_at: new Date('2026-05-01'),
    subtotal: '49.90',
    shipping_cost: '8.50',
    tax_amount: '3.74',
    total: '58.40',
    items: [],
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    first_name: 'Julie',
    last_name: 'Test',
    email: 'julie@broderie.ch',
    ...overrides,
  };
}

describe('invoice.service — generateInvoicePDF()', () => {
  test('retourne un Buffer non vide', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder(), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('le Buffer commence par la signature PDF (%PDF)', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder(), user: makeUser() });

    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });

  test('fonctionne sans items (commande vide)', async () => {
    const buf = await generateInvoicePDF({ order: makeOrder({ items: [] }), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('fonctionne avec plusieurs articles incluant un SKU', async () => {
    const items = [
      {
        product_id: 1, quantity: 2, unit_price: '24.95', tax_rate_snapshot: '8.10',
        product_snapshot_json: JSON.stringify({ name: 'Fil DMC rouge', sku: 'DMC-321' }),
      },
      {
        product_id: 2, quantity: 1, unit_price: '12.50', tax_rate_snapshot: '8.10',
        product_snapshot_json: JSON.stringify({ name: 'Aiguille broderie' }),
      },
    ];
    // 24.95*2 + 12.50 = 62.40 TTC ; TVA 8.1 % incluse ≈ 4.68
    const order = makeOrder({ items, subtotal: '62.40', discount: '0.00', tax_amount: '4.68', total: '70.90' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('fonctionne avec product_snapshot_json déjà parsé (objet)', async () => {
    const items = [
      {
        product_id: 3, quantity: 1, unit_price: '8.90', tax_rate_snapshot: '8.10',
        product_snapshot_json: { name: 'Canevas', sku: 'CNV-01' },
      },
    ];
    const order = makeOrder({ items, subtotal: '8.90', discount: '0.00', tax_amount: '0.67', total: '17.40' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('gère un article sans product_snapshot_json (fallback nom générique)', async () => {
    const items = [
      { product_id: 5, quantity: 1, unit_price: '5.00', tax_rate_snapshot: '8.10', product_snapshot_json: null },
    ];
    const order = makeOrder({ items, subtotal: '5.00', discount: '0.00', tax_amount: '0.37', total: '13.50' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('facture avec plusieurs taux de TVA : génération OK', async () => {
    const items = [
      { product_id: 1, quantity: 1, unit_price: '108.10', tax_rate_snapshot: '8.10',
        product_snapshot_json: { name: 'Kit' } },
      { product_id: 2, quantity: 1, unit_price: '102.60', tax_rate_snapshot: '2.60',
        product_snapshot_json: { name: 'Livre' } },
    ];
    const order = makeOrder({ items, subtotal: '210.70', tax_amount: '10.70', total: '219.20', discount: '0.00' });
    const buf = await generateInvoicePDF({ order, user: makeUser() });
    expect(buf.toString('ascii', 0, 4)).toBe('%PDF');
  });
});

describe('invoice.service — computeTaxBreakdown()', () => {
  test('commande sans items : tableau vide', () => {
    expect(computeTaxBreakdown(makeOrder({ items: [] }))).toEqual([]);
  });

  test('un seul taux : la somme des TVA ventilées == order.tax_amount', () => {
    const items = [
      { unit_price: '54.05', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '54.05', quantity: 1, tax_rate_snapshot: '8.10' },
    ];
    const order = makeOrder({ items, subtotal: '108.10', discount: '0.00', tax_amount: '8.10' });
    const parts = computeTaxBreakdown(order);
    expect(parts).toHaveLength(1);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(8.10);
  });

  test('deux taux : la somme des TVA ventilées == order.tax_amount', () => {
    const items = [
      { unit_price: '108.10', quantity: 1, tax_rate_snapshot: '8.10' },
      { unit_price: '102.60', quantity: 1, tax_rate_snapshot: '2.60' },
    ];
    // TVA réelle : 8.10 (sur 108.10) + 2.60 (sur 102.60) = 10.70
    const order = makeOrder({ items, subtotal: '210.70', discount: '0.00', tax_amount: '10.70' });
    const parts = computeTaxBreakdown(order);
    expect(parts.map((p) => p.ratePercent)).toEqual([2.6, 8.1]);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(10.70);
  });

  test('avec remise : réconcilie toujours avec order.tax_amount', () => {
    const items = [
      { unit_price: '100.00', quantity: 1, tax_rate_snapshot: '8.10' },
    ];
    // subtotal stocké 90 (après remise 10), tax_amount recalculé côté order.service
    const order = makeOrder({ items, subtotal: '90.00', discount: '10.00', tax_amount: '6.75' });
    const parts = computeTaxBreakdown(order);
    expect(roundCHF(parts.reduce((s, p) => s + p.tvaAmount, 0))).toBe(6.75);
  });
});
