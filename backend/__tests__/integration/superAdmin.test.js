/* Rôle super-administrateur — ticket ADM-08, revu le 26.09.
   « Créer un profil super-administrateur avec accès complet aux pages de
   contenu et blocs promotionnels. » Depuis le 26.09, ce compte ne gère QUE le
   contenu du site (textes et mise en forme) : plus d'accès aux commandes ni aux
   clientes. Il garde les protections d'un compte du back-office (double
   authentification) ; un administrateur simple n'a pas accès au contenu.
   Testé de bout en bout, jetons réels. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');

const PASSWORD = 'SuperJest1234!';

// Crée un compte du rôle demandé et déroule la double authentification
const backOfficeToken = async (role) => {
  const email = `${role}.${Date.now()}.${Math.round(Math.random() * 1e6)}@broderie-test.ch`;
  await request(app).post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Jest', lastName: role });
  await pool.execute('UPDATE users SET role = ? WHERE email = ?', [role, email]);

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  const { mfaRequired, mfaPendingToken, accessToken } = loginRes.body.data;

  const initRes = await request(app).post('/api/v1/mfa/setup/init')
    .set('Authorization', `Bearer ${mfaPendingToken}`);
  const confirmRes = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${mfaPendingToken}`)
    .send({ code: computeTotp(initRes.body.data.manualEntryKey) });

  return { mfaRequired, loginAccessToken: accessToken, token: confirmRes.body.data.accessToken };
};

let admin;
let superAdmin;

/* Deux comptes créés avec double authentification : chaque étape hache un mot
   de passe ou des codes de secours (bcrypt, coût 12). Les 5 s par défaut
   suffisaient de justesse et cédaient dès que la machine était chargée. */
beforeAll(async () => {
  admin = await backOfficeToken('admin');
  superAdmin = await backOfficeToken('super_admin');
}, 30000);

afterAll(async () => {
  // Les textes et mises en forme d'essai ne doivent pas rester dans la base de test
  await pool.execute("UPDATE settings SET value = '' WHERE `key` IN ('hero_title', 'hero_stats_enabled')");
  await pool.execute("DELETE FROM settings WHERE `key` IN ('home_styles', 'about_styles', 'banner_styles', 'legal_styles')");
});

describe('Super-administrateur — protections du back-office (ADM-08)', () => {
  test('la connexion exige la double authentification, comme pour un administrateur', () => {
    expect(superAdmin.mfaRequired).toBe('setup');
    expect(superAdmin.loginAccessToken).toBeUndefined();
    expect(superAdmin.token).toBeTruthy();
  });

  test('n\'a plus accès au reste du back-office : commandes, clientes, catalogue, paramètres (403)', async () => {
    for (const url of [
      '/api/v1/admin/orders', '/api/v1/admin/customers', '/api/v1/admin/products',
      '/api/v1/admin/invoices', '/api/v1/admin/dashboard/stats', '/api/v1/admin/settings/store',
    ]) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${superAdmin.token}`);
      expect(res.status).toBe(403);
    }
    const put = await request(app).put('/api/v1/admin/settings/store')
      .set('Authorization', `Bearer ${superAdmin.token}`).send({ store_name: 'x' });
    expect(put.status).toBe(403);
  });

  test('gère sa propre double authentification (statut, codes de secours)', async () => {
    const res = await request(app).get('/api/v1/mfa/status').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
  });
});

describe('Pages de contenu et blocs promotionnels — réservés au super-administrateur', () => {
  const CONTENT = [
    '/api/v1/admin/settings/legal', '/api/v1/admin/settings/about', '/api/v1/admin/settings/home',
    '/api/v1/admin/settings/banner',
    '/api/v1/admin/settings/emails', // textes des e-mails d'inscription (CLI-11)
  ];

  test('un administrateur simple est refusé (403)', async () => {
    for (const url of CONTENT) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(403);
    }
    const put = await request(app).put('/api/v1/admin/settings/legal')
      .set('Authorization', `Bearer ${admin.token}`).send({ cgv: 'x' });
    expect(put.status).toBe(403);
  });

  test('un administrateur simple garde le reste du back-office', async () => {
    const res = await request(app).get('/api/v1/admin/orders').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  test('le super-administrateur lit et modifie les contenus', async () => {
    for (const url of CONTENT) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${superAdmin.token}`);
      expect(res.status).toBe(200);
    }
  });

  test('un bloc de la page d\'accueil modifié est publié sur la boutique', async () => {
    const put = await request(app).put('/api/v1/admin/settings/home')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ hero_title: 'Titre de test ADM-08', hero_stats_enabled: '0' });
    expect(put.status).toBe(200);

    const pub = await request(app).get('/api/v1/legal/home');
    expect(pub.status).toBe(200);
    expect(pub.body.data.hero_title).toBe('Titre de test ADM-08');
    expect(pub.body.data.hero_stats_enabled).toBe('0');
  });

  test('un administrateur simple ne lit pas le catalogue de polices (403)', async () => {
    const res = await request(app).get('/api/v1/admin/settings/fonts').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  test('l\'interrupteur des chiffres clés n\'accepte que 0 ou 1', async () => {
    const res = await request(app).put('/api/v1/admin/settings/home')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ hero_stats_enabled: 'oui' });
    expect(res.status).toBe(400);
  });
});

