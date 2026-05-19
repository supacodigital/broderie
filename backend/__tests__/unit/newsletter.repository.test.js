// Tests unitaires newsletter.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/newsletter.repository');

beforeEach(() => jest.clearAllMocks());

// ── subscribe() ───────────────────────────────────────────────────────────────

describe('newsletter.repository — subscribe()', () => {
  test('crée un nouvel abonné', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])               // SELECT — inconnu
      .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

    const result = await repo.subscribe('new@broderie.ch', 'fr');
    expect(result).toEqual({ created: true });
    expect(pool.execute).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO newsletter_subscribers'),
      ['new@broderie.ch', 'fr']
    );
  });

  test('retourne alreadySubscribed si email déjà actif', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, is_active: 1 }]]);
    const result = await repo.subscribe('existing@broderie.ch', 'fr');
    expect(result).toEqual({ alreadySubscribed: true });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('réactive un abonné inactif', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 2, is_active: 0 }]]) // SELECT — inactif
      .mockResolvedValueOnce([{}]);                        // UPDATE

    const result = await repo.subscribe('reactivate@broderie.ch', 'de');
    expect(result).toEqual({ reactivated: true });
    expect(pool.execute).toHaveBeenNthCalledWith(2,
      expect.stringContaining('SET is_active = 1'),
      ['de', 'reactivate@broderie.ch']
    );
  });
});

// ── unsubscribe() ─────────────────────────────────────────────────────────────

describe('newsletter.repository — unsubscribe()', () => {
  test('retourne true si désabonné avec succès', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.unsubscribe('julie@broderie.ch')).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_active = 0'),
      ['julie@broderie.ch']
    );
  });

  test('retourne false si email introuvable ou déjà inactif', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.unsubscribe('inconnu@broderie.ch')).toBe(false);
  });
});

// ── findAll() ─────────────────────────────────────────────────────────────────

describe('newsletter.repository — findAll()', () => {
  test('retourne la liste paginée sans filtre actif', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]])   // SELECT rows
      .mockResolvedValueOnce([[{ total: 2 }]]);           // COUNT

    const result = await repo.findAll({ page: 1, limit: 20, search: '' });
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  test('filtre par is_active=1', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);

    await repo.findAll({ page: 1, limit: 20, search: '', active: '1' });
    // Vérifie que le filtre is_active est passé au premier execute
    const firstCallParams = pool.execute.mock.calls[0][1];
    expect(firstCallParams).toContain(1);
  });

  test('filtre par is_active=0 (inactifs)', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);

    await repo.findAll({ page: 1, limit: 20, search: '', active: '0' });
    const firstCallParams = pool.execute.mock.calls[0][1];
    expect(firstCallParams).toContain(0);
  });

  test('filtre par search email', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([[{ total: 1 }]]);

    await repo.findAll({ page: 1, limit: 20, search: 'julie' });
    const firstCallParams = pool.execute.mock.calls[0][1];
    expect(firstCallParams).toContain('%julie%');
  });
});

// ── unsubscribeById() ────────────────────────────────────────────────────────

describe('newsletter.repository — unsubscribeById()', () => {
  test('retourne true si désabonné par id', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.unsubscribeById(5)).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_active = 0'), [5]
    );
  });

  test('retourne false si id inexistant', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.unsubscribeById(999)).toBe(false);
  });
});
