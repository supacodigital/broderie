/* ADM-18 — « Changer le numéro de facture, mettre l'année et le mois plus un
   numéro EX 2026-09/01 ». Parcours réel : commandes par facture, numéro et
   référence QR attribués, facture PDF téléchargée par la cliente. */
require('dotenv').config();
const request = require('supertest');
const { isQRReference, calculateQRReferenceChecksum } = require('swissqrbill/utils');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const { extractPdfText } = require('../helpers/pdf.helper');
const { zurichYearMonth, invoicePeriod } = require('../../utils/invoiceNumber.utils');

const address = {
  first_name: 'Test', last_name: 'Adm18', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};
let product;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const placeInvoiceOrder = async () => {
  const client = await registerVerifiedUser('adm18');
  await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${client.token}`).send({ productId: product.id, quantity: 1 });
  const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${client.token}`)
    .send({ address, payment_method: 'invoice_qr', items: [] });
  expect(res.status).toBe(201);
  const [[row]] = await pool.query('SELECT id, invoice_number, invoice_seq, qr_reference FROM orders WHERE id = ?', [res.body.data.id]);
  return { ...row, token: client.token };
};

// Référence imprimée sur le bulletin (« 00 00000 … »), espaces retirés
const printedReference = (text) => (text.match(/^\d{2}( \d{5}){5}$/m)?.[0] ?? '').replace(/ /g, '');

beforeAll(async () => {
  const list = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
  product = list.body.data[0];
});

describe('Numéro de facture année-mois/numéro (ADM-18)', () => {
  test('deux factures du mois : « AAAA-MM/NN » consécutifs, au mois suisse', async () => {
    const period = invoicePeriod(zurichYearMonth());
    const first = await placeInvoiceOrder();
    const second = await placeInvoiceOrder();
    expect(first.invoice_number).toBe(`${period}/${String(first.invoice_seq).padStart(2, '0')}`);
    expect(second.invoice_seq).toBe(first.invoice_seq + 1);
    expect(second.invoice_number).toBe(`${period}/${String(second.invoice_seq).padStart(2, '0')}`);
  });

  test('référence QR : année + mois + numéro, clé de contrôle valide', async () => {
    const { year, month } = zurichYearMonth();
    const order = await placeInvoiceOrder();
    const encoded = `${year}${String(month).padStart(2, '0')}${String(order.invoice_seq).padStart(6, '0')}`;
    expect(order.qr_reference).toMatch(new RegExp(`^0+${encoded}\\d$`));
    expect(order.qr_reference).toHaveLength(27);
    expect(isQRReference(order.qr_reference)).toBe(true);
  });

  test('la facture de la cliente porte le nouveau numéro, sur le document et le bulletin', async () => {
    const order = await placeInvoiceOrder();
    const res = await request(app).get(`/api/v1/orders/${order.id}/invoice`)
      .set('Authorization', `Bearer ${order.token}`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const text = extractPdfText(res.body);
    expect(text).toContain(`N° ${order.invoice_number}`);
    expect(text).toMatch(new RegExp(`Facture N° ${order.invoice_number.replace('/', '\\/')} du `));
    expect(printedReference(text)).toBe(order.qr_reference);
  });

  test('une facture annuelle d\'avant ADM-18 garde son numéro et sa référence', async () => {
    const order = await placeInvoiceOrder();
    // Facture émise avant le changement : numéro annuel, référence non encore stockée
    await pool.query('UPDATE orders SET invoice_number = ?, invoice_seq = 123, qr_reference = NULL WHERE id = ?', [`1999-${String(order.id).padStart(6, '0')}`, order.id]);
    const res = await request(app).get(`/api/v1/orders/${order.id}/invoice`)
      .set('Authorization', `Bearer ${order.token}`).buffer(true).parse(binary);
    const text = extractPdfText(res.body);
    expect(text).toContain(`N° 1999-${String(order.id).padStart(6, '0')}`);
    const base = '1999000123'.padStart(26, '0');
    expect(printedReference(text)).toBe(base + calculateQRReferenceChecksum(base));
  });
});
