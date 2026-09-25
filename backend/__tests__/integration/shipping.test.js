/* Frais de port selon le montant des articles — ticket ADM-10.
   Julie : « le modèle par tranches de poids est inadapté, impossible de
   renseigner le poids de plus de 15 000 références ». Parcours réel : grille
   réglée dans l'admin, tarif affiché par l'API publique (panier, caisse), et
   frais facturés sur une vraie commande. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');
const { registerVerifiedUser } = require('../helpers/auth.helper');

const stamp = Date.now();
const address = {
  first_name: 'Test', last_name: 'Adm10', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};
// Grille de test : jusqu'à 50 → 9.00, jusqu'à 100 → 12.00, au-delà → 15.00
const GRID = [
  { maxAmountChf: 50, priceChf: 9, estimatedDays: '3-5' },
  { maxAmountChf: 100, priceChf: 12, estimatedDays: '3-5' },
  { maxAmountChf: null, priceChf: 15, estimatedDays: '3-5' },
];

let adminToken;
let previousGrid;
let productId;
const couponCode = `ADM10-${stamp}`;

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
const priceFor = async (query) => {
  const res = await request(app).get('/api/v1/shipping/rates').query(query);
  expect(res.status).toBe(200);
  return res.body.data.price_chf;
};

const createAdminToken = async () => {
  const email = `adm10.admin.${stamp}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Adm10' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

const placeOrder = async ({ quantity, coupon = null }) => {
  const { token } = await registerVerifiedUser('adm10');
  await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ productId, quantity });
  const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
    .send({ address, payment_method: 'invoice_qr', items: [], ...(coupon ? { coupon_code: coupon } : {}) });
  expect(res.status).toBe(201);
  const [[order]] = await pool.query('SELECT subtotal, discount, shipping_cost FROM orders WHERE id = ?', [res.body.data.id]);
  return order;
};

beforeAll(async () => {
  adminToken = await createAdminToken();
  // La grille de la base de test est remise telle quelle à la fin
  [previousGrid] = await pool.query('SELECT max_amount_chf, price_chf, estimated_days FROM shipping_amount_rates');
  const put = await request(app).put('/api/v1/admin/settings/shipping').set(adminAuth()).send({ rates: GRID });
  expect(put.status).toBe(200);

  // Article à CHF 30.00 : 1 → 30, 2 → 60, 4 → 120
  const sku = `ADM10-${stamp}`;
  const [r] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, tax_rate_id, sku, stock, weight_kg, is_active)
     VALUES (101, ?, 30.00, 1, ?, 100, NULL, 1)`,
    [sku.toLowerCase(), sku]
  );
  productId = r.insertId;
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug) VALUES (?, 'fr', ?, '', ?)`,
    [productId, `Kit test ADM-10 ${stamp}`, sku.toLowerCase()]
  );
  // Code promo de 20 % : fait passer 60 → 48, sous le plafond de 50
  await pool.query(
    `INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active)
     VALUES (?, 'percent', 20, 0, NULL, 0, NULL, 1)`,
    [couponCode]
  );
}, 30000);

afterAll(async () => {
  await pool.query('DELETE FROM shipping_amount_rates');
  if (previousGrid.length) {
    await pool.query(
      `INSERT INTO shipping_amount_rates (max_amount_chf, price_chf, estimated_days) VALUES ${previousGrid.map(() => '(?, ?, ?)').join(', ')}`,
      previousGrid.flatMap((g) => [g.max_amount_chf, g.price_chf, g.estimated_days])
    );
  }
  require('../../config/cache').cache.flushAll();
  await pool.query('DELETE FROM cart_items WHERE product_id = ?', [productId]);
  await pool.query('UPDATE products SET is_active = 0, deleted_at = NOW() WHERE id = ?', [productId]);
  await pool.query('UPDATE coupons SET is_active = 0 WHERE code = ?', [couponCode]);
});

describe('Frais de port selon le montant — GET /api/v1/shipping/rates', () => {
  test('structure complète, route publique (aucun token)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ amount: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { currency: 'CHF', estimated_days: '3-5' } });
    expect(res.body.data.carrier).toMatch(/swiss post/i);
    expect(typeof res.body.data.price_chf).toBe('number');
  });

  test('chaque montant prend le tarif de sa tranche', async () => {
    expect(await priceFor({ amount: 0 })).toBe(9);
    expect(await priceFor({ amount: 50 })).toBe(9);
    expect(await priceFor({ amount: 50.05 })).toBe(12);
    expect(await priceFor({ amount: 100 })).toBe(12);
    expect(await priceFor({ amount: 100.05 })).toBe(15);
    expect(await priceFor({ amount: 5000 })).toBe(15);
  });

  test('montant absent, invalide ou négatif : première tranche', async () => {
    expect(await priceFor({})).toBe(9);
    expect(await priceFor({ amount: 'abc' })).toBe(9);
    expect(await priceFor({ amount: -1 })).toBe(9);
  });
});

describe('Frais de port selon le montant — commande réelle', () => {
  test('la commande est facturée au tarif de sa tranche', async () => {
    expect(await placeOrder({ quantity: 1 })).toMatchObject({ subtotal: '30.00', shipping_cost: '9.00' });
    expect(await placeOrder({ quantity: 2 })).toMatchObject({ subtotal: '60.00', shipping_cost: '12.00' });
    expect(await placeOrder({ quantity: 4 })).toMatchObject({ subtotal: '120.00', shipping_cost: '15.00' });
  });

  test('un code promo ne fait pas changer de tranche (montant avant code)', async () => {
    const order = await placeOrder({ quantity: 2, coupon: couponCode });
    expect(parseFloat(order.discount)).toBeCloseTo(12);
    expect(order.shipping_cost).toBe('12.00'); // 60 avant code, et non 48
  });

  test('forfait : une seule tranche s\'applique à toutes les commandes', async () => {
    const put = await request(app).put('/api/v1/admin/settings/shipping').set(adminAuth())
      .send({ rates: [{ maxAmountChf: null, priceChf: 7.5, estimatedDays: '3-5' }] });
    expect(put.status).toBe(200);
    expect(await priceFor({ amount: 10 })).toBe(7.5);
    expect(await priceFor({ amount: 900 })).toBe(7.5);
    expect(await placeOrder({ quantity: 4 })).toMatchObject({ shipping_cost: '7.50' });
    await request(app).put('/api/v1/admin/settings/shipping').set(adminAuth()).send({ rates: GRID });
  });
});

describe('Frais de port selon le montant — grille dans l\'admin', () => {
  test('la grille relue est triée, « au-delà » en dernier', async () => {
    const res = await request(app).get('/api/v1/admin/settings/shipping').set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => [r.max_amount_chf, r.price_chf])).toEqual([
      ['50.00', '9.00'], ['100.00', '12.00'], [null, '15.00'],
    ]);
  });

  test('une tranche à CHF 0 est refusée (frais toujours payants)', async () => {
    const res = await request(app).put('/api/v1/admin/settings/shipping').set(adminAuth())
      .send({ rates: [{ maxAmountChf: 50, priceChf: 9 }, { maxAmountChf: null, priceChf: 0 }] });
    expect(res.status).toBe(400);
    expect(await priceFor({ amount: 500 })).toBe(15);
  });

  test('réservé à l\'administration', async () => {
    const res = await request(app).put('/api/v1/admin/settings/shipping').send({ rates: GRID });
    expect(res.status).toBe(401);
  });
});
