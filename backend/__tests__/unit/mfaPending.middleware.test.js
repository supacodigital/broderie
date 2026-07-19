// Tests unitaires middleware mfaPending.js — le plus critique de toute la fonctionnalité MFA :
// garantit qu'un token "MFA en attente" ne peut jamais servir de vrai access token et
// vice-versa (voir aussi le test d'intégration HTTP équivalent dans mfa.test.js).

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  jwtMfaPendingSecret: 'mfa-pending-secret',
  jwtAccessSecret: 'access-secret',
}));

const jwt = require('jsonwebtoken');
const { requireMfaPending } = require('../../middlewares/mfaPending');

beforeEach(() => jest.clearAllMocks());

function makeReq(authHeader) {
  return { headers: authHeader !== undefined ? { authorization: authHeader } : {} };
}

function makeNext() { return jest.fn(); }

describe('middleware — requireMfaPending()', () => {
  test('appelle next() et pose req.mfaPendingUserId si token MFA pending valide', () => {
    jwt.verify.mockReturnValue({ id: 1, purpose: 'mfa_pending' });

    const req  = makeReq('Bearer valid.mfa.token');
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mfaPendingUserId).toBe(1);
    expect(jwt.verify).toHaveBeenCalledWith('valid.mfa.token', 'mfa-pending-secret');
  });

  // Test anti-bypass critique : un vrai access token (signé avec un autre secret)
  // doit être rejeté — jwt.verify lève une erreur de signature.
  test('rejette 401 si le token a été signé avec un autre secret (vrai access token)', () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });

    const req  = makeReq('Bearer real.access.token');
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.mfaPendingUserId).toBeUndefined();
  });

  test('rejette 401 si le claim purpose est absent ou différent de mfa_pending', () => {
    jwt.verify.mockReturnValue({ id: 1, purpose: 'something_else' });

    const req  = makeReq('Bearer token.without.correct.purpose');
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.mfaPendingUserId).toBeUndefined();
  });

  test('rejette 401 si header Authorization absent', () => {
    const req  = makeReq(undefined);
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  test('rejette 401 si header ne commence pas par "Bearer "', () => {
    const req  = makeReq('Basic abc123');
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('rejette 401 si token expiré', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    jwt.verify.mockImplementation(() => { throw err; });

    const req  = makeReq('Bearer expired.mfa.token');
    const next = makeNext();
    requireMfaPending(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
