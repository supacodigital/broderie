// Tests unitaires middleware roles.js

const { requireRole, isAdminRole } = require('../../middlewares/roles');

function makeNext() { return jest.fn(); }

describe('middleware — requireRole()', () => {
  test('appelle next() si le rôle est autorisé', () => {
    const middleware = requireRole('admin');
    const req  = { user: { id: 1, role: 'admin' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('autorise un rôle listé parmi plusieurs', () => {
    const middleware = requireRole('admin', 'client');
    const req  = { user: { id: 2, role: 'client' } };
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
    const middleware = requireRole('admin');
    const req  = { user: { id: 5, role: 'hacker' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('fonctionne avec un seul rôle autorisé', () => {
    const middleware = requireRole('admin');
    const req  = { user: { id: 1, role: 'admin' } };
    const next = makeNext();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});

/* ADM-08, revu le 26.09 — le super-administrateur ne gère que le contenu du
   site : il n'hérite plus des droits d'un administrateur, et l'inverse non plus. */
describe('middleware — rôle super_admin', () => {
  test('est refusé sur une route réservée aux administrateurs', () => {
    const next = makeNext();
    requireRole('admin')({ user: { id: 1, role: 'super_admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('passe sur une route super-administrateur', () => {
    const next = makeNext();
    requireRole('super_admin')({ user: { id: 1, role: 'super_admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('une route ouverte aux deux rôles laisse passer les deux', () => {
    for (const role of ['admin', 'super_admin']) {
      const next = makeNext();
      requireRole('admin', 'super_admin')({ user: { id: 1, role } }, {}, next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  test('un administrateur simple est refusé sur une route super-administrateur', () => {
    const next = makeNext();
    requireRole('super_admin')({ user: { id: 1, role: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('un client reste refusé partout', () => {
    const next = makeNext();
    requireRole('admin')({ user: { id: 1, role: 'client' } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('isAdminRole reconnaît les deux rôles du back-office', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('client')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
