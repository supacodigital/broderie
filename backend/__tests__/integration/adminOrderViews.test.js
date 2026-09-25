require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const { computeTotp } = require('../helpers/totp.helper');

/* Badge « Commandes » de la barre latérale (25.09) : il compte les nouvelles
   commandes que l'admin connectée n'a encore jamais ouvertes — et non plus
   des statuts (factures en attente de paiement, retraits). Suivi par compte :
   une commande ouverte par Kévin reste nouvelle pour Julie. */

const validAddress = {
  first_name: 'Test', last_name: 'Badge',
  street: 'Chemin du Collège', street_number: '6',
  zip: '1509', city: 'Vucherens', canton: 'VD',
};

const createAdminToken = async (name) => {
  const email = `badge.${name}.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: name });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return { email, token: confirm.body.data.accessToken };
};

const placeOrder = async (token, productId, method) => {
  await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 });
  const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
    .send({ address: validAddress, payment_method: method, items: [] });
  expect(res.status).toBe(201);
  return res.body.data.id;
};

// Ce que lit le badge : GET /admin/orders?unseen=1
const unseen = async (adminToken) => {
  const res = await request(app).get('/api/v1/admin/orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .query({ unseen: 1, limit: 100 });
  expect(res.status).toBe(200);
  return { ids: res.body.data.map((o) => o.id), total: res.body.pagination.total };
};

const openOrder = async (adminToken, id) => {
  const res = await request(app).get(`/api/v1/admin/orders/${id}`).set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
};

describe('Badge « Commandes » — nouvelles commandes jamais ouvertes', () => {
  let julie;
  let kevin;
  let product;

  beforeAll(async () => {
    julie = await createAdminToken('julie');
    kevin = await createAdminToken('kevin');
    const res = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
    product = res.body.data[0];
  }, 30000);

  test('nouvelle commande : comptée jusqu\'à ce que l\'admin l\'ouvre', async () => {
    const { token } = await registerVerifiedUser('badge.cliente');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');

    const before = await unseen(julie.token);
    expect(before.ids).toContain(orderId);

    await openOrder(julie.token, orderId);

    const after = await unseen(julie.token);
    expect(after.ids).not.toContain(orderId);
    expect(after.total).toBe(before.total - 1);

    // Rouvrir ne change rien (pas de doublon)
    await openOrder(julie.token, orderId);
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM admin_order_views WHERE order_id = ?', [orderId]
    );
    expect(n).toBe(1);
  });

  test('suivi par compte : ouverte par Kévin, elle reste nouvelle pour Julie', async () => {
    const { token } = await registerVerifiedUser('badge.compte');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');

    await openOrder(kevin.token, orderId);

    expect((await unseen(kevin.token)).ids).not.toContain(orderId);
    expect((await unseen(julie.token)).ids).toContain(orderId);
  });

  test('paiement carte / Twint non abouti : jamais compté, et l\'ouvrir ne le marque pas', async () => {
    const { token } = await registerVerifiedUser('badge.tentative');
    const orderId = await placeOrder(token, product.id, 'twint');

    expect((await unseen(julie.token)).ids).not.toContain(orderId);

    await openOrder(julie.token, orderId);
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM admin_order_views WHERE order_id = ?', [orderId]
    );
    expect(n).toBe(0);
  });

  test('compte admin créé après coup : l\'historique n\'est pas « nouveau »', async () => {
    const { token } = await registerVerifiedUser('badge.historique');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');

    const later = await createAdminToken('recrue');
    // Compte créé après la commande (DATETIME à la seconde : on l'avance d'une minute)
    await pool.execute('UPDATE users SET created_at = NOW() + INTERVAL 1 MINUTE WHERE email = ?', [later.email]);

    expect((await unseen(later.token)).ids).not.toContain(orderId);
  });

  test('sans le filtre, la liste des commandes est inchangée', async () => {
    const { token } = await registerVerifiedUser('badge.liste');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');
    await openOrder(julie.token, orderId);

    const res = await request(app).get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${julie.token}`).query({ limit: 100 });
    expect(res.body.data.map((o) => o.id)).toContain(orderId);
  });

  // Liste : le numéro d'une nouvelle commande s'affiche en gras (is_new)
  test('liste : is_new vrai tant que l\'admin n\'a pas ouvert la commande, par compte', async () => {
    const { token } = await registerVerifiedUser('badge.gras');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');
    const isNew = async (adminToken) => {
      const res = await request(app).get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`).query({ limit: 100 });
      return res.body.data.find((o) => o.id === orderId)?.is_new;
    };

    expect(await isNew(julie.token)).toBe(true);
    await openOrder(julie.token, orderId);
    expect(await isNew(julie.token)).toBe(false);
    expect(await isNew(kevin.token)).toBe(true);
  });
});
