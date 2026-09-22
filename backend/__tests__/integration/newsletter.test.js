require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { buildUnsubscribeToken } = require('../../utils/newsletter.utils');

const TEST_EMAIL = `newsletter.jest.${Date.now()}@broderie-test.ch`;

describe('Newsletter — POST /api/v1/newsletter/subscribe', () => {
  test('inscription réussie retourne 201', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('double inscription retourne 200 avec message "déjà inscrit"', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/déjà/i);
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
