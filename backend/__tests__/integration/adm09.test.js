/* ADM-09 — état des réassorts fournisseurs et suivi des factures payées.
   Requêtes réelles sur la base de test : c'est le SQL (historique « paid »,
   échéance, JSON figé dans les lignes de commande) qui porte la logique. */
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

let adminToken;
let product;
let productWasMadeToOrder;

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

const createAdminToken = async () => {
  const email = `adm09.admin.${Date.now()}@broderie-test.ch`;
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

// Une commande par facture QR de la cliente de test, sur l'article de test
const placeInvoiceOrder = async () => {
  const client = await registerVerifiedUser('adm09');
  await request(app).post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${client.token}`).send({ productId: product.id, quantity: 2 });
  const res = await request(app).post('/api/v1/orders')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ address, payment_method: 'invoice_qr', items: [] });
  expect(res.status).toBe(201);
  return { ...res.body.data, clientEmail: client.email };
};

beforeAll(async () => {
  adminToken = await createAdminToken();
  const list = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
  product = list.body.data[0];
  const [[row]] = await pool.query('SELECT is_made_to_order FROM products WHERE id = ?', [product.id]);
  productWasMadeToOrder = row.is_made_to_order;
});

afterAll(async () => {
  await pool.query('UPDATE products SET is_made_to_order = ? WHERE id = ?', [productWasMadeToOrder, product.id]);
});

describe('Suivi des factures QR (ADM-09)', () => {
  let order;
  beforeAll(async () => { order = await placeInvoiceOrder(); });

  // Recherche par l'e-mail de la cliente : la base de test cumule les factures des autres suites
  const findIn = async (status) => {
    const res = await request(app).get('/api/v1/admin/invoices').query({ status, q: order.clientEmail }).set(adminAuth());
    expect(res.status).toBe(200);
    return res.body.data.find((i) => i.orderId === order.id);
  };

  test('une facture qui vient d\'être émise est « à payer », avec son échéance', async () => {
    const inv = await findIn('unpaid');
    expect(inv).toBeDefined();
    expect(inv.paymentStatus).toBe('unpaid');
    expect(inv.invoiceNumber).toMatch(/^\d{4}-\d{6}$/);
    expect(new Date(inv.dueDate).getTime()).toBeGreaterThan(new Date(inv.createdAt).getTime());
    expect(await findIn('paid')).toBeUndefined();
  });

  test('échéance dépassée : « en retard », avec le nombre de jours', async () => {
    await pool.query('UPDATE orders SET created_at = DATE_SUB(NOW(), INTERVAL 45 DAY) WHERE id = ?', [order.id]);
    const inv = await findIn('overdue');
    expect(inv.paymentStatus).toBe('overdue');
    expect(inv.daysOverdue).toBeGreaterThanOrEqual(14);
    expect(await findIn('unpaid')).toBeUndefined();
  });

  test('marquée payée puis expédiée : reste « payée »', async () => {
    await request(app).put(`/api/v1/admin/orders/${order.id}/status`).set(adminAuth())
      .send({ status: 'paid', note: 'Virement reçu' });
    await request(app).put(`/api/v1/admin/orders/${order.id}/status`).set(adminAuth())
      .send({ status: 'processing' });
    const inv = await findIn('paid');
    expect(inv.paymentStatus).toBe('paid');
    expect(inv.paidAt).toBeTruthy();
    expect(await findIn('overdue')).toBeUndefined();
  });

  test('l\'export CSV porte le numéro de facture et la référence QR', async () => {
    const res = await request(app).get('/api/v1/admin/invoices/export').query({ status: 'all' }).set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const inv = await findIn('all');
    expect(res.text).toContain(inv.invoiceNumber);
    if (inv.qrReference) expect(res.text).toContain(inv.qrReference);
  });

  test('la recherche retrouve une facture par son numéro', async () => {
    const inv = await findIn('all');
    const res = await request(app).get('/api/v1/admin/invoices').query({ q: inv.invoiceNumber }).set(adminAuth());
    expect(res.body.data.map((i) => i.orderId)).toContain(order.id);
  });

  test('réservé à l\'administration', async () => {
    const res = await request(app).get('/api/v1/admin/invoices');
    expect(res.status).toBe(401);
  });
});

describe('État des réassorts fournisseurs (ADM-09)', () => {
  let order;
  beforeAll(async () => {
    // Article « sur commande » : il faut le commander au fournisseur pour livrer
    await pool.query('UPDATE products SET is_made_to_order = 1 WHERE id = ?', [product.id]);
    order = await placeInvoiceOrder();
  });

  test('un article sur commande d\'une commande en cours apparaît chez son fournisseur', async () => {
    const [[p]] = await pool.query('SELECT supplier_id FROM products WHERE id = ?', [product.id]);
    const key = p.supplier_id ?? 'sans-fournisseur';

    const summary = await request(app).get('/api/v1/admin/restock').set(adminAuth());
    expect(summary.status).toBe(200);
    expect(summary.body.data.find((s) => String(s.supplierId) === String(key))?.demandItems).toBeGreaterThanOrEqual(1);

    const detail = await request(app).get(`/api/v1/admin/restock/${key}`).set(adminAuth());
    const line = detail.body.data.items.find((i) => i.productId === product.id);
    expect(line.orderIds).toContain(order.id);
    expect(line.orderedQty).toBeGreaterThanOrEqual(2);
  });

  test('une commande annulée ne demande plus rien', async () => {
    await request(app).put(`/api/v1/admin/orders/${order.id}/status`).set(adminAuth()).send({ status: 'cancelled' });
    const [[p]] = await pool.query('SELECT supplier_id FROM products WHERE id = ?', [product.id]);
    const detail = await request(app).get(`/api/v1/admin/restock/${p.supplier_id ?? 'sans-fournisseur'}`).set(adminAuth());
    const line = detail.body.data.items.find((i) => i.productId === product.id);
    expect(line?.orderIds ?? []).not.toContain(order.id);
  });

  test('fournisseur invalide : 400', async () => {
    const res = await request(app).get('/api/v1/admin/restock/abc').set(adminAuth());
    expect(res.status).toBe(400);
  });
});
