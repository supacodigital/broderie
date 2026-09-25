/* ADM-09 (retour de Julie du 24.09) — « Gestion basée uniquement sur la règle
   du stock minimum (ex. fil DMC rouge : stock mini 10, reste en stock 10,
   commande client 5 => réassort 5) ». Parcours réel : saisie du minimum dans la
   fiche produit, commande cliente, page Réassort et export CSV. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');
const { registerVerifiedUser } = require('../helpers/auth.helper');

const address = {
  first_name: 'Test', last_name: 'Adm09', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};
const stamp = Date.now();
let adminToken;
let supplierId;
const created = [];

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

const createAdminToken = async () => {
  const email = `adm09min.admin.${stamp}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Adm09' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

const createProduct = async ({ name, stock, soldByLength = 0 }) => {
  const sku = `ADM09-${created.length}-${stamp}`;
  const [r] = await pool.query(
    `INSERT INTO products (category_id, supplier_id, slug, price_chf, tax_rate_id, sku, stock, weight_kg, is_active,
                           sold_by_length, length_step_cm, length_min_cm)
     VALUES (101, ?, ?, 1.50, 1, ?, ?, 0.010, 1, ?, 10, 50)`,
    [supplierId, sku.toLowerCase(), sku, stock, soldByLength]
  );
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug) VALUES (?, 'fr', ?, '', ?)`,
    [r.insertId, name, sku.toLowerCase()]
  );
  created.push(r.insertId);
  return r.insertId;
};

// Enregistrement depuis la fiche produit (la fiche envoie tous ses champs)
const saveMinFromAdmin = async (productId, { stock, stockMin, soldByLength = false }) => {
  const p = (await request(app).get(`/api/v1/admin/products/${productId}`).set(adminAuth())).body.data;
  return request(app).put(`/api/v1/admin/products/${productId}`).set(adminAuth()).send({
    categoryId: p.category_id, supplierId, taxRateId: p.tax_rate_id,
    priceChf: Number(p.price_chf), comparePriceChf: null, sku: p.sku,
    stock, stockMin, weightKg: 0.01, isFeatured: false, isMadeToOrder: false,
    soldByLength, lengthStepCm: soldByLength ? 10 : null, lengthMinCm: soldByLength ? 50 : null, isActive: true,
    translations: { fr: { name: p.name, description: p.description_fr ?? '' } },
  });
};

const restockLine = async (productId) => {
  const res = await request(app).get(`/api/v1/admin/restock/${supplierId}`).set(adminAuth());
  expect(res.status).toBe(200);
  return res.body.data.items.find((i) => i.productId === productId);
};

beforeAll(async () => {
  adminToken = await createAdminToken();
  const [sup] = await pool.query('INSERT INTO suppliers (name, is_active) VALUES (?, 1)', [`DMC test ADM-09 ${stamp}`]);
  supplierId = sup.insertId;
}, 30000);

afterAll(async () => {
  if (created.length) {
    await pool.query('DELETE FROM cart_items WHERE product_id IN (?)', [created]);
    await pool.query('UPDATE products SET is_active = 0, deleted_at = NOW(), supplier_id = NULL WHERE id IN (?)', [created]);
  }
  await pool.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
});

describe('Réassort selon le stock minimum (ADM-09)', () => {
  test('exemple de Julie : mini 10, stock 10, commande 5 → réassort 5', async () => {
    const productId = await createProduct({ name: 'Fil DMC rouge', stock: 0 });
    const save = await saveMinFromAdmin(productId, { stock: 10, stockMin: 10 });
    expect(save.status).toBe(200);
    expect(save.body.data.stock_min).toBe(10);

    // Stock égal au minimum : rien à commander
    expect(await restockLine(productId)).toBeUndefined();

    const { token } = await registerVerifiedUser('adm09.min');
    await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ productId, quantity: 5 });
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
      .send({ address, payment_method: 'invoice_qr', items: [] });
    expect(order.status).toBe(201);

    expect(await restockLine(productId)).toMatchObject({ stock: 5, stockMin: 10, belowMin: true, toOrder: 5 });

    const summary = await request(app).get('/api/v1/admin/restock').set(adminAuth());
    expect(summary.body.data.find((s) => s.supplierId === supplierId)?.belowMinItems).toBe(1);

    const csv = await request(app).get(`/api/v1/admin/restock/${supplierId}/export`).set(adminAuth());
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Stock minimum');
    const row = csv.text.split('\n').find((l) => l.includes('Fil DMC rouge'));
    expect(row).toMatch(/5.*10.*5.*Sous le stock minimum/);
  });

  test('un article sans stock minimum n\'est pas suivi, même à 0', async () => {
    const productId = await createProduct({ name: 'Sans minimum', stock: 0 });
    expect(await restockLine(productId)).toBeUndefined();
  });

  test('effacer le minimum dans la fiche retire l\'article du réassort', async () => {
    const productId = await createProduct({ name: 'Minimum effacé', stock: 2 });
    await saveMinFromAdmin(productId, { stock: 2, stockMin: 6 });
    expect(await restockLine(productId)).toMatchObject({ toOrder: 4 });

    const cleared = await saveMinFromAdmin(productId, { stock: 2, stockMin: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.stock_min).toBeNull();
    expect(await restockLine(productId)).toBeUndefined();
  });

  test('article vendu au mètre : minimum et quantité à commander en mètres', async () => {
    const productId = await createProduct({ name: 'Bande au mètre', stock: 0, soldByLength: 1 });
    // 1.20 m en stock, minimum 5 m — la fiche envoie des centimètres
    await saveMinFromAdmin(productId, { stock: 120, stockMin: 500, soldByLength: true });
    expect(await restockLine(productId)).toMatchObject({ stock: 120, stockMin: 500, toOrder: 380, soldByLength: true });

    const csv = await request(app).get(`/api/v1/admin/restock/${supplierId}/export`).set(adminAuth());
    const row = csv.text.split('\n').find((l) => l.includes('Bande au mètre'));
    expect(row).toMatch(/1\.20 m.*5\.00 m.*3\.80 m/);
  });
});
