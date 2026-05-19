// Tests unitaires middleware errorHandler.js

const { errorHandler, AppError } = require('../../middlewares/errorHandler');

// Silence les console.error attendus du middleware
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => console.error.mockRestore());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── errorHandler() ────────────────────────────────────────────────────────────

describe('middleware — errorHandler()', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  test('retourne le statusCode et le message de l\'erreur (hors prod)', () => {
    process.env.NODE_ENV = 'test';
    const err = new AppError('Ressource introuvable.', 404);
    const res = makeRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Ressource introuvable.' });
  });

  test('utilise 500 si statusCode absent', () => {
    process.env.NODE_ENV = 'test';
    const err = new Error('Crash inattendu');
    const res = makeRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('inclut errors[] si présent dans AppError', () => {
    process.env.NODE_ENV = 'test';
    const err = new AppError('Données invalides.', 400, [{ field: 'email', message: 'Requis' }]);
    const res = makeRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errors: [{ field: 'email', message: 'Requis' }],
    }));
  });

  test('retourne message générique en production pour les 500', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Détail interne confidentiel');
    const res = makeRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Une erreur est survenue. Veuillez réessayer.',
    });
  });

  test('expose le message en production pour les erreurs non-500 (ex: 403)', () => {
    process.env.NODE_ENV = 'production';
    const err = new AppError('Accès non autorisé.', 403);
    const res = makeRes();
    errorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Accès non autorisé.' });
  });
});

// ── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  test('construit l\'erreur avec message et statusCode', () => {
    const err = new AppError('Non trouvé.', 404);
    expect(err.message).toBe('Non trouvé.');
    expect(err.statusCode).toBe(404);
    expect(err instanceof Error).toBe(true);
  });

  test('statusCode par défaut = 500', () => {
    const err = new AppError('Erreur serveur.');
    expect(err.statusCode).toBe(500);
  });

  test('stocke le tableau errors si fourni', () => {
    const err = new AppError('Invalide.', 400, [{ field: 'name' }]);
    expect(err.errors).toEqual([{ field: 'name' }]);
  });

  test('errors est undefined si non fourni', () => {
    const err = new AppError('Erreur.', 400);
    expect(err.errors).toBeUndefined();
  });
});
