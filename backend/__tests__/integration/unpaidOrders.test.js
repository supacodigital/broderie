require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const unpaidOrderService = require('../../services/unpaidOrder.service');
const orderRepository = require('../../repositories/order.repository');
const dashboardRepository = require('../../repositories/dashboard.repository');

/* Non-régression CLI-07 — « une commande validée par carte refusée est tout de
   même générée en back-office ».

   Une commande carte / Twint est créée avant le paiement. Elle doit :
   - naître au statut « Paiement attendu » (et non « En attente », compté dans
     « À traiter » côté admin) ;
   - être annulée, stock rendu et articles remis au panier, quand la cliente
     quitte l'étape de paiement ;
   - être annulée quand la cliente repasse une commande ;
   - être annulée automatiquement au bout de 2 heures sans paiement. */

const validAddress = {
  first_name: 'Test', last_name: 'Impaye',
  street: 'Chemin du Collège', street_number: '6',
  zip: '1509', city: 'Vucherens', canton: 'VD',
};

const pickProduct = async () => {
  const res = await request(app)
    .get('/api/v1/products')
    .query({ locale: 'fr', in_stock: 'true', limit: 1 });
  return res.body.data?.[0] ?? null;
};

const readStock = async (productId) => {
  const [[row]] = await pool.execute('SELECT stock FROM products WHERE id = ?', [productId]);
  return row.stock;
};

const readStatus = async (orderId) => {
  const [[row]] = await pool.execute('SELECT status FROM orders WHERE id = ?', [orderId]);
  return row.status;
};

// Vide le panier : une commande annulée y remet ses articles (comportement testé)
const emptyCart = async (token) => {
  const cart = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);
  for (const item of cart.body.data?.items ?? []) {
    await request(app).delete(`/api/v1/cart/items/${item.id}`).set('Authorization', `Bearer ${token}`);
  }
};

const placeOrder = async (token, productId, method) => {
  await emptyCart(token);
  await request(app)
    .post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 });
  const res = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ address: validAddress, payment_method: method, items: [] });
  return res.body.data;
};

