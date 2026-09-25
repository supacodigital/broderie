require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const { computeTotp } = require('../helpers/totp.helper');
const { extractPdfText } = require('../helpers/pdf.helper');
const orderRepository = require('../../repositories/order.repository');
const orderService = require('../../services/order.service');

/* Retour du test de paiement Twint du 25.09 :
   - la page commande de la cliente n'offrait pas de facture à télécharger ;
   - la facture téléchargée depuis l'admin portait un bulletin QR à payer,
     alors que la cliente avait déjà payé par Twint. */

const validAddress = {
  first_name: 'Test', last_name: 'Twint',
  street: 'Chemin du Collège', street_number: '6',
  zip: '1509', city: 'Vucherens', canton: 'VD',
};

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const createAdminToken = async () => {
  const email = `paidinvoice.admin.${Date.now()}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Facture' });
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

// Même enchaînement que le webhook Stripe « payment_intent.succeeded »
const payWithTwint = async (orderId) => {
  await orderRepository.markPaidFromWebhook(orderId, `pi_test_paid_invoice_${orderId}`, 'twint');
  await orderService.numberInvoice(orderId);
};

const clientPdf = (token, orderId) => request(app)
  .get(`/api/v1/orders/${orderId}/invoice`)
  .set('Authorization', `Bearer ${token}`)
  .buffer(true).parse(binary);

describe('Facture d\'une commande payée par Twint', () => {
  let client;
  let adminToken;
  let product;
  let orderId;

  beforeAll(async () => {
    client = await registerVerifiedUser('paidinvoice.jest');
    adminToken = await createAdminToken();
    product = await pickProduct();
    if (!product) return;
    orderId = await placeOrder(client.token, product.id, 'twint');
    await payWithTwint(orderId);
  });

  test('la page commande de la cliente propose la facture', async () => {
    if (!product) return;
    const res = await request(app).get(`/api/v1/orders/${orderId}`).set('Authorization', `Bearer ${client.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'paid', paid_method: 'twint', invoice_available: true });
    expect(res.body.data.paid_at).toBeTruthy();
  });

  test('la cliente télécharge une facture acquittée, sans bulletin QR', async () => {
    if (!product) return;
    const res = await clientPdf(client.token, orderId);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const text = extractPdfText(res.body);
    expect(text).toMatch(/Payée le : \d{2}\.\d{2}\.\d{4}/);
    expect(text).toMatch(/Facture payée le \d{2}\.\d{2}\.\d{4} par Twint\. Aucun montant à régler\./);
    expect(text).not.toContain('Récépissé');
    expect(text).not.toContain('Section paiement');
    expect(text).not.toContain('Échéance');
  });

  test('la facture téléchargée depuis l\'admin est la même facture acquittée', async () => {
    if (!product) return;
    const res = await request(app)
      .get(`/api/v1/admin/orders/${orderId}/invoice`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true).parse(binary);

    expect(res.status).toBe(200);
    const text = extractPdfText(res.body);
    expect(text).toContain('par Twint');
    expect(text).not.toContain('Récépissé');
  });

  test('une facture QR pas encore payée garde son bulletin et son échéance', async () => {
    if (!product) return;
    const invoiceOrderId = await placeOrder(client.token, product.id, 'invoice_qr');

    const detail = await request(app).get(`/api/v1/orders/${invoiceOrderId}`).set('Authorization', `Bearer ${client.token}`);
    expect(detail.body.data).toMatchObject({ invoice_available: true, paid_at: null });

    const text = extractPdfText((await clientPdf(client.token, invoiceOrderId)).body);
    expect(text).toContain('Récépissé');
    expect(text).toContain('Échéance : paiement sous');
    expect(text).not.toContain('Payée le');
  });

  test('un paiement Twint pas encore accepté n\'a pas de facture', async () => {
    if (!product) return;
    const attemptId = await placeOrder(client.token, product.id, 'twint');

    const detail = await request(app).get(`/api/v1/orders/${attemptId}`).set('Authorization', `Bearer ${client.token}`);
    expect(detail.body.data.invoice_available).toBe(false);
    expect((await clientPdf(client.token, attemptId)).status).toBe(404);

    // Nettoyage : ne pas laisser de tentative impayée aux tests suivants
    await request(app).post(`/api/v1/orders/${attemptId}/abandon-payment`).set('Authorization', `Bearer ${client.token}`);
  });

  test('un retrait à payer en boutique n\'a pas de facture tant qu\'il n\'est pas payé', async () => {
    if (!product) return;
    const pickupId = await placeOrder(client.token, product.id, 'pickup');

    const detail = await request(app).get(`/api/v1/orders/${pickupId}`).set('Authorization', `Bearer ${client.token}`);
    expect(detail.body.data.invoice_available).toBe(false);
    expect((await clientPdf(client.token, pickupId)).status).toBe(404);
  });
});
