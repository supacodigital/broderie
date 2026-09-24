// Tests unitaires customer.admin.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/customer.admin.repository');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query
    .mockResolvedValueOnce([[{ total: 1 }]])
    .mockResolvedValueOnce([[{ id: 667, email: 'claire@example.ch' }]]);
});

/* ADM-17 — le numéro imprimé sur la facture (« C000667 ») doit retrouver la
   cliente dans l'admin, quelle que soit la façon dont il est saisi. */
describe('customer.admin.repository — recherche par numéro de client', () => {
  test.each(['C000667', 'c667', '667', ' C000667 '])('« %s » cherche le compte n° 667', async (search) => {
    await repo.findAll({ search });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/OR u\.id = \?/);
    expect(params[params.length - 1]).toBe(667);
  });

  test('un nom ne déclenche pas de comparaison sur l\'identifiant', async () => {
    await repo.findAll({ search: 'Claire' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toMatch(/u\.id = \?/);
    expect(params).toEqual(['%Claire%', '%Claire%', '%Claire%']);
  });
});
