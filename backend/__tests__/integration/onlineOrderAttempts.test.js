require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const { computeTotp } = require('../helpers/totp.helper');
const orderRepository = require('../../repositories/order.repository');
const orderService = require('../../services/order.service');

/* Non-régression CLI-07 — « le paiement par carte est refusé mais la commande
   est quand même créée/présente dans le back-office ». Solution attendue :
   « empêcher la validation de la commande en back-office ».

   Une commande carte / Twint est créée avant le paiement (réservation du
   stock). Tant qu'elle n'est pas payée, ce n'est qu'une tentative : absente de
   la liste des commandes de la boutique et de « Mes commandes », sans numéro de
   facture. Elle ne devient une commande qu'au paiement accepté. */

const validAddress = {
  first_name: 'Test', last_name: 'Tentative',
  street: 'Chemin du Collège', street_number: '6',
  zip: '1509', city: 'Vucherens', canton: 'VD',
};

const createAdminToken = async () => {
  const email = `cli07.admin.${Date.now()}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Cli07' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

const pickProduct = async () => {
  const res = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
  return res.body.data?.[0] ?? null;
};

const placeOrder = async (token, productId, method) => {
  await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 });
  const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
    .send({ address: validAddress, payment_method: method, items: [] });
  expect(res.status).toBe(201);
  return res.body.data.id;
};

const adminListIds = async (adminToken, query = {}) => {
  const res = await request(app).get('/api/v1/admin/orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .query({ limit: 100, ...query });
  expect(res.status).toBe(200);
  return res.body.data.map((o) => o.id);
};

const clientListIds = async (token) => {
  const res = await request(app).get('/api/v1/orders').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data.map((o) => o.id);
};

const readOrder = async (id) => {
  const [[row]] = await pool.execute(
    'SELECT status, confirmed_at, invoice_number, invoice_seq FROM orders WHERE id = ?', [id]
  );
  return row;
};

describe('CLI-07 — une tentative de paiement carte / Twint n\'est pas une commande', () => {
  let adminToken;
  let product;

  beforeAll(async () => {
    adminToken = await createAdminToken();
    product = await pickProduct();
  }, 30000);

  test('carte refusée : absente des commandes de la boutique et de la cliente, visible dans « Paiements non aboutis »', async () => {
    const { token } = await registerVerifiedUser('cli07.refus');
    const orderId = await placeOrder(token, product.id, 'card');
    // La banque refuse la carte (ce que fait le webhook Stripe)
    await orderRepository.markPaymentFailed(orderId, 'Paiement par carte refusé : fonds insuffisants');

    expect(await adminListIds(adminToken)).not.toContain(orderId);
    expect(await clientListIds(token)).not.toContain(orderId);
    expect(await adminListIds(adminToken, { attempts: '1' })).toContain(orderId);

    // Pas de numéro de facture pour une simple tentative
    const row = await readOrder(orderId);
    expect(row.status).toBe('payment_failed');
    expect(row.confirmed_at).toBeNull();
    expect(row.invoice_number).toBeNull();
  });

  test('tableau de bord : une tentative n\'apparaît pas dans les dernières commandes', async () => {
    const { token } = await registerVerifiedUser('cli07.dashboard');
    const orderId = await placeOrder(token, product.id, 'twint');

    const res = await request(app).get('/api/v1/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.recent_orders.map((o) => o.id)).not.toContain(orderId);
  });

  test('paiement accepté : la commande apparaît partout et reçoit son numéro de facture', async () => {
    const { token } = await registerVerifiedUser('cli07.paye');
    const orderId = await placeOrder(token, product.id, 'twint');

    // Ce que fait payment.service à l'acceptation du paiement
    await orderRepository.markPaidFromWebhook(orderId, 'pi_test_cli07', 'twint');
    await orderService.numberInvoice(orderId);

    const row = await readOrder(orderId);
    expect(row.status).toBe('paid');
    expect(row.confirmed_at).not.toBeNull();
    expect(row.invoice_number).toMatch(/^\d{4}-\d{6}$/);
    expect(await adminListIds(adminToken)).toContain(orderId);
    expect(await clientListIds(token)).toContain(orderId);
    expect(await adminListIds(adminToken, { attempts: '1' })).not.toContain(orderId);
  });

  test('facture : commande réelle dès sa création, numérotée tout de suite', async () => {
    const { token } = await registerVerifiedUser('cli07.facture');
    const orderId = await placeOrder(token, product.id, 'invoice_qr');

    const row = await readOrder(orderId);
    expect(row.confirmed_at).not.toBeNull();
    expect(row.invoice_number).toMatch(/^\d{4}-\d{6}$/);
    expect(await adminListIds(adminToken)).toContain(orderId);
  });

  /* Chaque carte abandonnée consommait un numéro de facture : la numérotation
     comptable avait des trous. */
  test('une tentative abandonnée ne laisse pas de trou dans la numérotation des factures', async () => {
    const { token } = await registerVerifiedUser('cli07.trou');
    const first = await placeOrder(token, product.id, 'invoice_qr');
    await placeOrder(token, product.id, 'card'); // abandonnée
    const second = await placeOrder(token, product.id, 'invoice_qr');

    const a = await readOrder(first);
    const b = await readOrder(second);
    expect(b.invoice_seq).toBe(a.invoice_seq + 1);
  });

  test('tentative réglée autrement et avancée à la main par la boutique : devient une commande numérotée', async () => {
    const { token } = await registerVerifiedUser('cli07.manuel');
    const orderId = await placeOrder(token, product.id, 'card');

    const res = await request(app).put(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'paid', note: 'Réglée au comptoir' });
    expect(res.status).toBe(200);

    const row = await readOrder(orderId);
    expect(row.confirmed_at).not.toBeNull();
    expect(row.invoice_number).toMatch(/^\d{4}-\d{6}$/);
    expect(await adminListIds(adminToken)).toContain(orderId);
  });
});
