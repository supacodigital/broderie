/* ADM-13 — « Ajouter la raison sociale complète et le numéro de TVA ».
   Raison individuelle : la cliente veut son nom (titulaire) et son N° TVA sur
   la facture. Parcours réel sur la base de test : saisie dans Paramètres →
   Facturation, puis lecture de la facture là où la cliente la reçoit —
   téléchargement admin, espace client et pièce jointe de l'e-mail. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const emailService = require('../../services/email.service');
const settingsRepository = require('../../repositories/settings.repository');
const shopSettingsService = require('../../services/shopSettings.service');
const env = require('../../config/env');
const { computeTotp } = require('../helpers/totp.helper');
const { registerVerifiedUser } = require('../helpers/auth.helper');
const { extractPdfText } = require('../helpers/pdf.helper');

const address = {
  first_name: 'Test', last_name: 'Adm13', street: 'Rue du Test', street_number: '12',
  zip: '1000', city: 'Lausanne', canton: 'VD',
};

const ISSUER = {
  invoice_name: 'Au Point-Compté',
  invoice_owner: 'Julie Guerle',
  invoice_address: 'Chemin du Collège 6',
  invoice_zip: '1509',
  invoice_city: 'Vucherens',
  invoice_vat_number: 'CHE-201.783.009 TVA',
};
// En-tête attendu, ligne à ligne, comme sur les factures de l'ERP de la boutique
const HEADER = /Au Point-Compté\s+Julie Guerle\s+Chemin du Collège 6 · 1509 Vucherens\s+N° TVA : CHE-201\.783\.009 TVA/;

let adminToken;
let product;
let previousSettings;

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

// Lit la réponse binaire (PDF) au lieu de la laisser interpréter comme du texte
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const createAdminToken = async () => {
  const email = `adm13.admin.${Date.now()}@broderie-test.ch`;
  const password = 'AdminJest1234!';
  await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'Admin', lastName: 'Adm13' });
  await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  const pending = login.body.data.mfaPendingToken;
  const init = await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${pending}`);
  const confirm = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${pending}`).send({ code: computeTotp(init.body.data.manualEntryKey) });
  return confirm.body.data.accessToken;
};

beforeAll(async () => {
  // Les réglages de la base de test sont remis tels quels à la fin
  previousSettings = await settingsRepository.findSettings(settingsRepository.INVOICE_KEYS);
  adminToken = await createAdminToken();
  const list = await request(app).get('/api/v1/products').query({ locale: 'fr', in_stock: 'true', limit: 1 });
  product = list.body.data[0];
}, 30000);

afterAll(async () => {
  // Réglage absent avant le test : supprimé, pas seulement vidé
  const added = settingsRepository.INVOICE_KEYS.filter((k) => !(k in previousSettings));
  if (added.length) {
    await pool.query('DELETE FROM settings WHERE `key` IN (?)', [added]);
  }
  await settingsRepository.upsertSettings(previousSettings);
  shopSettingsService.invalidate('invoice');
});

describe('Titulaire et N° TVA sur la facture (ADM-13)', () => {
  let client;
  let order;
  let emailedPdf;

  beforeAll(async () => {
    // Paramètres → Facturation, comme la boutique le fera dans l'admin
    const put = await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send(ISSUER);
    expect(put.status).toBe(200);

    // La facture part par e-mail sans attendre la réponse : on intercepte la pièce jointe
    let resolveEmail;
    const emailed = new Promise((resolve) => { resolveEmail = resolve; });
    const spy = jest.spyOn(emailService, 'sendInvoice').mockImplementation(async ({ pdfBuffer }) => {
      resolveEmail(pdfBuffer);
    });

    client = await registerVerifiedUser('adm13');
    await request(app).post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${client.token}`).send({ productId: product.id, quantity: 1 });
    const res = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ address, payment_method: 'invoice_qr', items: [] });
    expect(res.status).toBe(201);
    order = res.body.data;

    emailedPdf = await emailed;
    spy.mockRestore();
  }, 30000);

  /* Constaté en prod le 25/09 : l'onglet Facturation envoie TOUS ses champs,
     vides compris. Un délai de paiement vide était refusé (400) — impossible
     d'enregistrer le titulaire ou le N° TVA sans remplir aussi le délai. */
  test('l\'onglet Facturation s\'enregistre tel que l\'écran l\'envoie, délai vide compris', async () => {
    const res = await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send({
      invoice_name: '', invoice_owner: 'Julie Guerle', invoice_address: '', invoice_zip: '',
      invoice_city: '', invoice_vat_number: 'CHE-201.783.009 TVA', invoice_due_days: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.invoice_owner).toBe('Julie Guerle');
    expect(res.body.data.invoice_due_days).toBe('');
    // Délai vide = délai par défaut de la configuration serveur, sur la facture
    const settings = await shopSettingsService.getInvoiceSettings();
    expect(settings.dueDays).toBe(Number(env.invoiceDueDays) > 0 ? Number(env.invoiceDueDays) : 30);
    // Remet l'émetteur complet pour les tests suivants
    await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send(ISSUER);
  });

  test('un délai de paiement invalide reste refusé', async () => {
    const res = await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send({ invoice_due_days: 'abc' });
    expect(res.status).toBe(400);
  });

  test('le titulaire est enregistré et relu par l\'admin', async () => {
    const res = await request(app).get('/api/v1/admin/settings/invoice').set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.data.invoice_owner).toBe('Julie Guerle');
    expect(res.body.data.invoice_vat_number).toBe('CHE-201.783.009 TVA');
  });

  test('facture jointe à l\'e-mail de la cliente', () => {
    expect(extractPdfText(emailedPdf)).toMatch(HEADER);
  });

  test('facture téléchargée depuis l\'admin', async () => {
    const res = await request(app).get(`/api/v1/admin/orders/${order.id}/invoice`)
      .set(adminAuth()).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(extractPdfText(res.body)).toMatch(HEADER);
  });

  test('facture téléchargée depuis l\'espace client', async () => {
    const res = await request(app).get(`/api/v1/orders/${order.id}/invoice`)
      .set('Authorization', `Bearer ${client.token}`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(extractPdfText(res.body)).toMatch(HEADER);
  });

  test('titulaire effacé dans l\'admin : la ligne disparaît de la facture suivante', async () => {
    const put = await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send({ invoice_owner: '' });
    expect(put.status).toBe(200);
    const res = await request(app).get(`/api/v1/admin/orders/${order.id}/invoice`)
      .set(adminAuth()).buffer(true).parse(binary);
    const text = extractPdfText(res.body);
    expect(text).not.toContain('Julie Guerle');
    expect(text).toMatch(/Au Point-Compté\s+Chemin du Collège 6 · 1509 Vucherens\s+N° TVA : CHE-201\.783\.009 TVA/);
  });

  test('le bulletin QR garde le nom de la boutique, titulaire du compte', async () => {
    await request(app).put('/api/v1/admin/settings/invoice').set(adminAuth()).send({ invoice_owner: 'Julie Guerle' });
    const res = await request(app).get(`/api/v1/admin/orders/${order.id}/invoice`)
      .set(adminAuth()).buffer(true).parse(binary);
    const text = extractPdfText(res.body);
    // « Compte / Payable à » : IBAN puis nom de la boutique, sans le titulaire
    expect(text).toMatch(/Compte \/ Payable à\s+CH\S*(?:\s\S+)*?\s+Au Point-Compté\s+Chemin du Collège 6/);
  });
});
