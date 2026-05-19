// Tests unitaires middleware auth.js

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  jwtAccessSecret: 'test-secret',
}));

const jwt = require('jsonwebtoken');
const { requireAuth } = require('../../middlewares/auth');

beforeEach(() => jest.clearAllMocks());

function makeReq(authHeader) {
  return { headers: authHeader !== undefined ? { authorization: authHeader } : {} };
}

function makeNext() { return jest.fn(); }

describe('middleware — requireAuth()', () => {
  test('appelle next() avec req.user si token valide', () => {
    jwt.verify.mockReturnValue({ id: 1, role: 'client', locale: 'fr' });

    const req  = makeReq('Bearer valid.token.here');
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 1, role: 'client', locale: 'fr' });
    expect(jwt.verify).toHaveBeenCalledWith('valid.token.here', 'test-secret');
  });

  test('retourne 401 si header Authorization absent', () => {
    const req  = makeReq(undefined);
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  test('retourne 401 si header ne commence pas par "Bearer "', () => {
    const req  = makeReq('Basic abc123');
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('retourne 401 si token JWT invalide (verify lance une erreur)', () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });

    const req  = makeReq('Bearer bad.token');
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.user).toBeUndefined();
  });

  test('retourne 401 si token expiré', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    jwt.verify.mockImplementation(() => { throw err; });

    const req  = makeReq('Bearer expired.token');
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('extrait correctement le rôle admin depuis le payload', () => {
    jwt.verify.mockReturnValue({ id: 42, role: 'admin', locale: 'de' });

    const req  = makeReq('Bearer admin.token');
    const next = makeNext();
    requireAuth(req, {}, next);

    expect(req.user).toEqual({ id: 42, role: 'admin', locale: 'de' });
    expect(next).toHaveBeenCalledWith();
  });
});
