require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');

/* CLI-14 — « remises et promotions non visibles : seul le prix final s'affiche
   dans le panier ». Le panier renvoie, pour un article en action, son prix
   normal à la même unité que le prix payé (tronçon de 10 cm pour la vente à
   la coupe). Les articles temporaires sont créés puis supprimés ici. */

const stamp = Date.now();
const created = [];

const createProduct = async ({ sku, price, compare, soldByLength = 0 }) => {
  const [r] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, compare_price_chf, tax_rate_id, sku, stock, weight_kg, is_active,
                           sold_by_length, length_step_cm, length_min_cm)
     VALUES (101, ?, ?, ?, 1, ?, 50, 0.050, 1, ?, 10, 50)`,
    [sku.toLowerCase(), price, compare, sku, soldByLength]
  );
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', ?, 'Article temporaire des tests CLI-14.', ?)`,
    [r.insertId, `Test action ${sku}`, sku.toLowerCase()]
  );
  created.push(r.insertId);
  return r.insertId;
};

describe('CLI-14 — prix normal des articles en action dans le panier', () => {
  let token;
  let onSale;
  let byLength;
  let regular;

  beforeAll(async () => {
    ({ token } = await registerVerifiedUser('cli14.panier'));
    onSale   = await createProduct({ sku: `CLI14-A-${stamp}`, price: 1.50, compare: 2.00 });
    byLength = await createProduct({ sku: `CLI14-M-${stamp}`, price: 3.00, compare: 4.00, soldByLength: 1 });
    regular  = await createProduct({ sku: `CLI14-N-${stamp}`, price: 10.00, compare: null });
    for (const [productId, quantity] of [[onSale, 3], [byLength, 5], [regular, 1]]) {
      await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`)
        .send({ productId, quantity });
    }
  });

  afterAll(async () => {
    if (created.length === 0) return;
    const ph = created.map(() => '?').join(', ');
    await pool.query(`DELETE FROM cart_items WHERE product_id IN (${ph})`, created);
    // Référencés par une commande de test : désactivés plutôt que supprimés
    await pool.query(`UPDATE products SET is_active = 0, deleted_at = NOW() WHERE id IN (${ph})`, created);
  });

  const line = async (productId) => {
    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data.items.find((i) => i.product_id === productId);
  };

  test('article en action : prix payé et prix normal', async () => {
    const item = await line(onSale);
    expect(Number(item.unit_price)).toBeCloseTo(1.50);
    expect(Number(item.compare_unit_price)).toBeCloseTo(2.00);
  });

  test('vente à la coupe : prix normal ramené au tronçon de 10 cm', async () => {
    const item = await line(byLength);
    expect(Number(item.unit_price)).toBeCloseTo(0.30);
    expect(Number(item.compare_unit_price)).toBeCloseTo(0.40);
  });

  test('article hors action : aucun prix normal', async () => {
    const item = await line(regular);
    expect(item.compare_unit_price).toBeNull();
  });

  // Détail de commande de la cliente (et source de la facture et de l'e-mail)
  test('commande passée : chaque ligne garde son prix normal figé à l\'achat', async () => {
    const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
      .send({
        address: { first_name: 'Test', last_name: 'Action', street: 'Chemin du Collège', street_number: '6',
                   zip: '1509', city: 'Vucherens', canton: 'VD' },
        payment_method: 'invoice_qr', items: [],
      });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/v1/orders/${res.body.data.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    const byProduct = Object.fromEntries(detail.body.data.items.map((i) => [i.product_id, i]));
    expect(Number(byProduct[onSale].compare_unit_price)).toBeCloseTo(2.00);
    expect(Number(byProduct[byLength].compare_unit_price)).toBeCloseTo(0.40);
    expect(byProduct[regular].compare_unit_price).toBeNull();
  });
});
