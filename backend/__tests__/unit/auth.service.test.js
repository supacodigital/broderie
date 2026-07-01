// Tests unitaires auth.service — tous les repositories et services externes mockés

jest.mock('../../repositories/user.repository');
jest.mock('../../services/email.service');
// Mock Google client comme objet (jamais null) pour pouvoir surcharger verifyIdToken par test
jest.mock('../../config/google', () => ({ verifyIdToken: jest.fn() }));
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const userRepository = require('../../repositories/user.repository');
const emailService   = require('../../services/email.service');
const bcrypt         = require('bcrypt');
const jwt            = require('jsonwebtoken');
const authService    = require('../../services/auth.service');

beforeEach(() => jest.clearAllMocks());

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 1,
    email: 'test@broderie.ch',
    first_name: 'Julie',
    last_name: 'Test',
    role: 'client',
    locale: 'fr',
    is_active: 1,
    deleted_at: null,
    password_hash: '$2b$12$hashedpassword',
    ...overrides,
  };
}

// ── register() ───────────────────────────────────────────────────────────────

describe('auth.service — register()', () => {
  test('crée un utilisateur et retourne accessToken + refreshToken', async () => {
    userRepository.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue('$2b$12$hashed');
    userRepository.create.mockResolvedValue(1);
    userRepository.findById.mockResolvedValue(makeUser());
    userRepository.saveVerifyToken.mockResolvedValue();
    jwt.sign.mockReturnValueOnce('access_token_mock').mockReturnValueOnce('refresh_token_mock');
    emailService.sendWelcome.mockResolvedValue();
    emailService.sendEmailVerification.mockResolvedValue();

    const result = await authService.register({
      email: 'test@broderie.ch', password: 'Test1234!',
      firstName: 'Julie', lastName: 'Test', locale: 'fr',
    });

    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@broderie.ch',
      passwordHash: '$2b$12$hashed',
    }));
    expect(result.accessToken).toBe('access_token_mock');
    expect(result.refreshToken).toBe('refresh_token_mock');
    expect(result.user.email).toBe('test@broderie.ch');
  });

  test('lève 409 si email déjà utilisé', async () => {
    userRepository.emailExists.mockResolvedValue(true);

    await expect(
      authService.register({ email: 'existant@broderie.ch', password: 'Test1234!', firstName: 'A', lastName: 'B' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(userRepository.create).not.toHaveBeenCalled();
  });

  test('envoie email de bienvenue de façon non bloquante', async () => {
    userRepository.emailExists.mockResolvedValue(false);
    bcrypt.hash.mockResolvedValue('$2b$12$hashed');
    userRepository.create.mockResolvedValue(1);
    userRepository.findById.mockResolvedValue(makeUser());
    userRepository.saveVerifyToken.mockResolvedValue();
    jwt.sign.mockReturnValue('token');
    emailService.sendWelcome.mockResolvedValue();
    emailService.sendEmailVerification.mockResolvedValue();

    await authService.register({ email: 'new@broderie.ch', password: 'Test1234!', firstName: 'A', lastName: 'B' });

    // Petit délai pour que le .catch() non bloquant s'exécute
    await new Promise(r => setTimeout(r, 10));
    expect(emailService.sendWelcome).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(Object) }));
  });
});

// ── login() ───────────────────────────────────────────────────────────────────

