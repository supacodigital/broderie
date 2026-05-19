// Tests unitaires invoice.service — génération PDF facture

const { generateInvoicePDF } = require('../../services/invoice.service');

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
        product_id: 1, quantity: 2, unit_price: '24.95',
        product_snapshot_json: JSON.stringify({ name: 'Fil DMC rouge', sku: 'DMC-321' }),
      },
      {
        product_id: 2, quantity: 1, unit_price: '12.50',
        product_snapshot_json: JSON.stringify({ name: 'Aiguille broderie' }),
      },
    ];

    const buf = await generateInvoicePDF({ order: makeOrder({ items }), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('fonctionne avec product_snapshot_json déjà parsé (objet)', async () => {
    const items = [
      {
        product_id: 3, quantity: 1, unit_price: '8.90',
        product_snapshot_json: { name: 'Canevas', sku: 'CNV-01' },
      },
    ];

    const buf = await generateInvoicePDF({ order: makeOrder({ items }), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  test('gère un article sans product_snapshot_json (fallback nom générique)', async () => {
    const items = [
      { product_id: 5, quantity: 1, unit_price: '5.00', product_snapshot_json: null },
    ];

    const buf = await generateInvoicePDF({ order: makeOrder({ items }), user: makeUser() });

    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});
