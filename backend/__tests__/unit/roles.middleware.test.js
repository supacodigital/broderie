// Tests unitaires middleware roles.js

const { requireRole } = require('../../middlewares/roles');

function makeNext() { return jest.fn(); }

describe('middleware — requireRole()', () => {
  test('appelle next() si le rôle est autorisé', () => {
    const middleware = requireRole('admin', 'super_admin');
    const req  = { user: { id: 1, role: 'admin' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('autorise super_admin quand admin est listé', () => {
    const middleware = requireRole('admin', 'super_admin');
    const req  = { user: { id: 2, role: 'super_admin' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('retourne 403 si le rôle n\'est pas dans la liste', () => {
    const middleware = requireRole('admin');
    const req  = { user: { id: 3, role: 'client' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('retourne 401 si req.user est absent', () => {
    const middleware = requireRole('admin');
    const req  = {};
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test('retourne 403 si rôle inconnu', () => {
    const middleware = requireRole('admin', 'super_admin');
    const req  = { user: { id: 5, role: 'hacker' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('fonctionne avec un seul rôle autorisé', () => {
    const middleware = requireRole('super_admin');
    const req  = { user: { id: 1, role: 'super_admin' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
