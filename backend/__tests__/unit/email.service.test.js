// Tests unitaires email.service

jest.mock('../../config/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../config/env', () => ({
  mailFrom:    '"Au Point-Compté" <noreply@broderie.ch>',
  clientUrl:   'https://broderie.ch',
  mailContact: 'contact@broderie.ch',
}));

// Coordonnées de retrait — lues en base dans l'application
jest.mock('../../services/shopSettings.service', () => ({
  getPickupSettings: jest.fn().mockResolvedValue({
    name: 'Au Point-Compté', address: 'Chemin du Collège 6', zip: '1509', city: 'Vucherens', hours: 'Mar/Mer',
  }),
  // Textes des e-mails d'inscription saisis dans l'admin (CLI-11) — vides par défaut
  getEmailSettings: jest.fn().mockResolvedValue({ welcomeText: null, verifyText: null }),
}));

const transporter = require('../../config/mailer');
const shopSettings = require('../../services/shopSettings.service');
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

  /* Site français uniquement : quelle que soit la locale portée par le compte
     (colonne conservée en base), l'email part en français. */
  test('reste en français même si le compte porte une autre locale', async () => {
    await service.sendWelcome({ user: { ...fakeUser, locale: 'de' } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Bienvenue');
    expect(mail.html).not.toContain('Willkommen');
  });

  test('reste en français si locale absente', async () => {
    await service.sendWelcome({ user: { ...fakeUser, locale: undefined } });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Bienvenue');
  });

  test('annonce le délai de livraison 3 à 5 jours', async () => {
    await service.sendWelcome({ user: fakeUser });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('3 à 5 jours ouvrables');
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

  test('reste en français même si le compte porte une autre locale', async () => {
    await service.sendOrderConfirmation({ user: { ...fakeUser, locale: 'de' }, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Confirmation de votre commande');
    expect(mail.html).not.toContain('Zwischensumme');
  });

  test('annonce le délai de livraison 3 à 5 jours', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: fakeOrder });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('3 à 5 jours ouvrables');
  });
});

// ── CLI-08 : SKU et adresses dans les e-mails de commande ────────────────────

/* Non-régression CLI-08 — « les e-mails de confirmation de commande ne
   contiennent ni les numéros SKU des articles, ni l'adresse de livraison ». */
const shippedOrder = {
  ...fakeOrder,
  payment_method: 'invoice_qr',
  status: 'pending_invoice',
  items: [
    { product_id: 1, unit_price: 9.80, quantity: 2,
      product_snapshot_json: JSON.stringify({ name: 'Fil DMC 310', sku: 'DMC-117-310' }) },
  ],
  shipping_first_name: 'Marie', shipping_last_name: 'Dupont',
  shipping_street: 'Rue du Bourg', shipping_street_number: '12',
  shipping_zip: '1510', shipping_city: 'Moudon', shipping_canton: 'VD',
  billing_first_name: 'Marie', billing_last_name: 'Dupont',
  billing_street: 'Rue du Bourg', billing_street_number: '12',
  billing_zip: '1510', billing_city: 'Moudon', billing_canton: 'VD',
};

describe('email.service — CLI-08 : SKU et adresses', () => {
  test('la confirmation affiche la référence (SKU) de chaque article', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: shippedOrder });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Réf. DMC-117-310');
  });

  test('la confirmation affiche l\'adresse de livraison complète', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: shippedOrder });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Adresse de livraison');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('Rue du Bourg 12');
    expect(html).toContain('1510 Moudon (VD)');
  });

  test('l\'adresse de facturation n\'apparaît que si elle diffère', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: shippedOrder });
    expect(transporter.sendMail.mock.calls[0][0].html).not.toContain('Adresse de facturation');

    await service.sendOrderConfirmation({
      user: fakeUser,
      order: { ...shippedOrder, billing_street: 'Avenue de la Gare', billing_street_number: '3' },
    });
    const { html } = transporter.sendMail.mock.calls[1][0];
    expect(html).toContain('Adresse de facturation');
    expect(html).toContain('Avenue de la Gare 3');
  });

  test('un retrait en boutique affiche l\'adresse de la boutique, sans promesse d\'expédition', async () => {
    await service.sendOrderConfirmation({
      user: fakeUser,
      order: { ...shippedOrder, payment_method: 'pickup', status: 'pending_pickup' },
    });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Retrait en boutique');
    expect(html).toContain('Chemin du Collège 6');
    expect(html).not.toContain('Adresse de livraison');
    expect(html).not.toContain('numéro de suivi');
  });

  test('les données d\'adresse sont échappées (protection XSS)', async () => {
    await service.sendOrderConfirmation({
      user: fakeUser,
      order: { ...shippedOrder, shipping_street: '<script>alert(1)</script>' },
    });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('l\'adresse de livraison affiche le téléphone du destinataire', async () => {
    await service.sendOrderConfirmation({
      user: fakeUser,
      order: { ...shippedOrder, shipping_phone: '079 123 45 67' },
    });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Tél. 079 123 45 67');
    // Même adresse en facturation : le téléphone seul ne doit pas la faire apparaître
    expect(html).not.toContain('Adresse de facturation');
  });

  test('retrait en boutique : la notification donne le téléphone de la cliente', async () => {
    await service.sendAdminOrderNotification({
      user: { ...fakeUser, last_name: 'Dupont' },
      order: { ...shippedOrder, payment_method: 'pickup', shipping_phone: '079 123 45 67' },
    });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Téléphone : <strong>079 123 45 67</strong>');
  });

  test('la notification boutique affiche SKU, adresse et moyen de paiement lisible', async () => {
    await service.sendAdminOrderNotification({
      user: { ...fakeUser, last_name: 'Dupont' },
      order: shippedOrder,
    });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toContain('Réf. DMC-117-310');
    expect(html).toContain('Rue du Bourg 12');
    expect(html).toContain('Moyen de paiement : <strong>Facture QR</strong>');
    // Le statut technique ne doit plus tenir lieu de moyen de paiement
    expect(html).not.toContain('pending_invoice');
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

  test('reste en français même si le compte porte une autre locale', async () => {
    await service.sendOrderShipped({
      user:           { ...fakeUser, locale: 'de' },
      order:          { id: 1 },
      trackingNumber: '99.00.111111.11111111',
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('est en route');
    expect(mail.html).not.toContain('unterwegs');
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

  test('reste en français même si le compte porte une autre locale', async () => {
    await service.sendPasswordReset({ user: { ...fakeUser, locale: 'de' }, resetToken: 'tok' });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('Réinitialisation');
    expect(mail.html).not.toContain('Passwort');
  });
});

// ── sendInvoice() ─────────────────────────────────────────────────────────────

describe('email.service — sendInvoice()', () => {
  const dueDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  test('joint la facture PDF en pièce jointe', async () => {
    const pdfBuffer = Buffer.from('%PDF-fake');

    await service.sendInvoice({
      user:  fakeUser,
      order: { id: 42, total: 65.90 },
      pdfBuffer,
      dueDate,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('#42');
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('facture-42.pdf');
    expect(mail.attachments[0].contentType).toBe('application/pdf');
    expect(mail.attachments[0].content).toBe(pdfBuffer);
  });

  test('affiche le montant CHF total dans le corps', async () => {
    await service.sendInvoice({
      user:  fakeUser,
      order: { id: 1, total: 29.95 },
      pdfBuffer: Buffer.from('%PDF-'),
      dueDate,
    });

    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.html).toContain('29.95');
  });
});

// ── CLI-05 : e-mails de consentement newsletter ──────────────────────────────

/* Non-régression CLI-05 — « e-mail de confirmation d'opt-in newsletter non
   conforme (nLPD/RGPD) ». L'e-mail qui active l'abonnement doit dire ce qui est
   confirmé, par qui, et comment revenir en arrière. */
describe('email.service — consentement newsletter (CLI-05)', () => {
  test('l\'e-mail de vérification annonce la newsletter quand la case a été cochée', async () => {
    await service.sendEmailVerification({ user: fakeUser, verifyToken: 'tok', newsletter: true });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toMatch(/vous confirmez\s+également cette inscription/);
    expect(html).toMatch(/désinscrire à tout moment/);
    expect(html).toContain('/mentions-legales#donnees');
  });

  /* CLI-10 — « nouvelles collections, tutoriels et offres réservées aux
     abonnées » : jamais annoncé par la boutique, et faux. */
  test('aucun e-mail ne promet de contenu de newsletter', async () => {
    const promise = /tutoriels|nouvelles collections|offres réservées/i;
    await service.sendEmailVerification({ user: fakeUser, verifyToken: 'tok', newsletter: true });
    await service.sendNewsletterConfirmation({
      email: 'marie@test.ch',
      confirmUrl: 'https://broderie.ch/newsletter/confirmation?email=marie%40test.ch&token=1.abc',
    });
    for (const [mail] of transporter.sendMail.mock.calls) {
      expect(mail.html).not.toMatch(promise);
    }
  });

  test('sans case cochée, l\'e-mail de vérification ne parle pas de newsletter', async () => {
    await service.sendEmailVerification({ user: fakeUser, verifyToken: 'tok' });
    expect(transporter.sendMail.mock.calls[0][0].html).not.toMatch(/newsletter/i);
  });

  test('la confirmation newsletter dit quoi, qui, comment se désinscrire, et « ignorez si ce n\'est pas vous »', async () => {
    await service.sendNewsletterConfirmation({
      email: 'marie@test.ch',
      confirmUrl: 'https://broderie.ch/newsletter/confirmation?email=marie%40test.ch&token=1.abc',
    });
    const mail = transporter.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('marie@test.ch');
    expect(mail.subject).toMatch(/Confirmez votre inscription à la newsletter/);
    expect(mail.html).toContain('Je confirme mon inscription');
    expect(mail.html).toContain('https://broderie.ch/newsletter/confirmation?email=marie%40test.ch&amp;token=1.abc'.replace('&amp;', '&'));
    expect(mail.html).toMatch(/vous ne recevrez rien/i);
    expect(mail.html).toMatch(/désinscrire à tout moment/);
    expect(mail.html).toContain('Chemin du Collège 6, 1509 Vucherens');
    expect(mail.html).toMatch(/ignorez simplement cet email/);
    // Pas de compte derrière une inscription newsletter : le pied de page le dit
    expect(mail.html).not.toContain('vous avez un compte');
  });
});


/* CLI-11 — « besoin d'avoir la main pour modifier ce texte » : les textes des
   deux e-mails d'inscription se modifient dans l'admin (super-administrateur). */
describe('e-mails d\'inscription — texte modifiable par la boutique (CLI-11)', () => {
  // Mise en forme retirée : balises en ligne supprimées, balises de bloc remplacées par une espace
  const plain = (html) => html
    .replace(/<\/?(strong|b|em|a)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  test('champ vide : l\'e-mail de bienvenue garde son texte actuel', async () => {
    await service.sendWelcome({ user: fakeUser });
    expect(transporter.sendMail.mock.calls[0][0].html).toContain('Votre compte Au Point-Compté est créé.');
  });

  test('texte saisi : il remplace le texte de bienvenue, en paragraphes, sans HTML interprété', async () => {
    shopSettings.getEmailSettings.mockResolvedValueOnce({
      welcomeText: 'Merci de votre confiance.\n\nÀ bientôt <b>en boutique</b> !',
      verifyText: null,
    });
    await service.sendWelcome({ user: fakeUser });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toMatch(/<p[^>]*>Merci de votre confiance\.<\/p>/);
    expect(html).toContain('À bientôt &lt;b&gt;en boutique&lt;/b&gt; !');
    expect(html).not.toContain('broderies suisses');
    // Titre et bouton inchangés
    expect(html).toContain('Bienvenue, Marie !');
    expect(html).toContain('Découvrir la boutique');
  });

  test('texte saisi : il remplace l\'introduction de l\'e-mail de confirmation, le lien et la newsletter restent', async () => {
    shopSettings.getEmailSettings.mockResolvedValueOnce({ welcomeText: null, verifyText: 'Un dernier clic et c\'est prêt.' });
    await service.sendEmailVerification({ user: fakeUser, verifyToken: 'tok', newsletter: true });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html).toMatch(/Un dernier clic et c(&#39;|&#x27;|')est prêt\./);
    expect(html).not.toContain('Pour finaliser votre inscription');
    expect(html).toContain('/verifier-email?token=tok');
    expect(html).toContain('Confirmer mon adresse email');
    expect(html).toMatch(/vous confirmez\s+également cette inscription/);
  });

  test('réglages illisibles : l\'e-mail part quand même, avec le texte actuel', async () => {
    shopSettings.getEmailSettings.mockRejectedValueOnce(new Error('base indisponible'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await service.sendWelcome({ user: fakeUser });
    expect(transporter.sendMail.mock.calls[0][0].html).toContain('Votre compte Au Point-Compté est créé.');
    spy.mockRestore();
  });

  /* Le texte affiché dans l'admin sous chaque champ doit être celui réellement
     envoyé — sinon la boutique corrigerait un texte qui n'est pas le bon. */
  test('le texte actuel montré dans l\'admin est bien celui envoyé', async () => {
    await service.sendWelcome({ user: fakeUser });
    await service.sendEmailVerification({ user: fakeUser, verifyToken: 'tok' });
    const [welcome, verify] = transporter.sendMail.mock.calls.map(([m]) => plain(m.html));
    for (const para of service.DEFAULT_EMAIL_TEXTS.email_welcome_text.split('\n\n')) {
      expect(welcome).toContain(para);
    }
    expect(verify).toContain(service.DEFAULT_EMAIL_TEXTS.email_verify_text);
  });
});


/* CLI-14 — l'e-mail de confirmation de commande montre les articles achetés en
   action ; la notification envoyée à la boutique n'est pas concernée. */
describe('e-mail de confirmation — articles en action (CLI-14)', () => {
  const saleOrder = () => ({
    ...fakeOrder,
    items: [
      { product_id: 232, quantity: 3, unit_price: '1.50',
        product_snapshot_json: { name: 'DMC mouliné N° 3045', sku: 'DMC3045', compare_price_chf: '2.00' } },
      { product_id: 1493, quantity: 1, unit_price: '10.00',
        product_snapshot_json: { name: 'Graziano, tissu', sku: 'TA8279', compare_price_chf: null } },
    ],
  });

  test('mention « En action » et total normal barré sur la ligne en action seulement', async () => {
    await service.sendOrderConfirmation({ user: fakeUser, order: saleOrder() });
    const { html } = transporter.sendMail.mock.calls[0][0];
    expect(html.match(/En action -25 %/g)).toHaveLength(1);
    expect(html).toMatch(/line-through[^>]*>CHF 6\.00<\/span>CHF 4\.50/);
  });

  test('la notification à la boutique reste inchangée', async () => {
    await service.sendAdminOrderNotification({ user: fakeUser, order: saleOrder() });
    expect(transporter.sendMail.mock.calls[0][0].html).not.toMatch(/En action/);
  });
});
