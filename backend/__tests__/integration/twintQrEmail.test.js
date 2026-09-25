/* QR Twint envoyé par e-mail depuis l'admin — audit du 25.09.
   La base de test n'a pas de clé Stripe : le parcours Stripe complet (envoi,
   paiement dans la page Twint, webhook) a été rejoué en local avec la clé de
   test. Ici : l'enregistrement des paiements en base, et la route publique de
   retour de la cliente. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const orderRepository = require('../../repositories/order.repository');
const paymentRepository = require('../../repositories/payment.repository');

const stamp = Date.now();
const address = {
  first_name: 'Test', last_name: 'Twint', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};

const placeInvoiceOrder = async () => {
  const list = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
  const { token } = await registerVerifiedUser('twintqr');
  await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`)
    .send({ productId: list.body.data[0].id, quantity: 1 });
  const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
    .send({ address, payment_method: 'invoice_qr', items: [] });
  expect(res.status).toBe(201);
  return res.body.data.id;
};

const paymentsOf = async (orderId) => {
  const [rows] = await pool.query(
    'SELECT provider, provider_payment_id AS pi, method, status FROM payments WHERE order_id = ? ORDER BY id',
    [orderId]
  );
  return rows;
};

describe('QR Twint par e-mail — paiements enregistrés', () => {
  /* Deux QR envoyés pour la même facture : le premier, remplacé, est annulé
     chez Stripe ; la cliente paie le second. Toutes les lignes Twint passaient
     à « réussi » et prenaient l'identifiant du second paiement. */
  test('seul le QR payé passe à « réussi », le QR remplacé garde son statut et son identifiant', async () => {
    const orderId = await placeInvoiceOrder();
    const [[order]] = await pool.query('SELECT total FROM orders WHERE id = ?', [orderId]);
    const first = `pi_old_${stamp}`;
    const second = `pi_new_${stamp}`;
    await paymentRepository.create({ orderId, provider: 'stripe_qr_email', providerPaymentId: first, amount: order.total, method: 'twint', status: 'pending' });
    await paymentRepository.updateStatusByIntentId(first, 'cancelled');
    await paymentRepository.create({ orderId, provider: 'stripe_qr_email', providerPaymentId: second, amount: order.total, method: 'twint', status: 'pending' });

    const { statusChanged } = await orderRepository.markPaidFromWebhook(orderId, second, 'twint');

    expect(statusChanged).toBe(true);
    expect(await paymentsOf(orderId)).toEqual([
      { provider: 'internal', pi: null, method: 'invoice_qr', status: 'pending' },
      { provider: 'stripe_qr_email', pi: first, method: 'twint', status: 'cancelled' },
      { provider: 'stripe_qr_email', pi: second, method: 'twint', status: 'succeeded' },
    ]);
    const [[paid]] = await pool.query('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect(paid.status).toBe('paid');
  });

  test('le paiement est retrouvé par son identifiant Stripe', async () => {
    const orderId = await placeInvoiceOrder();
    const pi = `pi_find_${stamp}`;
    await paymentRepository.create({ orderId, provider: 'stripe_qr_email', providerPaymentId: pi, amount: 10, method: 'twint', status: 'pending' });

    expect(await paymentRepository.findByIntentId(pi)).toMatchObject({
      order_id: orderId, provider: 'stripe_qr_email', method: 'twint', status: 'pending',
    });
    expect(await paymentRepository.findByIntentId(`pi_absent_${stamp}`)).toBeNull();
  });
});

describe('QR Twint par e-mail — POST /api/v1/payments/qr-return', () => {
  test('route publique : le corps JSON est lu (monté avant le lecteur JSON global)', async () => {
    const res = await request(app).post('/api/v1/payments/qr-return')
      .send({ payment_intent: 'pi_3Abc', client_secret: 'pi_3Abc_secret_Xyz' });
    // Données valides : on atteint le service — sans clé Stripe en test, 503
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, message: 'Paiements Stripe non configurés.' });
  });

  test('lien incomplet ou altéré : 400 avec le champ en cause', async () => {
    const res = await request(app).post('/api/v1/payments/qr-return')
      .send({ payment_intent: 'pi_3Abc', client_secret: '<script>' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual([{ field: 'client_secret', message: 'Lien de paiement invalide.' }]);

    const empty = await request(app).post('/api/v1/payments/qr-return').send({});
    expect(empty.status).toBe(400);
  });
});
