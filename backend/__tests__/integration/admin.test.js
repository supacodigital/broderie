require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// ── Helpers partagés ──────────────────────────────────────────────────────────

// Un seul compte admin créé une seule fois pour toute la suite
let _adminToken  = null;
let _clientToken = null;

const getAdminToken = async () => {
  if (_adminToken) return _adminToken;

  const { pool } = require('../../config/db');
  const email    = `admin.shared.${Date.now()}@broderie-test.ch`;
  const password = 'AdminJest1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Admin', lastName: 'Jest' });

  await pool.execute(`UPDATE users SET role = 'admin' WHERE email = ?`, [email]);

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  _adminToken = loginRes.body.data.accessToken;
  return _adminToken;
};

const getClientToken = async () => {
  if (_clientToken) return _clientToken;

  const email    = `client.shared.${Date.now()}@broderie-test.ch`;
  const password = 'ClientJest1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Client', lastName: 'Jest' });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  _clientToken = loginRes.body.data.accessToken;
  return _clientToken;
};

// ── Contrôle d'accès ─────────────────────────────────────────────────────────

describe('Admin — contrôle d\'accès', () => {
  test('routes admin sans token retournent 401', async () => {
    const res = await request(app).get('/api/v1/admin/products');
    expect(res.status).toBe(401);
  });

  test('routes admin avec token client retournent 403', async () => {
    const clientToken = await getClientToken();
    const res = await request(app)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });
});

// ── Produits admin ───────────────────────────────────────────────────────────