/* Mise en forme des textes (26.09) — « le simple fait d'écrire du texte ne
   suffit pas » : police, graisse, taille, couleur, alignement, italique /
   majuscules / souligné, interligne et espacement, texte par texte. */
describe('Mise en forme des textes — réservée au super-administrateur', () => {
  const put = (url, body, token = superAdmin.token) =>
    request(app).put(url).set('Authorization', `Bearer ${token}`).send(body);

  test('catalogue de polices : uniquement des polices servies par le site, avec leurs graisses', async () => {
    const res = await request(app).get('/api/v1/admin/settings/fonts').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    const lora = res.body.data.find((f) => f.key === 'lora');
    expect(lora).toMatchObject({ label: 'Lora', family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], italic: true });
    expect(res.body.data.map((f) => f.key)).toEqual(expect.arrayContaining(['montserrat', 'cormorant-infant', 'great-vibes']));
  });

  test('enregistrée avec les textes, relue par l\'administration, publiée sur la boutique', async () => {
    const style = {
      font: 'lora', weight: 700, size: 64, color: '#AA3366', align: 'center',
      italic: true, uppercase: false, underline: false, lineHeight: 1.2, letterSpacing: 0.05,
    };
    const saved = await put('/api/v1/admin/settings/home', { hero_title: 'Titre mis en forme', styles: { hero_title: style } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.hero_title).toBe('Titre mis en forme');
    // Couleur normalisée en minuscules
    expect(saved.body.data.styles.hero_title).toEqual({ ...style, color: '#aa3366' });

    const read = await request(app).get('/api/v1/admin/settings/home').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(read.body.data.styles.hero_title.font).toBe('lora');

    // La boutique reçoit la pile CSS de la police, pas la clé du catalogue
    const pub = await request(app).get('/api/v1/legal/home');
    expect(pub.body.data.styles.hero_title).toEqual({
      fontFamily: "'Lora', serif", weight: 700, size: 64, color: '#aa3366', align: 'center',
      italic: true, uppercase: false, underline: false, lineHeight: 1.2, letterSpacing: 0.05,
    });
  });

  test('enregistrer les textes sans « styles » garde la mise en forme existante', async () => {
    await put('/api/v1/admin/settings/about', { styles: { about_quote: { size: 40 } } });
    const res = await put('/api/v1/admin/settings/about', { about_quote: 'Une citation' });
    expect(res.status).toBe(200);
    expect(res.body.data.styles).toEqual({ about_quote: { size: 40 } });
  });

  test('une mise en forme vide est retirée (retour à l\'apparence du site)', async () => {
    const res = await put('/api/v1/admin/settings/about', { styles: { about_quote: {} } });
    expect(res.status).toBe(200);
    expect(res.body.data.styles).toEqual({});
  });

  test('bandeau et textes légaux : publiés avec leur mise en forme', async () => {
    await put('/api/v1/admin/settings/banner', {
      banner_enabled: '1', banner_text: 'Fermé du 24 au 31 décembre', styles: { banner_text: { font: 'raleway', weight: 600 } },
    });
    const banner = await request(app).get('/api/v1/legal/banner');
    expect(banner.body.data).toMatchObject({ text: 'Fermé du 24 au 31 décembre', style: { fontFamily: "'Raleway', sans-serif", weight: 600 } });

    await put('/api/v1/admin/settings/legal', { styles: { cgv: { size: 16, lineHeight: 2 } } });
    const legal = await request(app).get('/api/v1/legal');
    expect(legal.body.data.styles.cgv).toEqual({ size: 16, lineHeight: 2 });

    await put('/api/v1/admin/settings/banner', { banner_enabled: '0', banner_text: '', styles: {} });
  });

  test.each([
    ['police inconnue',                     { hero_title: { font: 'comic-sans' } },            'styles.hero_title.font'],
    ['graisse absente de la police',        { hero_title: { font: 'great-vibes', weight: 700 } }, 'styles.hero_title.weight'],
    ['taille démesurée',                    { hero_title: { size: 400 } },                     'styles.hero_title.size'],
    ['couleur hors format',                 { hero_title: { color: 'red; background: url(x)' } }, 'styles.hero_title.color'],
    ['propriété CSS arbitraire',            { hero_title: { position: 'fixed' } },             'styles.hero_title'],
    ['texte qui ne se met pas en forme',    { hero_stats_enabled: { size: 20 } },              'styles.hero_stats_enabled'],
    ['texte inconnu',                       { evil: { size: 20 } },                            'styles.evil'],
  ])('refusée (400) : %s', async (_label, styles, field) => {
    const res = await put('/api/v1/admin/settings/home', { hero_title: 'Ne doit pas être enregistré', styles });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe(field);
    // Rien n'est enregistré, ni le texte ni la mise en forme
    const read = await request(app).get('/api/v1/admin/settings/home').set('Authorization', `Bearer ${superAdmin.token}`);
    expect(read.body.data.hero_title).not.toBe('Ne doit pas être enregistré');
  });

  test('un administrateur simple ne peut pas mettre en forme (403)', async () => {
    const res = await put('/api/v1/admin/settings/home', { styles: { hero_title: { size: 20 } } }, admin.token);
    expect(res.status).toBe(403);
  });
});

