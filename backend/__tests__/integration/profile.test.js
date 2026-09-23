require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');

/* Non-régression CLI-06 — « impossible de modifier les informations
   personnelles du compte client ».
   - le profil est validé côté serveur, avec l'erreur rattachée au champ ;
   - le téléphone se saisit et se modifie dans les adresses du compte ;
   - modifier une adresse ne lui retire plus son statut « par défaut ». */

const address = {
  label: 'Maison', address_type: 'both',
  street: 'Rue du Bourg', street_number: '12',
  zip: '1510', city: 'Moudon', canton: 'VD',
};

describe('CLI-06 — PUT /api/v1/users/me', () => {
  let token;
  beforeAll(async () => { ({ token } = await registerVerifiedUser('profile.jest')); });

  test('enregistre prénom et nom, espaces superflus retirés', async () => {
    const res = await request(app)
      .put('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: '  Claire ', last_name: 'Dupont', email: 'ignoree@example.ch' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ first_name: 'Claire', last_name: 'Dupont' });
    // L'adresse e-mail ne se modifie pas par cette route
    expect(res.body.data.email).not.toBe('ignoree@example.ch');
  });

  test('refuse un prénom vide, avec l\'erreur rattachée au champ', async () => {
    const res = await request(app)
      .put('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: '   ', last_name: 'Dupont' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'first_name', message: 'Le prénom est obligatoire.' }]);
  });

  test('refuse un nom de plus de 100 caractères', async () => {
    const res = await request(app)
      .put('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Claire', last_name: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('last_name');
  });
});

describe('CLI-06 — adresses du compte', () => {
  let token;
  let userId;
  beforeAll(async () => { ({ token, userId } = await registerVerifiedUser('address.jest')); });

  test('enregistre puis modifie le téléphone d\'une adresse', async () => {
    const created = await request(app)
      .post('/api/v1/users/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...address, phone: '079 123 45 67' });

    expect(created.status).toBe(201);
    expect(created.body.data.phone).toBe('079 123 45 67');

    const updated = await request(app)
      .put(`/api/v1/users/me/addresses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...address, phone: '+41 21 000 00 00' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.phone).toBe('+41 21 000 00 00');
  });

  test('refuse un téléphone contenant des lettres', async () => {
    const res = await request(app)
      .post('/api/v1/users/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...address, phone: 'appelez-moi' });

    expect(res.status).toBe(400);
  });

  test('modifier l\'adresse par défaut lui garde ce statut', async () => {
    const created = await request(app)
      .post('/api/v1/users/me/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...address, label: 'Principale', is_default: true });
    const id = created.body.data.id;

    // Le formulaire du compte n'envoie pas is_default
    const updated = await request(app)
      .put(`/api/v1/users/me/addresses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...address, label: 'Principale', street: 'Rue Neuve' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.street).toBe('Rue Neuve');
    expect(!!updated.body.data.is_default).toBe(true);

    const [[row]] = await pool.execute('SELECT is_default FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    expect(row.is_default).toBe(1);
  });
});

/* Non-régression CLI-05 — « case à cocher explicite (Oui/Non) ». La cliente qui
   n'avait pas coché à l'inscription ne pouvait plus s'inscrire depuis son compte. */
describe('CLI-05 — préférence newsletter dans le compte', () => {
  let token;
  let userId;
  let email;
  beforeAll(async () => { ({ token, userId, email } = await registerVerifiedUser('nlpref.jest')); });
  afterAll(async () => {
    await pool.execute('DELETE FROM newsletter_subscribers WHERE email = ?', [email]);
  });

  const getStatus = async () => (await request(app)
    .get('/api/v1/users/me/newsletter')
    .set('Authorization', `Bearer ${token}`)).body.data.status;

  test('par défaut, la cliente n\'est pas inscrite', async () => {
    expect(await getStatus()).toBe('none');
  });

  test('« Oui » avec une adresse vérifiée : inscription immédiate, consentement daté', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/newsletter')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('subscribed');
    const [[row]] = await pool.execute(
      'SELECT is_active, source, confirmed_at FROM newsletter_subscribers WHERE email = ?', [email]
    );
    expect(row).toMatchObject({ is_active: 1, source: 'account' });
    expect(row.confirmed_at).not.toBeNull();
  });

  test('« Non » désinscrit', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/newsletter')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: false });

    expect(res.body.data.status).toBe('none');
    expect(await getStatus()).toBe('none');
  });

  test('« Oui » avec une adresse non vérifiée : en attente, activée à la vérification', async () => {
    await pool.execute('UPDATE users SET email_verified_at = NULL WHERE id = ?', [userId]);
    const res = await request(app)
      .put('/api/v1/users/me/newsletter')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: true });

    expect(res.body.data.status).toBe('pending');
    expect(await getStatus()).toBe('pending');
    await pool.execute('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [userId]);
  });

  test('« Non » annule aussi une demande en attente', async () => {
    await request(app)
      .put('/api/v1/users/me/newsletter')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: false });

    expect(await getStatus()).toBe('none');
  });

  test('une valeur autre que oui/non est refusée', async () => {
    const res = await request(app)
      .put('/api/v1/users/me/newsletter')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscribed: 'peut-être' });
    expect(res.status).toBe(400);
  });
});
