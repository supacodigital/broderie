/* ADM-12 — « Produits vendus au mètre (trames et bandes) : impossibilité de
   saisir des décimales dans le champ stock » ; attendu : « stock en mètres
   (format 999 999.99), vente par tranches de 10 cm (minimum 50 cm) ».

   Le stock d'un article à la coupe se tient en CENTIMÈTRES (2.15 m = 215).
   Parcours réel sur la base de test : saisie admin, panier, commande,
   annulation, abandon de paiement, seuils « stock bas », réassort et valeur du
   stock fournisseur. Avant la correction, 60 cm vendus retiraient 6 m et une
   bande de moins de 5 m ne pouvait pas se commander. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');
const { registerVerifiedUser } = require('../helpers/auth.helper');

const address = {
  first_name: 'Test', last_name: 'Adm12', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};
const stamp = Date.now();
const SKU = `ADM12-${stamp}`;

let adminToken;
let productId;
let supplierId;

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const createAdminToken = async () => {
  const email = `adm12.admin.${stamp}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Adm12' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

const readStock = async () => {
  const [[row]] = await pool.query('SELECT stock FROM products WHERE id = ?', [productId]);
  return row.stock;
};
const setStock = (stock) => pool.query('UPDATE products SET stock = ? WHERE id = ?', [stock, productId]);

// Enregistrement depuis la fiche produit de l'admin : la fiche envoie des centimètres
const saveFromAdmin = async (stock) => {
  const { body } = await request(app).get(`/api/v1/admin/products/${productId}`).set(adminAuth());
  const p = body.data;
  return request(app).put(`/api/v1/admin/products/${productId}`).set(adminAuth()).send({
    categoryId: p.category_id, supplierId, taxRateId: p.tax_rate_id,
    priceChf: Number(p.price_chf), comparePriceChf: null, sku: p.sku,
    stock, weightKg: 0.05, isFeatured: false, isMadeToOrder: false,
    soldByLength: true, lengthStepCm: 10, lengthMinCm: 50, isActive: true,
    translations: { fr: { name: p.name, description: p.description_fr ?? '' } },
  });
};

// Panier vidé puis rempli de `quantity` tronçons de 10 cm
const fillCart = async (token, quantity) => {
  const cart = await request(app).get('/api/v1/cart').set(bearer(token));
  for (const item of cart.body.data?.items ?? []) {
    await request(app).delete(`/api/v1/cart/items/${item.id}`).set(bearer(token));
  }
  return request(app).post('/api/v1/cart/items').set(bearer(token)).send({ productId, quantity });
};

const placeOrder = (token, method = 'invoice_qr') => request(app).post('/api/v1/orders')
  .set(bearer(token)).send({ address, payment_method: method, items: [] });

beforeAll(async () => {
  adminToken = await createAdminToken();
  const [sup] = await pool.query(
    'INSERT INTO suppliers (name, is_active) VALUES (?, 1)', [`Fournisseur ADM-12 ${stamp}`]
  );
  supplierId = sup.insertId;
  const [r] = await pool.query(
    `INSERT INTO products (category_id, supplier_id, slug, price_chf, tax_rate_id, sku, stock, weight_kg, is_active,
                           sold_by_length, length_step_cm, length_min_cm)
     VALUES (101, ?, ?, 16.50, 1, ?, 0, 0.050, 1, 1, 10, 50)`,
    [supplierId, SKU.toLowerCase(), SKU]
  );
  productId = r.insertId;
  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', ?, 'Bande temporaire des tests ADM-12.', ?)`,
    [productId, `Bande test ${SKU}`, SKU.toLowerCase()]
  );
}, 30000);

afterAll(async () => {
  await pool.query('DELETE FROM cart_items WHERE product_id = ?', [productId]);
  // Référencé par des commandes de test : désactivé plutôt que supprimé
  await pool.query('UPDATE products SET is_active = 0, deleted_at = NOW(), supplier_id = NULL WHERE id = ?', [productId]);
  await pool.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
});

describe('Stock au centimètre des articles vendus au mètre (ADM-12)', () => {
  test('la fiche admin enregistre 2.15 m au centimètre près', async () => {
    const res = await saveFromAdmin(215);
    expect(res.status).toBe(200);
    const get = await request(app).get(`/api/v1/admin/products/${productId}`).set(adminAuth());
    expect(get.body.data.stock).toBe(215);
    expect(get.body.data.sold_by_length).toBeTruthy();
  });

  test('60 cm commandés retirent 60 cm du stock, et l\'annulation les rend', async () => {
    await setStock(215);
    const { token } = await registerVerifiedUser('adm12.commande');
    expect((await fillCart(token, 6)).status).toBe(200);

    const order = await placeOrder(token);
    expect(order.status).toBe(201);
    expect(await readStock()).toBe(155);
    const [[line]] = await pool.query(
      'SELECT quantity, stock_units FROM order_items WHERE order_id = ? AND product_id = ?', [order.body.data.id, productId]
    );
    expect(line).toEqual({ quantity: 6, stock_units: 60 });

    const cancel = await request(app).put(`/api/v1/admin/orders/${order.body.data.id}/status`)
      .set(adminAuth()).send({ status: 'cancelled', note: 'Test ADM-12' });
    expect(cancel.status).toBe(200);
    expect(await readStock()).toBe(215);
  });

  /* La facture, les e-mails et les détails de commande affichent « 60 cm » à
     partir de la coupe FIGÉE dans la commande : si la fiche repasse ensuite à
     la pièce, la commande passée ne doit pas se relire « 6 pièces ». */
  test('la coupe est figée dans la commande, même si la fiche change ensuite', async () => {
    await setStock(215);
    const { token } = await registerVerifiedUser('adm12.fige');
    expect((await fillCart(token, 6)).status).toBe(200);
    const order = await placeOrder(token);
    expect(order.status).toBe(201);

    await pool.query('UPDATE products SET sold_by_length = 0 WHERE id = ?', [productId]);
    try {
      const client = await request(app).get(`/api/v1/orders/${order.body.data.id}`).set(bearer(token));
      const line = client.body.data.items.find((i) => i.product_id === productId);
      expect(line).toMatchObject({ quantity: 6, sold_by_length: 1, length_step_cm: 10 });
      expect(line.product_snapshot_json).toMatchObject({ sold_by_length: true, length_step_cm: 10 });

      const admin = await request(app).get(`/api/v1/admin/orders/${order.body.data.id}`).set(adminAuth());
      expect(admin.body.data.items.find((i) => i.product_id === productId)).toMatchObject({ sold_by_length: 1, length_step_cm: 10 });
    } finally {
      await pool.query('UPDATE products SET sold_by_length = 1 WHERE id = ?', [productId]);
    }
  });

  test('une bande de moins de 5 m se commande (le minimum de 50 cm suffit)', async () => {
    await setStock(120); // 1.20 m
    const { token } = await registerVerifiedUser('adm12.court');
    expect((await fillCart(token, 5)).status).toBe(200);
    const order = await placeOrder(token);
    expect(order.status).toBe(201);
    expect(await readStock()).toBe(70);
  });

  test('le panier refuse plus que la longueur en stock, en centimètres', async () => {
    await setStock(215);
    const { token } = await registerVerifiedUser('adm12.trop');
    const res = await fillCart(token, 22); // 2.20 m demandés pour 2.15 m
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stock insuffisant. Disponible : 210 cm');
  });

  test('stock vendu entre le panier et la commande : refus clair (409), rien n\'est retiré', async () => {
    await setStock(215);
    const { token } = await registerVerifiedUser('adm12.course');
    expect((await fillCart(token, 6)).status).toBe(200);
    await setStock(50);
    const order = await placeOrder(token);
    expect(order.status).toBe(409);
    expect(order.body.message).toBe(`Stock insuffisant pour « Bande test ${SKU} ». Merci d'ajuster votre panier.`);
    expect(await readStock()).toBe(50);
  });

  test('paiement carte abandonné : le stock revient exactement', async () => {
    await setStock(215);
    const { token } = await registerVerifiedUser('adm12.carte');
    expect((await fillCart(token, 7)).status).toBe(200);
    const order = await placeOrder(token, 'card');
    expect(order.status).toBe(201);
    expect(await readStock()).toBe(145);
    const abandon = await request(app).post(`/api/v1/orders/${order.body.data.id}/abandon-payment`).set(bearer(token));
    expect(abandon.status).toBe(200);
    expect(await readStock()).toBe(215);
  });

  test('stock bas : 3 m le sont, 6 m ne le sont pas (seuil de 5 m)', async () => {
    const lowStockIds = async () => {
      const res = await request(app).get('/api/v1/admin/products')
        .query({ low_stock: 'true', q: SKU }).set(adminAuth());
      expect(res.status).toBe(200);
      return res.body.data.map((p) => p.id);
    };
    await setStock(300);
    expect(await lowStockIds()).toContain(productId);
    await setStock(600);
    expect(await lowStockIds()).not.toContain(productId);
  });

  test('réassort : stock affiché en mètres à l\'écran et dans le CSV', async () => {
    await setStock(300);
    // Suivi au réassort par le stock minimum (ADM-09) : 5 m
    await pool.query('UPDATE products SET stock_min = 500 WHERE id = ?', [productId]);
    const res = await request(app).get(`/api/v1/admin/restock/${supplierId}`).set(adminAuth());
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i) => i.productId === productId);
    expect(item).toMatchObject({ stock: 300, soldByLength: true, lengthStepCm: 10, belowMin: true, toOrder: 200 });

    const csv = await request(app).get(`/api/v1/admin/restock/${supplierId}/export`).set(adminAuth());
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('3.00 m');
    await pool.query('UPDATE products SET stock_min = NULL WHERE id = ?', [productId]);
  });

  test('valeur du stock fournisseur : prix au mètre × longueur', async () => {
    await setStock(215); // 2.15 m à CHF 16.50/m = CHF 35.475
    const res = await request(app).get(`/api/v1/admin/suppliers/${supplierId}/details`).set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.stockValue).toBeCloseTo(35.475, 3);
  });
});
