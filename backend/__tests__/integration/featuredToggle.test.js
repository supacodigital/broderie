/* Vitrine d'accueil — ajouter ou retirer un produit ne touche qu'au drapeau
   « mis en avant ». La vitrine renvoyait auparavant toute la fiche produit, et
   chaque champ absent de son envoi était remis à zéro : un article « sur
   commande » devenait épuisé, une promotion perdait ses dates, une bande vendue
   au mètre repassait à la pièce avec son stock en centimètres. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');
const { registerVerifiedUser } = require('../helpers/auth.helper');

const stamp = Date.now();
let adminToken;
let productId;

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

const createAdminToken = async () => {
  const email = `vitrine.admin.${stamp}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Vitrine' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

const COLUMNS = `is_featured, is_made_to_order, sold_by_length, length_step_cm, length_min_cm, stock,
  price_chf, compare_price_chf, promo_starts_at, promo_ends_at, brand, length_cm, width_cm, weight_kg, badge, is_active`;
const readProduct = async () => {
  const [[row]] = await pool.query(`SELECT ${COLUMNS} FROM products WHERE id = ?`, [productId]);
  return row;
};

beforeAll(async () => {
  adminToken = await createAdminToken();
  const sku = `VITRINE-${stamp}`;
  const [r] = await pool.query(
    `INSERT INTO products (category_id, slug, price_chf, compare_price_chf, promo_starts_at, promo_ends_at,
                           tax_rate_id, sku, stock, weight_kg, length_cm, width_cm, is_active, is_made_to_order,
                           sold_by_length, length_step_cm, length_min_cm, brand, badge)
     VALUES (101, ?, 12.00, 15.00, '2026-09-01 00:00:00', '2026-12-31 23:59:00',
             1, ?, 350, 0.080, 100.00, 20.00, 1, 1, 1, 10, 50, 'Zweigart', 'promo')`,
    [sku.toLowerCase(), sku]
  );
  productId = r.insertId;
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', ?, 'Article temporaire des tests de la vitrine.', ?)`,
    [productId, `Vitrine ${sku}`, sku.toLowerCase()]
  );
}, 30000);

afterAll(async () => {
  await pool.query('UPDATE products SET is_active = 0, is_featured = 0, deleted_at = NOW() WHERE id = ?', [productId]);
});

describe('Vitrine d\'accueil — ajout et retrait sans effet sur la fiche', () => {
  test('mettre en vitrine puis retirer ne change que « mis en avant »', async () => {
    const before = await readProduct();
    expect(before.is_featured).toBe(0);

    const add = await request(app).put(`/api/v1/admin/products/${productId}/featured`)
      .set(adminAuth()).send({ isFeatured: true });
    expect(add.status).toBe(200);
    expect(add.body).toEqual({ success: true, data: { id: productId, isFeatured: true } });
    expect(await readProduct()).toEqual({ ...before, is_featured: 1 });

    const remove = await request(app).put(`/api/v1/admin/products/${productId}/featured`)
      .set(adminAuth()).send({ isFeatured: false });
    expect(remove.status).toBe(200);
    expect(await readProduct()).toEqual(before);
  });

  test('la vitrine de la boutique reflète l\'ajout aussitôt (cache vidé)', async () => {
    await request(app).get('/api/v1/products').query({ featured: 'true', limit: 50 });
    await request(app).put(`/api/v1/admin/products/${productId}/featured`).set(adminAuth()).send({ isFeatured: true });
    const res = await request(app).get('/api/v1/products').query({ featured: 'true', limit: 100 });
    expect(res.body.data.map((p) => p.id)).toContain(productId);
    await request(app).put(`/api/v1/admin/products/${productId}/featured`).set(adminAuth()).send({ isFeatured: false });
  });

  test('refuse une valeur qui n\'est pas vrai / faux (400)', async () => {
    const res = await request(app).put(`/api/v1/admin/products/${productId}/featured`)
      .set(adminAuth()).send({ isFeatured: 'oui' });
    expect(res.status).toBe(400);
  });

  test('refuse d\'autres champs glissés dans l\'envoi (400)', async () => {
    const res = await request(app).put(`/api/v1/admin/products/${productId}/featured`)
      .set(adminAuth()).send({ isFeatured: true, stock: 0 });
    expect(res.status).toBe(400);
    expect((await readProduct()).stock).toBe(350);
  });

  test('produit inconnu : 404', async () => {
    const res = await request(app).put('/api/v1/admin/products/999999999/featured')
      .set(adminAuth()).send({ isFeatured: true });
    expect(res.status).toBe(404);
  });

  test('réservé à l\'administration', async () => {
    const { token } = await registerVerifiedUser('vitrine.client');
    const client = await request(app).put(`/api/v1/admin/products/${productId}/featured`)
      .set('Authorization', `Bearer ${token}`).send({ isFeatured: true });
    expect(client.status).toBe(403);
    const anon = await request(app).put(`/api/v1/admin/products/${productId}/featured`).send({ isFeatured: true });
    expect(anon.status).toBe(401);
  });
});