describe('CLI-07 — commandes carte / Twint impayées', () => {
  let token;
  let product;

  beforeAll(async () => {
    ({ token } = await registerVerifiedUser('unpaid.jest'));
    product = await pickProduct();
  });

  // CLI-08 — le téléphone saisi au checkout était jeté faute de colonne
  test('le téléphone saisi au checkout est enregistré sur la commande', async () => {
    if (!product) return;
    await emptyCart(token);
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: { ...validAddress, phone: ' 079 123 45 67 ' }, payment_method: 'invoice_qr', items: [] });

    expect(res.status).toBe(201);
    expect(res.body.data.shipping_phone).toBe('079 123 45 67');
  });

  test('une commande carte naît au statut « Paiement attendu »', async () => {
    if (!product) return;
    const order = await placeOrder(token, product.id, 'card');
    expect(order.status).toBe('awaiting_payment');

    // Nettoyage : ne pas laisser de commande impayée pour les tests suivants
    await request(app)
      .post(`/api/v1/orders/${order.id}/abandon-payment`)
      .set('Authorization', `Bearer ${token}`);
  });

  test('quitter le paiement annule la commande, rend le stock et remplit le panier', async () => {
    if (!product) return;
    const stockBefore = await readStock(product.id);
    const order = await placeOrder(token, product.id, 'card');
    expect(await readStock(product.id)).toBe(stockBefore - 1);

    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/abandon-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await readStatus(order.id)).toBe('cancelled');
    expect(await readStock(product.id)).toBe(stockBefore);

    const cart = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`);
    const productIds = (cart.body.data?.items ?? []).map((i) => i.product_id);
    expect(productIds).toContain(product.id);
  });

  test('une cliente ne peut pas annuler la commande d\'une autre (404)', async () => {
    if (!product) return;
    const order = await placeOrder(token, product.id, 'card');
    const { token: otherToken } = await registerVerifiedUser('unpaid.other');

    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/abandon-payment`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
    expect(await readStatus(order.id)).toBe('awaiting_payment');

    await request(app)
      .post(`/api/v1/orders/${order.id}/abandon-payment`)
      .set('Authorization', `Bearer ${token}`);
  });

  test('une commande par facture ne peut pas être annulée par ce biais (409)', async () => {
    if (!product) return;
    const order = await placeOrder(token, product.id, 'invoice_qr');

    const res = await request(app)
      .post(`/api/v1/orders/${order.id}/abandon-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(await readStatus(order.id)).toBe('pending_invoice');
  });

  test('repasser une commande libère la commande carte impayée précédente', async () => {
    if (!product) return;
    const stockBefore = await readStock(product.id);
    const first  = await placeOrder(token, product.id, 'card');
    const second = await placeOrder(token, product.id, 'invoice_qr');

    expect(await readStatus(first.id)).toBe('cancelled');
    expect(second.status).toBe('pending_invoice');
    // Le stock n'est retenu qu'une fois — par la seconde commande
    expect(await readStock(product.id)).toBe(stockBefore - 1);
  });

  test('une commande carte impayée depuis plus de 2 h est annulée automatiquement', async () => {
    if (!product) return;
    const stockBefore = await readStock(product.id);
    const card    = await placeOrder(token, product.id, 'card');
    const invoice = await placeOrder(token, product.id, 'invoice_qr');

    // Vieillissement artificiel des deux commandes
    await pool.execute(
      'UPDATE orders SET created_at = NOW() - INTERVAL 3 HOUR WHERE id IN (?, ?)',
      [card.id, invoice.id]
    );

    await unpaidOrderService.cancelExpiredUnpaidOrders();

    // La commande par facture a déjà libéré la commande carte à sa création ;
    // la tâche ne doit surtout pas toucher à la facture, payable sous 30 jours.
    expect(await readStatus(card.id)).toBe('cancelled');
    expect(await readStatus(invoice.id)).toBe('pending_invoice');
    expect(await readStock(product.id)).toBe(stockBefore - 1);
  });

  test('un refus bancaire passe la commande à « Paiement refusé », un nouvel essai réussi la passe à « Payée »', async () => {
    if (!product) return;
    const order = await placeOrder(token, product.id, 'card');

    expect(await orderRepository.markPaymentFailed(order.id, 'Paiement par carte refusé')).toBe(true);
    expect(await readStatus(order.id)).toBe('payment_failed');

    // Deuxième refus : le statut ne bouge pas, l'historique garde les deux motifs
    await orderRepository.markPaymentFailed(order.id, 'Paiement par carte refusé : fonds insuffisants');
    const [history] = await pool.execute(
      "SELECT note FROM order_status_history WHERE order_id = ? AND status = 'payment_failed'",
      [order.id]
    );
    expect(history).toHaveLength(2);

    // La cliente réessaie avec une autre carte : le paiement aboutit
    const { statusChanged } = await orderRepository.markPaidFromWebhook(order.id, 'pi_test_retry', 'card');
    expect(statusChanged).toBe(true);
    expect(await readStatus(order.id)).toBe('paid');

    // Un refus arrivé en retard (webhooks dans le désordre) ne rétrograde pas une commande payée
    expect(await orderRepository.markPaymentFailed(order.id, 'refus tardif')).toBe(false);
    expect(await readStatus(order.id)).toBe('paid');
  });

  test('une commande « Paiement refusé » est aussi annulée au bout de 2 h', async () => {
    if (!product) return;
    const { token: failToken } = await registerVerifiedUser('unpaid.failed');
    const stockBefore = await readStock(product.id);
    const order = await placeOrder(failToken, product.id, 'card');
    await orderRepository.markPaymentFailed(order.id, 'Paiement par carte refusé');
    await pool.execute(
      'UPDATE orders SET created_at = NOW() - INTERVAL 3 HOUR WHERE id = ?',
      [order.id]
    );

    await unpaidOrderService.cancelExpiredUnpaidOrders();

    expect(await readStatus(order.id)).toBe('cancelled');
    expect(await readStock(product.id)).toBe(stockBefore);
  });

  test('le tableau de bord ne compte pas un paiement carte en cours ou refusé', async () => {
    if (!product) return;
    const { token: dashToken } = await registerVerifiedUser('unpaid.dash');
    const { ordersRows: before } = await dashboardRepository.getStats({ month: 9, year: 2026 });

    const card = await placeOrder(dashToken, product.id, 'card');
    let { ordersRows: after } = await dashboardRepository.getStats({ month: 9, year: 2026 });
    expect(after.orders_week).toBe(before.orders_week);
    expect(after.orders_pending).toBe(before.orders_pending);

    await orderRepository.markPaymentFailed(card.id, 'Paiement par carte refusé');
    ({ ordersRows: after } = await dashboardRepository.getStats({ month: 9, year: 2026 }));
    expect(after.orders_week).toBe(before.orders_week);
    expect(after.orders_pending).toBe(before.orders_pending);

    // Une commande par facture, elle, compte — et elle libère la commande carte
    await placeOrder(dashToken, product.id, 'invoice_qr');
    ({ ordersRows: after } = await dashboardRepository.getStats({ month: 9, year: 2026 }));
    expect(after.orders_week).toBe(before.orders_week + 1);
    expect(after.orders_pending).toBe(before.orders_pending + 1);
  });

  test('la tâche annule une commande carte isolée de plus de 2 h et épargne une récente', async () => {
    if (!product) return;
    const { token: soloToken } = await registerVerifiedUser('unpaid.solo');
    const old = await placeOrder(soloToken, product.id, 'card');
    await pool.execute(
      'UPDATE orders SET created_at = NOW() - INTERVAL 3 HOUR WHERE id = ?',
      [old.id]
    );
    const { token: freshToken } = await registerVerifiedUser('unpaid.fresh');
    const fresh = await placeOrder(freshToken, product.id, 'card');

    await unpaidOrderService.cancelExpiredUnpaidOrders();

    expect(await readStatus(old.id)).toBe('cancelled');
    expect(await readStatus(fresh.id)).toBe('awaiting_payment');

    await request(app)
      .post(`/api/v1/orders/${fresh.id}/abandon-payment`)
      .set('Authorization', `Bearer ${freshToken}`);
  });
});
