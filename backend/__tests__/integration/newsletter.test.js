require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { buildUnsubscribeToken, buildConfirmToken } = require('../../utils/newsletter.utils');

const TEST_EMAIL = `newsletter.jest.${Date.now()}@broderie-test.ch`;

describe('Newsletter — POST /api/v1/newsletter/subscribe (double opt-in, CLI-05)', () => {
  test('une demande répond 202 : l\'inscription attend la confirmation par e-mail', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/Consultez votre boîte e-mail/);

    const [[row]] = await pool.execute(
      'SELECT is_active, source, confirmed_at FROM newsletter_subscribers WHERE email = ?', [TEST_EMAIL]
    );
    expect(row).toMatchObject({ is_active: 0, source: 'form', confirmed_at: null });
  });

  test('une seconde demande donne la même réponse — rien ne révèle si l\'adresse est connue', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(202);
    expect(res.body.message).not.toMatch(/déjà/i);
  });

  test('un lien de confirmation falsifié ou pour une autre adresse est refusé', async () => {
    const forged = await request(app)
      .post('/api/v1/newsletter/confirm')
      .send({ email: TEST_EMAIL, token: `${Math.floor(Date.now() / 1000) + 3600}.${'0'.repeat(32)}` });
    expect(forged.status).toBe(400);

    const otherAddress = await request(app)
      .post('/api/v1/newsletter/confirm')
      .send({ email: TEST_EMAIL, token: buildConfirmToken('autre@broderie-test.ch') });
    expect(otherAddress.status).toBe(400);
  });

  test('un lien expiré est refusé', async () => {
    const expired = buildConfirmToken(TEST_EMAIL, Date.now() - 8 * 24 * 3600 * 1000);
    const res = await request(app)
      .post('/api/v1/newsletter/confirm')
      .send({ email: TEST_EMAIL, token: expired });
    expect(res.status).toBe(400);
  });

  test('le lien reçu active l\'inscription et date le consentement', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/confirm')
      .send({ email: TEST_EMAIL, token: buildConfirmToken(TEST_EMAIL) });

    expect(res.status).toBe(200);
    const [[row]] = await pool.execute(
      'SELECT is_active, confirmed_at FROM newsletter_subscribers WHERE email = ?', [TEST_EMAIL]
    );
    expect(row.is_active).toBe(1);
    expect(row.confirmed_at).not.toBeNull();
  });

  test('un second clic reste un succès', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/confirm')
      .send({ email: TEST_EMAIL, token: buildConfirmToken(TEST_EMAIL) });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/déjà confirmée/);
  });

  test('email invalide retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'pasunemail', locale: 'fr' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('email manquant retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Newsletter — POST /api/v1/newsletter/unsubscribe', () => {
  test('désabonnement réussi retourne 200', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: TEST_EMAIL, token: buildUnsubscribeToken(TEST_EMAIL) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* Le jeton prouve que le demandeur a reçu l'e-mail adressé à cette adresse.
     Sans ce contrôle, connaître une adresse suffisait à désabonner autrui (CLI-05). */
  test('refuse une désinscription sans jeton', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("refuse le jeton d'une autre adresse", async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: TEST_EMAIL, token: buildUnsubscribeToken('quelquun.dautre@test.ch') });

    expect(res.status).toBe(400);
  });

  /* Une adresse absente ou déjà désabonnée renvoie un succès : c'est le résultat
     attendu par la personne qui clique — elle ne reçoit plus rien. Répondre
     « introuvable » ferait par ailleurs de ce lien un moyen de vérifier si une
     adresse est inscrite à la newsletter. */
  test('email inexistant retourne 200 sans révéler son absence', async () => {
    const email = 'inexistant@test.ch';
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email, token: buildUnsubscribeToken(email) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Recliquer sur le lien d'un e-mail ancien ne doit pas afficher d'erreur
  test('un second clic reste un succès', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: TEST_EMAIL, token: buildUnsubscribeToken(TEST_EMAIL) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