describe('Admin — Produits', () => {
  let createdProductId = null;

  test('GET /admin/products retourne une liste paginée', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test('POST /admin/products crée un produit', async () => {
    const adminToken = await getAdminToken();

    // Récupère un categoryId valide depuis la BDD
    const { pool } = require('../../config/db');
    const [cats] = await pool.execute('SELECT id FROM categories LIMIT 1');
    const categoryId = cats[0]?.id ?? 1;

    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug:        `test-jest-${Date.now()}`,
        priceChf:    29.90,
        taxRateId:   1,
        categoryId,
        sku:         `TST-${Date.now()}`,
        stock:       10,
        weightKg:    0.2,
        isActive:    true,
        translations: {
          fr: { name: 'Produit Test Jest', description: 'Description test' },
          de: { name: 'Testprodukt Jest',  description: 'Testbeschreibung' },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    createdProductId = res.body.data.id;
  });

  test('GET /admin/products/:id retourne le produit créé', async () => {
    if (!createdProductId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .get(`/api/v1/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdProductId);
  });

  test('PUT /admin/products/:id met à jour le prix', async () => {
    if (!createdProductId) return;
    const adminToken = await getAdminToken();

    // Récupère les données actuelles du produit avant de les modifier
    const { pool } = require('../../config/db');
    const [cats] = await pool.execute('SELECT id FROM categories LIMIT 1');
    const categoryId = cats[0]?.id ?? 1;

    const res = await request(app)
      .put(`/api/v1/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        slug:      `test-jest-updated-${createdProductId}`,
        priceChf:  34.90,
        taxRateId: 1,
        sku:       `TST-UPD-${createdProductId}`,
        stock:     8,
        weightKg:  0.2,
        isActive:  true,
        translations: {
          fr: { name: 'Produit Jest Modifié', description: 'Desc modifiée' },
          de: { name: 'Testprodukt Modifiziert', description: 'Geänderte Desc' },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /admin/products/:id supprime le produit (soft delete)', async () => {
    if (!createdProductId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .delete(`/api/v1/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Vérifie que le produit n'est plus accessible en boutique
    const check = await request(app)
      .get(`/api/v1/products/${createdProductId}`)
      .query({ locale: 'fr' });
    expect(check.status).toBe(404);
  });

  test('POST /admin/products avec données invalides retourne 400', async () => {
    const adminToken = await getAdminToken();

    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price_chf: -5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Commandes admin ──────────────────────────────────────────────────────────

describe('Admin — Commandes', () => {
  let orderId = null;

  beforeAll(async () => {
    const clientToken = await getClientToken();

    // Crée une commande depuis un compte client
    const prodRes = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', in_stock: 'true', limit: 1 });

    const produit = prodRes.body.data?.[0];
    if (produit) {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ productId: produit.id, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${clientToken}`);

      orderId = orderRes.body.data?.id ?? null;
    }
  });

  test('GET /admin/orders retourne toutes les commandes paginées', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test('GET /admin/orders filtre par statut', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'awaiting_payment' });

    expect(res.status).toBe(200);
    res.body.data.forEach(o => expect(o.status).toBe('awaiting_payment'));
  });

  test('GET /admin/orders/:id retourne le détail avec items', async () => {
    if (!orderId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('history');
  });

  test('PUT /admin/orders/:id/status met à jour le statut', async () => {
    if (!orderId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .put(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing', note: 'Commande prise en charge' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Vérifie que le dernier statut dans l'historique est bien 'processing'
    const detail = await request(app)
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detail.body.data.history.at(-1)?.status).toBe('processing');
  });

  test('statut invalide retourne 400', async () => {
    if (!orderId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .put(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'statut_inexistant' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Avis admin ───────────────────────────────────────────────────────────────

describe('Admin — Avis clients', () => {
  test('GET /admin/reviews retourne tous les avis paginés', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test('GET /admin/reviews filtre les avis non approuvés', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ approved: 'false' });

    expect(res.status).toBe(200);
    res.body.data.forEach(r => expect(r.is_approved).toBeFalsy());
  });
});

// ── Fournisseurs admin ────────────────────────────────────────────────────────

describe('Admin — Fournisseurs', () => {
  let supplierId = null;

  test('POST /admin/suppliers crée un fournisseur', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .post('/api/v1/admin/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:         `Fournisseur Jest ${Date.now()}`,
        contact_name: 'Jean Test',
        email:        `fournisseur.${Date.now()}@test.ch`,
        is_active:    true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    supplierId = res.body.data.id;
  });

  test('GET /admin/suppliers retourne la liste', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/suppliers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('PUT /admin/suppliers/:id met à jour le nom', async () => {
    if (!supplierId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .put(`/api/v1/admin/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fournisseur Jest Modifié' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /admin/suppliers/:id supprime le fournisseur', async () => {
    if (!supplierId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .delete(`/api/v1/admin/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Expédition admin (La Poste CH) ───────────────────────────────────────────

// — Accès API La Poste CH configurés ? (sinon le shipping tourne en mock, on saute ces tests)
const swissPostConfigured = !!process.env.SWISS_POST_CLIENT_ID &&
  !process.env.SWISS_POST_CLIENT_ID.includes('change_me');

describe('Admin — Expédition La Poste CH', () => {
  let orderId = null;

  beforeAll(async () => {
    const clientToken = await getClientToken();

    const prodRes = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', in_stock: 'true', limit: 1 });

    const produit = prodRes.body.data?.[0];
    if (produit) {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ productId: produit.id, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${clientToken}`);

      orderId = orderRes.body.data?.id ?? null;
    }
  });

  test('POST /admin/orders/:id/label génère une étiquette et retourne un numéro de suivi', async () => {
    if (!orderId || !swissPostConfigured) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .post(`/api/v1/admin/orders/${orderId}/label`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('trackingNumber');
    expect(res.body.data).toHaveProperty('labelUrl');
    expect(res.body.data).toHaveProperty('labelId');
    expect(typeof res.body.data.trackingNumber).toBe('string');
  });

  test('GET /admin/orders/:id/label retourne un PDF (Content-Type application/pdf)', async () => {
    if (!orderId || !swissPostConfigured) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .get(`/api/v1/admin/orders/${orderId}/label`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('GET /admin/orders/:id/label sur commande inconnue retourne 404', async () => {
    const adminToken = await getAdminToken();

    const res = await request(app)
      .get('/api/v1/admin/orders/999999/label')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('PUT /admin/orders/:id/tracking enregistre un numéro de suivi manuel', async () => {
    if (!orderId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .put(`/api/v1/admin/orders/${orderId}/tracking`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tracking_number: '98.44.123456.01234567' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('tracking_number', '98.44.123456.01234567');
  });

  test('PUT /admin/orders/:id/tracking sans numéro retourne 400', async () => {
    if (!orderId) return;
    const adminToken = await getAdminToken();

    const res = await request(app)
      .put(`/api/v1/admin/orders/${orderId}/tracking`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('routes expédition sans token retournent 401', async () => {
    const [genLabel, downloadLabel, updateTracking] = await Promise.all([
      request(app).post('/api/v1/admin/orders/1/label'),
      request(app).get('/api/v1/admin/orders/1/label'),
      request(app).put('/api/v1/admin/orders/1/tracking').send({ trackingNumber: 'test' }),
    ]);

    expect(genLabel.status).toBe(401);
    expect(downloadLabel.status).toBe(401);
    expect(updateTracking.status).toBe(401);
  });
});

// ── Clients admin ─────────────────────────────────────────────────────────────

describe('Admin — Clients', () => {
  test('GET /admin/customers retourne la liste paginée', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test('GET /admin/customers/:id retourne un client', async () => {
    const adminToken = await getAdminToken();
    const list = await request(app)
      .get('/api/v1/admin/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 1 });

    if (!list.body.data.length) return;

    const id  = list.body.data[0].id;
    const res = await request(app)
      .get(`/api/v1/admin/customers/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('email');
  });
});
