require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { computeTotp } = require('../helpers/totp.helper');

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

  // MFA obligatoire pour un compte admin — le login ne retourne plus les tokens
  // finaux directement, il faut dérouler le setup complet (voir mfa.test.js pour
  // le détail du flux, testé de façon exhaustive).
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  const mfaPendingToken = loginRes.body.data.mfaPendingToken;

  const initRes = await request(app)
    .post('/api/v1/mfa/setup/init')
    .set('Authorization', `Bearer ${mfaPendingToken}`);

  const code = computeTotp(initRes.body.data.manualEntryKey);

  const confirmRes = await request(app)
    .post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${mfaPendingToken}`)
    .send({ code });

  _adminToken = confirmRes.body.data.accessToken;
  return _adminToken;
};

const getClientToken = async () => {
  if (_clientToken) return _clientToken;

  const { pool } = require('../../config/db');
  const email    = `client.shared.${Date.now()}@broderie-test.ch`;
  const password = 'ClientJest1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Client', lastName: 'Jest' });

  // Email vérifié — requis pour POST /orders (H11)
  await pool.execute(`UPDATE users SET email_verified_at = NOW() WHERE email = ?`, [email]);

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
  let taxRateId = null;

  beforeAll(async () => {
    // Récupère un tax_rate_id réel — les ids ne sont pas garantis à 1 selon le seed
    const { pool } = require('../../config/db');
    const [[tr]] = await pool.execute('SELECT id FROM tax_rates WHERE category = ? LIMIT 1', ['standard']);
    taxRateId = tr?.id ?? 1;
  });

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

  /* « À compléter » (25.09) : chaque compteur égale le nombre de produits
     renvoyés par le filtre correspondant — la pastille ne ment pas. */
  test('GET /admin/products/quality : compteurs égaux aux listes filtrées', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/products/quality')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const { noPhoto, noWeight, noSupplier } = res.body.data;
    for (const [param, count] of [['no_photo', noPhoto], ['no_weight', noWeight], ['no_supplier', noSupplier]]) {
      expect(Number.isInteger(count)).toBe(true);
      const list = await request(app)
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ [param]: 'true', limit: 100 });
      expect(list.body.pagination.total).toBe(count);
    }
  });

  test('filtre « sans fournisseur » : uniquement des produits sans fournisseur', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ no_supplier: 'true', limit: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data.every((p) => p.supplier_id === null)).toBe(true);
  });

  test('GET /admin/products/quality sans authentification : 401', async () => {
    const res = await request(app).get('/api/v1/admin/products/quality');
    expect(res.status).toBe(401);
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
        taxRateId,
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
        taxRateId,
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

/* CLI-06 — la boutique modifie la fiche d'une cliente depuis l'admin : prénom,
   nom et adresse e-mail (que la cliente ne peut pas changer elle-même). */
describe('CLI-06 — PUT /admin/customers/:id', () => {
  const { pool } = require('../../config/db');
  const { registerVerifiedUser } = require('../helpers/auth.helper');
  const uniqueEmail = (prefix) => `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;

  const putCustomer = async (id, body) => request(app)
    .put(`/api/v1/admin/customers/${id}`)
    .set('Authorization', `Bearer ${await getAdminToken()}`)
    .send(body);

  test('modifie prénom, nom et e-mail : la cliente se connecte avec la nouvelle adresse', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    const newEmail = uniqueEmail('cli06.nouvelle');

    const res = await putCustomer(client.userId, { first_name: ' Claire ', last_name: 'Dupont', email: ` ${newEmail} ` });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: client.userId, first_name: 'Claire', last_name: 'Dupont', email: newEmail });

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: client.email, password: client.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email: newEmail, password: client.password });
    expect(newLogin.status).toBe(200);
    // L'adresse reste confirmée : la cliente peut commander sans nouvelle vérification
    expect(newLogin.body.data.user.emailVerified).toBe(true);
  });

  test('refuse une adresse déjà utilisée par un autre compte (409), quelle que soit la casse', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    const other  = await registerVerifiedUser('cli06.autre');

    const res = await putCustomer(client.userId, { first_name: 'Jest', last_name: 'Verified', email: other.email.toUpperCase() });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'Cette adresse e-mail est déjà utilisée par un autre compte.' });
  });

  test('accepte l\'adresse actuelle inchangée (seul le nom est modifié)', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    const res = await putCustomer(client.userId, { first_name: 'Jeanne', last_name: 'Verified', email: client.email });
    expect(res.status).toBe(200);
    expect(res.body.data.first_name).toBe('Jeanne');
  });

  test('refuse une adresse invalide, avec l\'erreur rattachée au champ', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    const res = await putCustomer(client.userId, { first_name: 'Jest', last_name: 'Verified', email: 'pas-une-adresse' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'email', message: 'Adresse e-mail invalide.' }]);
  });

  test('un compte du back-office ne se modifie pas par cette route (404)', async () => {
    await getAdminToken();
    const [[admin]] = await pool.execute(`SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1`);
    const res = await putCustomer(admin.id, { first_name: 'X', last_name: 'Y', email: uniqueEmail('cli06.admin-cible') });
    expect(res.status).toBe(404);
  });

  test('l\'inscription newsletter suit l\'adresse, un lien de réinitialisation déjà envoyé ne vaut plus', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    await pool.execute(
      `INSERT INTO newsletter_subscribers (email, locale, source, is_active, confirmed_at) VALUES (?, 'fr', 'account', 1, NOW())`,
      [client.email]
    );
    await pool.execute(
      `UPDATE users SET reset_token_hash = 'ancien-lien', reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?`,
      [client.userId]
    );
    const newEmail = uniqueEmail('cli06.newsletter');

    const res = await putCustomer(client.userId, { first_name: 'Jest', last_name: 'Verified', email: newEmail });
    expect(res.status).toBe(200);

    const [subs] = await pool.execute(
      `SELECT email, is_active FROM newsletter_subscribers WHERE email IN (?, ?)`,
      [client.email, newEmail]
    );
    expect(subs).toEqual([{ email: newEmail, is_active: 1 }]);

    const [[user]] = await pool.execute(`SELECT reset_token_hash FROM users WHERE id = ?`, [client.userId]);
    expect(user.reset_token_hash).toBeNull();
  });

  test('la fiche indique l\'adresse vérifiée et l\'inscription newsletter', async () => {
    const client = await registerVerifiedUser('cli06.fiche');
    const res = await request(app)
      .get(`/api/v1/admin/customers/${client.userId}`)
      .set('Authorization', `Bearer ${await getAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email_verified_at).toBeTruthy();
    expect(res.body.data.newsletter_status).toBe('none');
    expect(res.body.data.addresses).toEqual([]);
  });

  test('un client ne peut pas appeler cette route (403)', async () => {
    const client = await registerVerifiedUser('cli06.admin');
    const res = await request(app)
      .put(`/api/v1/admin/customers/${client.userId}`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ first_name: 'Jest', last_name: 'Verified', email: uniqueEmail('cli06.intrus') });
    expect(res.status).toBe(403);
  });
});

/* CLI-06 — la boutique gère aussi les adresses de la cliente depuis sa fiche */
describe('CLI-06 — adresses de la cliente depuis l\'admin', () => {
  const { registerVerifiedUser } = require('../helpers/auth.helper');

  const address = {
    label: 'Maison', address_type: 'both',
    street: 'Rue du Bourg', street_number: '12',
    zip: '1510', city: 'Moudon', canton: 'VD', phone: '079 123 45 67',
  };

  const call = async (method, path, body) => {
    const req = request(app)[method](`/api/v1/admin/customers${path}`)
      .set('Authorization', `Bearer ${await getAdminToken()}`);
    return body ? req.send(body) : req;
  };

  test('ajout, modification, adresse par défaut et suppression', async () => {
    const client = await registerVerifiedUser('cli06.adresses');

    // Première adresse : par défaut d'office
    let res = await call('post', `/${client.userId}/addresses`, address);
    expect(res.status).toBe(201);
    expect(res.body.data.addresses).toHaveLength(1);
    const home = res.body.data.addresses[0];
    expect(home).toMatchObject({ label: 'Maison', street: 'Rue du Bourg', phone: '079 123 45 67', is_default: 1 });

    // Seconde adresse désignée par défaut : la première perd ce statut
    res = await call('post', `/${client.userId}/addresses`, {
      ...address, label: 'Travail', address_type: 'shipping', street: 'Place de la Gare', street_number: '1',
      zip: '1003', city: 'Lausanne', is_default: true,
    });
    expect(res.status).toBe(201);
    const work = res.body.data.addresses.find((a) => a.label === 'Travail');
    expect(work.is_default).toBe(1);
    expect(res.body.data.addresses.find((a) => a.id === home.id).is_default).toBe(0);

    // Modification sans is_default : le statut ne bouge pas
    res = await call('put', `/${client.userId}/addresses/${work.id}`, {
      ...address, label: 'Bureau', street: 'Avenue de la Gare', street_number: '3', zip: '1003', city: 'Lausanne',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.addresses.find((a) => a.id === work.id)).toMatchObject({
      label: 'Bureau', street: 'Avenue de la Gare', is_default: 1,
    });

    // Suppression de l'adresse par défaut : l'autre prend le relais
    res = await call('delete', `/${client.userId}/addresses/${work.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Adresse supprimée.' });
    res = await call('get', `/${client.userId}`);
    expect(res.body.data.addresses).toEqual([expect.objectContaining({ id: home.id, is_default: 1 })]);
  });

  test('refuse une adresse incomplète, avec l\'erreur rattachée au champ', async () => {
    const client = await registerVerifiedUser('cli06.adresses');
    const res = await call('post', `/${client.userId}/addresses`, { ...address, zip: '15', canton: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      { field: 'zip', message: 'NPA suisse invalide (4 chiffres, de 1000 à 9999).' },
      { field: 'canton', message: 'Canton obligatoire.' },
    ]));
  });

  test('l\'adresse d\'une autre cliente ne peut être ni modifiée ni supprimée (404)', async () => {
    const owner = await registerVerifiedUser('cli06.proprio');
    const other = await registerVerifiedUser('cli06.autre');
    const created = await call('post', `/${owner.userId}/addresses`, address);
    const addressId = created.body.data.addresses[0].id;

    expect((await call('put', `/${other.userId}/addresses/${addressId}`, address)).status).toBe(404);
    expect((await call('delete', `/${other.userId}/addresses/${addressId}`)).status).toBe(404);

    const res = await call('get', `/${owner.userId}`);
    expect(res.body.data.addresses).toHaveLength(1);
  });
});
