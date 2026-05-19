// Tests unitaires email.service

jest.mock('../../config/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../config/env', () => ({
  mailFrom:  '"Au Point-Compté" <noreply@broderie.ch>',
  clientUrl: 'https://broderie.ch',
}));

const transporter = require('../../config/mailer');
const service     = require('../../services/email.service');

beforeEach(() => jest.clearAllMocks());

const fakeUser = { email: 'marie@test.ch', first_name: 'Marie', locale: 'fr' };
const fakeOrder = {
  id: 42,
  subtotal:      58.40,
  shipping_cost:  7.50,
  tax_amount:     4.72,
  total:         65.90,
  items: [
    { product_id: 1, unit_price: 9.80, quantity: 2, product_snapshot_json: JSON.stringify({ name: 'Fil DMC' }) },
  ],
};

// ── sendWelcome() ─────────────────────────────────────────────────────────────

describe('email.service — sendWelcome()', () => {
  test('envoie un email de bienvenue FR', async () => {
    await service.sendWelcome({ user: fakeUser });

    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('marie@test.ch');
    expect(mail.subject).toContain('Bienvenue');
    expect(mail.html).toContain('Marie');
    expect(mail.html).toContain('broderie.ch');
  });

  test('envoie en DE si locale = de', async () => {
    await service.sendWelcome({ user: { ...fakeUser, locale: 'de' } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Willkommen');
  });

  test('envoie en EN si locale = en', async () => {
    await service.sendWelcome({ user: { ...fakeUser, locale: 'en' } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Welcome');
  });

  test('utilise FR par défaut si locale absente', async () => {
    await service.sendWelcome({ user: { ...fakeUser, locale: undefined } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Bienvenue');
  });

  test('échappe les caractères HTML dans le prénom', async () => {
    await service.sendWelcome({ user: { ...fakeUser, first_name: '<script>alert(1)</script>' } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

// ── sendOrderConfirmation() ───────────────────────────────────────────────────

describe('email.service — sendOrderConfirmation()', () => {
  test('envoie la confirmation avec le numéro de commande', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('#42');
    expect(mail.html).toContain('42');
  });

  test('inclut les articles avec leur prix', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Fil DMC');
    expect(mail.html).toContain('CHF');
  });

  test('inclut le total TTC', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('65.90');
  });

  test('gère un product_snapshot_json déjà parsé (objet)', async () => {
    const orderParsed = {
      ...fakeOrder,
      items: [{ product_id: 1, unit_price: 5, quantity: 1, product_snapshot_json: { name: 'Aiguille' } }],
    };
    await service.sendOrderConfirmation({ user: fakeUser, order: orderParsed });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Aiguille');
  });

  test('gère items undefined sans planter', async () => {
    await service.sendOrderConfirmation({
      user:  fakeUser,
      order: { ...fakeOrder, items: undefined },
    });

    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });

  test('envoie en DE', async () => {
    await service.sendOrderConfirmation({ user: { ...fakeUser, locale: 'de' }, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Bestellbestätigung');
  });
});

// ── sendOrderShipped() ────────────────────────────────────────────────────────

describe('email.service — sendOrderShipped()', () => {
  test('envoie l\'email d\'expédition avec le numéro de suivi', async () => {
    await service.sendOrderShipped({
      user:           fakeUser,
      order:          { id: 42 },
      trackingNumber: '99.00.123456.12345678',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('#42');
    expect(mail.html).toContain('99.00.123456.12345678');
    expect(mail.html).toContain('post.ch');
  });

  test('échappe le numéro de suivi (protection XSS)', async () => {
    await service.sendOrderShipped({
      user:           fakeUser,
      order:          { id: 1 },
      trackingNumber: '<img src=x onerror=alert(1)>',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img');
  });

  test('envoie en DE', async () => {
    await service.sendOrderShipped({
      user:           { ...fakeUser, locale: 'de' },
      order:          { id: 1 },
      trackingNumber: '99.00.111111.11111111',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('unterwegs');
  });
});

// ── sendPasswordReset() ───────────────────────────────────────────────────────

describe('email.service — sendPasswordReset()', () => {
  test('envoie le lien de réinitialisation', async () => {
    await service.sendPasswordReset({ user: fakeUser, resetToken: 'token-abc-123' });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Réinitialisation');
    expect(mail.html).toContain('token-abc-123');
    expect(mail.html).toContain('reinitialiser-mot-de-passe');
  });

  test('mentionne la validité d\'1 heure', async () => {
    await service.sendPasswordReset({ user: fakeUser, resetToken: 'tok' });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('1 heure');
  });

  test('envoie en DE', async () => {
    await service.sendPasswordReset({ user: { ...fakeUser, locale: 'de' }, resetToken: 'tok' });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('zurücksetzen');
  });
});

// ── sendOrderStatusUpdate() ───────────────────────────────────────────────────

describe('email.service — sendOrderStatusUpdate()', () => {
  test('envoie la mise à jour statut "shipped"', async () => {
    await service.sendOrderStatusUpdate({
      user:      fakeUser,
      order:     { id: 42 },
      newStatus: 'shipped',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('#42');
    expect(mail.html).toContain('Expédiée');
  });

  test('envoie statut "cancelled"', async () => {
    await service.sendOrderStatusUpdate({
      user:      fakeUser,
      order:     { id: 10 },
      newStatus: 'cancelled',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Annulée');
  });

  test('envoie statut "delivered"', async () => {
    await service.sendOrderStatusUpdate({
      user:      fakeUser,
      order:     { id: 5 },
      newStatus: 'delivered',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Livrée');
  });

  test('envoie en DE avec les bons labels', async () => {
    await service.sendOrderStatusUpdate({
      user:      { ...fakeUser, locale: 'de' },
      order:     { id: 1 },
      newStatus: 'shipped',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('Versendet');
  });

  test('utilise le newStatus brut si inconnu', async () => {
    await service.sendOrderStatusUpdate({
      user:      fakeUser,
      order:     { id: 1 },
      newStatus: 'custom_status',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('custom_status');
  });
});

// ── sendMigrationWelcome() ────────────────────────────────────────────────────

describe('email.service — sendMigrationWelcome()', () => {
  test('envoie l\'email de migration avec le lien reset', async () => {
    await service.sendMigrationWelcome({ user: fakeUser, resetToken: 'migr-token-xyz' });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('marie@test.ch');
    expect(mail.html).toContain('migr-token-xyz');
    expect(mail.html).toContain('reinitialiser-mot-de-passe');
    expect(mail.html).toContain('48 heures');
  });
});

// ── sendTwintQr() ─────────────────────────────────────────────────────────────

describe('email.service — sendTwintQr()', () => {
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  test('envoie en mode test avec un lien redirect (pas de pièce jointe)', async () => {
    await service.sendTwintQr({
      user:        fakeUser,
      order:       { id: 42, total: 65.90 },
      qrBuffer:    null,
      expiresAt,
      redirectUrl: 'https://stripe.com/pay/test',
      isTestMode:  true,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('#42');
    expect(mail.html).toContain('Simuler le paiement Twint');
    expect(mail.html).toContain('stripe.com');
    expect(mail.attachments).toBeUndefined();
  });

  test('envoie en mode prod avec le QR en pièce jointe inline', async () => {
    const qrBuffer = Buffer.from('fake-png-data');

    await service.sendTwintQr({
      user:       fakeUser,
      order:      { id: 42, total: 65.90 },
      qrBuffer,
      expiresAt,
      isTestMode: false,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('cid:twint-qr');
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].cid).toBe('twint-qr');
    expect(mail.attachments[0].content).toBe(qrBuffer);
  });

  test('affiche le montant CHF total dans le corps', async () => {
    await service.sendTwintQr({
      user:       fakeUser,
      order:      { id: 1, total: 29.95 },
      qrBuffer:   null,
      expiresAt,
      isTestMode: true,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('29.95');
  });

  test('contient la date d\'expiration du QR', async () => {
    await service.sendTwintQr({
      user:       fakeUser,
      order:      { id: 1, total: 10 },
      qrBuffer:   null,
      expiresAt,
      isTestMode: true,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('expire');
  });
});
