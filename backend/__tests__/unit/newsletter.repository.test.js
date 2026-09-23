// Tests unitaires newsletter.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/newsletter.repository');

beforeEach(() => jest.clearAllMocks());

// ── Double opt-in (CLI-05) ────────────────────────────────────────────────────

describe('newsletter.repository — requestSubscription() (formulaire du site)', () => {
  test('une nouvelle adresse est enregistrée INACTIVE, origine « formulaire »', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])               // SELECT — inconnue
      .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT

    const result = await repo.requestSubscription('new@broderie.ch', 'fr');
    expect(result).toEqual({ sendConfirmation: true });
    const [sql, params] = pool.execute.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO newsletter_subscribers \(email, locale, source, is_active\) VALUES \(\?, \?, 'form', 0\)/);
    expect(params).toEqual(['new@broderie.ch', 'fr']);
  });

  test('une adresse déjà abonnée ne reçoit pas de nouvel e-mail', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, is_active: 1, recently_requested: 0 }]]);
    expect(await repo.requestSubscription('existing@broderie.ch')).toEqual({ sendConfirmation: false });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('une demande répétée dans les 10 minutes ne renvoie pas d\'e-mail (anti-inondation)', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 2, is_active: 0, recently_requested: 1 }]]);
    expect(await repo.requestSubscription('flood@broderie.ch')).toEqual({ sendConfirmation: false });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('une ancienne demande non confirmée est renouvelée, toujours inactive', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 3, is_active: 0, recently_requested: 0 }]])
      .mockResolvedValueOnce([{}]);

    expect(await repo.requestSubscription('retry@broderie.ch')).toEqual({ sendConfirmation: true });
    const [sql] = pool.execute.mock.calls[1];
    expect(sql).toContain("source = 'form'");
    expect(sql).not.toContain('is_active = 1');
  });
});

describe('newsletter.repository — confirmSubscription()', () => {
  test('active l\'inscription et date le consentement', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await repo.confirmSubscription('a@broderie.ch')).toEqual({ confirmed: true });
    expect(pool.execute.mock.calls[0][0]).toMatch(/is_active = 1, confirmed_at = NOW\(\)/);
  });

  test('distingue une inscription déjà confirmée d\'une demande disparue', async () => {
    pool.execute
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ is_active: 1 }]]);
    expect(await repo.confirmSubscription('a@broderie.ch')).toEqual({ alreadyActive: true });

    pool.execute
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[]]);
    expect(await repo.confirmSubscription('b@broderie.ch')).toEqual({ notFound: true });
  });
});

describe('newsletter.repository — inscription depuis le compte client', () => {
  test('la pré-inscription est marquée « compte client »', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 4 }]);
    await repo.subscribePending('client@broderie.ch', 'fr');
    expect(pool.execute.mock.calls[1][0]).toContain("'account', 0");
  });

  test('la vérification de l\'adresse date le consentement sans écraser la date de demande', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await repo.confirmPending('client@broderie.ch');
    const [sql] = pool.execute.mock.calls[0];
    expect(sql).toContain('confirmed_at = NOW()');
    expect(sql).not.toContain('subscribed_at = NOW()');
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