/* CLI-11 — « besoin d'avoir la main pour modifier ce texte » (e-mails envoyés à
   l'inscription), sur le compte super-administrateur. */
describe('Textes des e-mails d\'inscription — réservés au super-administrateur (CLI-11)', () => {
  const URL = '/api/v1/admin/settings/emails';

  afterAll(async () => {
    await pool.execute("DELETE FROM settings WHERE `key` IN ('email_welcome_text', 'email_verify_text')");
  });

  test('un administrateur simple ne peut pas les modifier (403)', async () => {
    const res = await request(app).put(URL).set('Authorization', `Bearer ${admin.token}`)
      .send({ email_welcome_text: 'x' });
    expect(res.status).toBe(403);
  });

  test('champs vides au départ, avec le texte actuellement envoyé pour référence', async () => {
    await pool.execute("DELETE FROM settings WHERE `key` IN ('email_welcome_text', 'email_verify_text')");
    const res = await request(app).get(URL).set('Authorization', `Bearer ${superAdmin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.values.email_welcome_text ?? '').toBe('');
    expect(res.body.data.values.email_verify_text ?? '').toBe('');
    expect(res.body.data.defaults.email_welcome_text).toMatch(/Votre compte Au Point-Compté est créé/);
    expect(res.body.data.defaults.email_verify_text).toMatch(/Pour finaliser votre inscription/);
  });

  test('le super-administrateur enregistre un texte, puis peut le vider', async () => {
    const put = await request(app).put(URL).set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ email_welcome_text: 'Merci pour votre inscription.' });
    expect(put.status).toBe(200);
    expect(put.body.data.values.email_welcome_text).toBe('Merci pour votre inscription.');

    const emptied = await request(app).put(URL).set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ email_welcome_text: '' });
    expect(emptied.status).toBe(200);
    expect(emptied.body.data.values.email_welcome_text).toBe('');
  });

  test('un texte qui n\'en est pas un est refusé (400)', async () => {
    const res = await request(app).put(URL).set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ email_verify_text: { html: '<script>' } });
    expect(res.status).toBe(400);
  });
});

/* Création réelle du compte (scripts/create-super-admin.js) puis premier mot
   de passe — répétition du 25.09 avant la création en production.
   Deux défauts relevés : l'e-mail envoyé était celui de la réinitialisation
   (« ignorez cet email » si vous n'avez rien demandé), et un mot de passe trop
   court s'affichait « Ce lien est invalide ou a expiré ». */
describe('Création du compte super-administrateur et premier mot de passe', () => {
  const crypto = require('crypto');
  const { execFileSync } = require('child_process');
  const path = require('path');
  const userRepository = require('../../repositories/user.repository');
  const email = `super.creation.${Date.now()}@broderie-test.ch`;

  const setLink = async (userId) => {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await userRepository.saveResetToken(userId, hash, new Date(Date.now() + 3600000));
    return raw;
  };

  test('le script crée le compte sans mot de passe et envoie l\'e-mail d\'invitation', () => {
    const stdout = execFileSync(process.execPath, [
      path.join(__dirname, '../../scripts/create-super-admin.js'),
      '--email', email, '--first', 'Super', '--last', 'Admin', '--create',
    ], { env: { ...process.env, MAIL_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

    // Service e-mail en suspens : le destinataire et le sujet sont journalisés
    expect(stdout).toContain(email);
    expect(stdout).toContain('Votre accès à l\'administration — Au Point-Compté');
    expect(stdout).not.toContain('Réinitialisation');
    expect(stdout).toMatch(/Compte n° \d+ créé/);
  });

  test('en base : super-administrateur, sans mot de passe, lien en attente', async () => {
    const [[user]] = await pool.query(
      'SELECT role, first_name, last_name, password_hash, reset_token_hash IS NOT NULL AS has_link FROM users WHERE email = ?',
      [email]
    );
    expect(user).toMatchObject({ role: 'super_admin', first_name: 'Super', last_name: 'Admin', password_hash: null, has_link: 1 });
  });

  test('mot de passe trop court : erreur sur le champ, le lien reste valable', async () => {
    const [[user]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    const token = await setLink(user.id);
    const message = 'Le mot de passe doit contenir au moins 12 caractères, dont une majuscule.';

    const short = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'Broderie26!' });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ success: false, message, errors: [{ field: 'password', message }] });

    const ok = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'PointCompte2026!' });
    expect(ok.status).toBe(200);
  });

  test('première connexion : configuration de la double authentification demandée', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'PointCompte2026!' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mfaRequired: 'setup' });
    expect(res.body.data.accessToken).toBeUndefined();
  });
});