describe('auth.service — login()', () => {
  test('retourne tokens si credentials valides', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser());
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValueOnce('access').mockReturnValueOnce('refresh');

    const result = await authService.login({ email: 'test@broderie.ch', password: 'Test1234!' });

    expect(result.accessToken).toBe('access');
    expect(result.user.email).toBe('test@broderie.ch');
  });

  test('lève 401 si utilisateur introuvable', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'inconnu@broderie.ch', password: 'Test1234!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 401 si utilisateur supprimé (soft delete)', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser({ deleted_at: new Date() }));

    await expect(
      authService.login({ email: 'supprime@broderie.ch', password: 'Test1234!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 403 si compte désactivé', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser({ is_active: 0 }));

    await expect(
      authService.login({ email: 'desactive@broderie.ch', password: 'Test1234!' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('lève 401 si compte Google sans mot de passe', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser({ password_hash: null }));

    await expect(
      authService.login({ email: 'google@broderie.ch', password: 'Test1234!' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 401 si mot de passe incorrect', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser());
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      authService.login({ email: 'test@broderie.ch', password: 'mauvais' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── refreshToken() ────────────────────────────────────────────────────────────

describe('auth.service — refreshToken()', () => {
  test('retourne nouveaux tokens si refresh token valide', async () => {
    jwt.verify.mockReturnValue({ id: 1 });
    userRepository.findById.mockResolvedValue(makeUser());
    jwt.sign.mockReturnValueOnce('new_access').mockReturnValueOnce('new_refresh');

    const result = await authService.refreshToken('valid_refresh_token');

    expect(result.accessToken).toBe('new_access');
    expect(result.refreshToken).toBe('new_refresh');
  });

  test('lève 401 si token manquant', async () => {
    await expect(authService.refreshToken(null)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.refreshToken(undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 401 si token invalide (jwt.verify lance)', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid'); });

    await expect(authService.refreshToken('bad_token')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 401 si utilisateur introuvable après vérification', async () => {
    jwt.verify.mockReturnValue({ id: 99 });
    userRepository.findById.mockResolvedValue(null);

    await expect(authService.refreshToken('token')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 401 si utilisateur inactif', async () => {
    jwt.verify.mockReturnValue({ id: 1 });
    userRepository.findById.mockResolvedValue(makeUser({ is_active: 0 }));

    await expect(authService.refreshToken('token')).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── forgotPassword() ──────────────────────────────────────────────────────────

describe('auth.service — forgotPassword()', () => {
  test('envoie un email de reset si utilisateur actif', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser());
    userRepository.saveResetToken.mockResolvedValue();
    emailService.sendPasswordReset.mockResolvedValue();

    await authService.forgotPassword('test@broderie.ch');

    expect(userRepository.saveResetToken).toHaveBeenCalledWith(
      1, expect.any(String), expect.any(Date)
    );
    await new Promise(r => setTimeout(r, 10));
    expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ resetToken: expect.any(String) })
    );
  });

  test('ne fait rien si email inconnu (anti-énumération)', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await authService.forgotPassword('inconnu@broderie.ch');

    expect(userRepository.saveResetToken).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  test('ne fait rien si compte supprimé', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser({ deleted_at: new Date() }));

    await authService.forgotPassword('supprime@broderie.ch');

    expect(userRepository.saveResetToken).not.toHaveBeenCalled();
  });

  test('ne fait rien si compte inactif', async () => {
    userRepository.findByEmail.mockResolvedValue(makeUser({ is_active: 0 }));

    await authService.forgotPassword('inactif@broderie.ch');

    expect(userRepository.saveResetToken).not.toHaveBeenCalled();
  });
});

// ── resetPassword() ───────────────────────────────────────────────────────────

describe('auth.service — resetPassword()', () => {
  test('met à jour le mot de passe avec un token valide', async () => {
    userRepository.findByResetToken.mockResolvedValue(makeUser());
    bcrypt.hash.mockResolvedValue('$2b$12$newHash');
    userRepository.updatePassword.mockResolvedValue();

    await authService.resetPassword('valid_raw_token', 'NouveauMdp1!');

    expect(userRepository.updatePassword).toHaveBeenCalledWith(1, '$2b$12$newHash');
  });

  test('lève 400 si token invalide ou expiré', async () => {
    userRepository.findByResetToken.mockResolvedValue(null);

    await expect(
      authService.resetPassword('bad_token', 'NouveauMdp1!')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève 400 si nouveau mot de passe trop court', async () => {
    userRepository.findByResetToken.mockResolvedValue(makeUser());

    await expect(
      authService.resetPassword('valid', 'court')
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── refreshCookieOptions() ────────────────────────────────────────────────────

describe('auth.service — refreshCookieOptions()', () => {
  test('retourne les options cookie correctes', () => {
    const opts = authService.refreshCookieOptions();

    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/api/v1/auth');
    expect(opts.maxAge).toBeGreaterThan(0);
  });
});

// ── loginWithGoogle() ─────────────────────────────────────────────────────────

// Le mock jest.mock('../../config/google') retourne undefined par défaut.
// On charge le module mocké et on le remplace manuellement par un objet avec verifyIdToken.
const googleModule = require('../../config/google');

function setupGoogleClient(payloadOverride = {}) {
  const payload = {
    sub: 'google_uid_123',
    email: 'google@broderie.ch',
    given_name: 'Élodie',
    family_name: 'Google',
    picture: 'https://avatar.url/pic.jpg',
    ...payloadOverride,
  };
  const ticket = { getPayload: () => payload };
  // On écrase la valeur exportée par le mock
  // jest.mock('../../config/google') retourne un objet vide — on y injecte verifyIdToken
  Object.assign(googleModule, { verifyIdToken: jest.fn().mockResolvedValue(ticket) });
  return payload;
}

describe('auth.service — loginWithGoogle()', () => {
  test('crée un nouvel utilisateur Google et retourne les tokens', async () => {
    setupGoogleClient();
    userRepository.findByGoogleId.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.create.mockResolvedValue(42);
    userRepository.findById.mockResolvedValue(makeUser({ id: 42, email: 'google@broderie.ch' }));
    jwt.sign.mockReturnValueOnce('access_g').mockReturnValueOnce('refresh_g');
    emailService.sendWelcome.mockResolvedValue();

    const result = await authService.loginWithGoogle('valid_id_token');

    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'google@broderie.ch',
      passwordHash: null,
    }));
    expect(result.accessToken).toBe('access_g');
    expect(result.refreshToken).toBe('refresh_g');
  });

  test('lie le compte Google si email déjà existant', async () => {
    setupGoogleClient();
    userRepository.findByGoogleId.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(makeUser({ id: 5, email: 'google@broderie.ch' }));
    userRepository.linkGoogleAccount.mockResolvedValue();
    userRepository.findById.mockResolvedValue(makeUser({ id: 5 }));
    jwt.sign.mockReturnValue('tok');

    await authService.loginWithGoogle('valid_id_token');

    expect(userRepository.linkGoogleAccount).toHaveBeenCalledWith(5, 'google_uid_123', expect.any(String));
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  test('retourne les tokens si google_id déjà connu', async () => {
    setupGoogleClient();
    userRepository.findByGoogleId.mockResolvedValue(makeUser({ id: 7 }));
    userRepository.linkGoogleAccount.mockResolvedValue();
    userRepository.findById.mockResolvedValue(makeUser({ id: 7 }));
    jwt.sign.mockReturnValue('tok_existing');

    const result = await authService.loginWithGoogle('valid_id_token');

    expect(result.accessToken).toBe('tok_existing');
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  test('lève 401 si token Google invalide', async () => {
    Object.assign(googleModule, {
      verifyIdToken: jest.fn().mockRejectedValue(new Error('Token expired')),
    });

    await expect(authService.loginWithGoogle('bad_token')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('lève 403 si compte Google existant désactivé', async () => {
    setupGoogleClient();
    userRepository.findByGoogleId.mockResolvedValue(makeUser({ id: 9, is_active: 0 }));

    await expect(authService.loginWithGoogle('valid_id_token')).rejects.toMatchObject({ statusCode: 403 });
  });

  test('lève 403 si compte email existant supprimé (soft delete)', async () => {
    setupGoogleClient();
    userRepository.findByGoogleId.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(makeUser({ deleted_at: new Date() }));

    await expect(authService.loginWithGoogle('valid_id_token')).rejects.toMatchObject({ statusCode: 403 });
  });
});
