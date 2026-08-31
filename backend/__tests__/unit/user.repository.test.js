// Tests unitaires user.repository — pool mocké, aucune BDD requise

jest.mock('../../config/db', () => ({
  pool: {
    execute:       jest.fn(),
    getConnection: jest.fn(),
  },
}));

const { pool }        = require('../../config/db');
const userRepository  = require('../../repositories/user.repository');

beforeEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConnection(overrides = {}) {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute:          jest.fn().mockResolvedValue([[{ is_default: 0 }], []]),
    commit:           jest.fn().mockResolvedValue(),
    rollback:         jest.fn().mockResolvedValue(),
    release:          jest.fn(),
    ...overrides,
  };
}

const fakeUser = {
  id: 1, email: 'julie@broderie.ch',
  first_name: 'Julie', last_name: 'Test',
  role: 'client', locale: 'fr', is_active: 1,
};

// ── findByEmail() ─────────────────────────────────────────────────────────────

describe('user.repository — findByEmail()', () => {
  test('retourne l\'utilisateur trouvé', async () => {
    pool.execute.mockResolvedValue([[fakeUser]]);
    const result = await userRepository.findByEmail('julie@broderie.ch');
    expect(result).toEqual(fakeUser);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE email = ?'), ['julie@broderie.ch']);
  });

  test('retourne null si aucun résultat', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await userRepository.findByEmail('inconnu@broderie.ch');
    expect(result).toBeNull();
  });
});

// ── findById() ────────────────────────────────────────────────────────────────

describe('user.repository — findById()', () => {
  test('retourne l\'utilisateur par id', async () => {
    pool.execute.mockResolvedValue([[fakeUser]]);
    const result = await userRepository.findById(1);
    expect(result).toEqual(fakeUser);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id = ?'), [1]);
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await userRepository.findById(99);
    expect(result).toBeNull();
  });
});

// ── emailExists() ─────────────────────────────────────────────────────────────

describe('user.repository — emailExists()', () => {
  test('retourne true si email existe', async () => {
    pool.execute.mockResolvedValue([[{ id: 1 }]]);
    expect(await userRepository.emailExists('julie@broderie.ch')).toBe(true);
  });

  test('retourne false si email absent', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await userRepository.emailExists('nouveau@broderie.ch')).toBe(false);
  });
});

// ── create() ─────────────────────────────────────────────────────────────────

describe('user.repository — create()', () => {
  test('insère l\'utilisateur et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 42 }]);
    const id = await userRepository.create({
      email: 'new@broderie.ch', passwordHash: '$2b$12$hash',
      firstName: 'A', lastName: 'B', locale: 'fr',
    });
    expect(id).toBe(42);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['new@broderie.ch', '$2b$12$hash'])
    );
  });

  test('crée un compte Google (passwordHash null)', async () => {
    pool.execute.mockResolvedValue([{ insertId: 7 }]);
    const id = await userRepository.create({
      email: 'google@broderie.ch', passwordHash: null,
      firstName: 'G', lastName: 'User', locale: 'fr',
      googleId: 'gid_123', avatarUrl: 'https://avatar.url',
    });
    expect(id).toBe(7);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([null, 'gid_123'])
    );
  });
});

// ── update() ─────────────────────────────────────────────────────────────────

describe('user.repository — update()', () => {
  test('met à jour le profil et retourne l\'utilisateur', async () => {
    pool.execute
      .mockResolvedValueOnce([{}])              // UPDATE
      .mockResolvedValueOnce([[fakeUser]]);      // findById
    const result = await userRepository.update(1, { firstName: 'Julie', lastName: 'Test', locale: 'fr' });
    expect(result).toEqual(fakeUser);
    expect(pool.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('UPDATE users SET'),
      ['Julie', 'Test', 'fr', 1]
    );
  });
});

// ── saveResetToken() ──────────────────────────────────────────────────────────

describe('user.repository — saveResetToken()', () => {
  test('enregistre le token hashé et l\'expiration', async () => {
    pool.execute.mockResolvedValue([{}]);
    const expires = new Date(Date.now() + 3600000);
    await userRepository.saveResetToken(1, 'sha256hash', expires);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('reset_token_hash'),
      ['sha256hash', expires, 1]
    );
  });
});

// ── findByResetToken() ────────────────────────────────────────────────────────

describe('user.repository — findByResetToken()', () => {
  test('retourne l\'utilisateur si token valide', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, email: 'julie@broderie.ch' }]]);
    const result = await userRepository.findByResetToken('sha256hash');
    expect(result.email).toBe('julie@broderie.ch');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('reset_token_expires > NOW()'),
      ['sha256hash']
    );
  });

  test('retourne null si token expiré/invalide', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await userRepository.findByResetToken('badtoken');
    expect(result).toBeNull();
  });
});

// ── updatePassword() ──────────────────────────────────────────────────────────

describe('user.repository — updatePassword()', () => {
  test('met à jour le hash, invalide le token et incrémente token_version', async () => {
    pool.execute.mockResolvedValue([{}]);
    await userRepository.updatePassword(1, '$2b$12$newhash');
    const sql = pool.execute.mock.calls[0][0];
    expect(sql).toMatch(/reset_token_hash = NULL/);
    expect(sql).toMatch(/token_version = token_version \+ 1/);
    expect(pool.execute.mock.calls[0][1]).toEqual(['$2b$12$newhash', 1]);
  });
});

// ── findByGoogleId() ──────────────────────────────────────────────────────────

describe('user.repository — findByGoogleId()', () => {
  test('retourne l\'utilisateur par google_id', async () => {
    pool.execute.mockResolvedValue([[fakeUser]]);
    const result = await userRepository.findByGoogleId('gid_123');
    expect(result).toEqual(fakeUser);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE google_id = ?'), ['gid_123']
    );
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await userRepository.findByGoogleId('inexistant');
    expect(result).toBeNull();
  });
});

// ── linkGoogleAccount() ───────────────────────────────────────────────────────

describe('user.repository — linkGoogleAccount()', () => {
  test('met à jour google_id et avatar_url', async () => {
    pool.execute.mockResolvedValue([{}]);
    await userRepository.linkGoogleAccount(1, 'gid_abc', 'https://pic.url');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET google_id = ?'),
      ['gid_abc', 'https://pic.url', 1]
    );
  });
});

// ── findAddresses() ───────────────────────────────────────────────────────────

describe('user.repository — findAddresses()', () => {
  test('retourne la liste des adresses de l\'utilisateur', async () => {
    const fakeAddrs = [{ id: 1, label: 'Domicile', is_default: 1 }];
    pool.execute.mockResolvedValue([fakeAddrs]);
    const result = await userRepository.findAddresses(1);
    expect(result).toEqual(fakeAddrs);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM addresses'), [1]
    );
  });
});

// ── createAddress() ───────────────────────────────────────────────────────────

describe('user.repository — createAddress()', () => {
  test('insère l\'adresse et retourne l\'id sans is_default', async () => {
    pool.execute.mockResolvedValue([{ insertId: 5 }]);
    const id = await userRepository.createAddress(1, {
      label: 'Travail', street: 'Rue de Lausanne 1',
      city: 'Lausanne', zip: '1000', isDefault: false,
    });
    expect(id).toBe(5);
  });

  test('retire le défaut des autres adresses si isDefault=true', async () => {
    pool.execute
      .mockResolvedValueOnce([{}])               // UPDATE is_default = 0
      .mockResolvedValueOnce([{ insertId: 6 }]); // INSERT
    const id = await userRepository.createAddress(1, {
      label: 'Domicile', street: 'Rue 2', city: 'Genève',
      zip: '1200', isDefault: true,
    });
    expect(id).toBe(6);
    expect(pool.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('SET is_default = 0'), [1]
    );
  });
});

// ── updateAddress() ───────────────────────────────────────────────────────────

describe('user.repository — updateAddress()', () => {
  test('met à jour l\'adresse sans promouvoir le défaut', async () => {
    pool.execute.mockResolvedValue([{}]);
    await userRepository.updateAddress(3, 1, {
      label: 'Bureau', street: 'Ave. A', city: 'Berne',
      zip: '3000', isDefault: false,
    });
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE addresses SET label'),
      expect.arrayContaining(['Bureau', 'Berne', 3, 1])
    );
  });

  test('retire le défaut des autres si isDefault=true', async () => {
    pool.execute.mockResolvedValue([{}]);
    await userRepository.updateAddress(3, 1, {
      label: 'Principal', street: 'Rue B', city: 'Zurich',
      zip: '8000', isDefault: true,
    });
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });
});

// ── deleteAddress() ───────────────────────────────────────────────────────────

describe('user.repository — deleteAddress()', () => {
  test('supprime l\'adresse et retourne true', async () => {
    const conn = makeConnection({
      execute: jest.fn()
        .mockResolvedValueOnce([[{ is_default: 0 }]])        // SELECT is_default
        .mockResolvedValueOnce([{ affectedRows: 1 }, []])    // DELETE — format mysql2 réel
    });
    pool.getConnection.mockResolvedValue(conn);

    const result = await userRepository.deleteAddress(1, 1);
    expect(result).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('retourne false si adresse introuvable', async () => {
    const conn = makeConnection({
      execute: jest.fn().mockResolvedValueOnce([[]])  // SELECT retourne vide
    });
    pool.getConnection.mockResolvedValue(conn);

    const result = await userRepository.deleteAddress(99, 1);
    expect(result).toBe(false);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('promeut une autre adresse si la supprimée était la défaut', async () => {
    const conn = makeConnection({
      execute: jest.fn()
        .mockResolvedValueOnce([[{ is_default: 1 }]])      // SELECT — was default
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // DELETE — format mysql2 réel
        .mockResolvedValueOnce([[]])                       // UPDATE SET is_default=1
    });
    pool.getConnection.mockResolvedValue(conn);

    await userRepository.deleteAddress(2, 1);
    expect(conn.execute).toHaveBeenCalledTimes(3);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rollback si erreur SQL', async () => {
    const conn = makeConnection({
      execute: jest.fn()
        .mockResolvedValueOnce([[{ is_default: 0 }]])
        .mockRejectedValueOnce(new Error('SQL error'))
    });
    pool.getConnection.mockResolvedValue(conn);

    await expect(userRepository.deleteAddress(1, 1)).rejects.toThrow('SQL error');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── findByIdWithPassword() ────────────────────────────────────────────────────

describe('user.repository — findByIdWithPassword()', () => {
  test('retourne l\'utilisateur avec son hash', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, email: 'j@b.ch', password_hash: '$2b$12$h' }]]);
    const result = await userRepository.findByIdWithPassword(1);
    expect(result.password_hash).toBe('$2b$12$h');
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await userRepository.findByIdWithPassword(99)).toBeNull();
  });
});

// ── findByIdRaw() ─────────────────────────────────────────────────────────────

describe('user.repository — findByIdRaw()', () => {
  test('retourne le profil complet, filtre deleted_at', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, email: 'j@b.ch', google_id: null, created_at: 'x' }]]);
    const r = await userRepository.findByIdRaw(1);
    expect(r.email).toBe('j@b.ch');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'), [1]
    );
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await userRepository.findByIdRaw(99)).toBeNull();
  });
});

// ── anonymizeUser() ──────────────────────────────────────────────────────────

describe('user.repository — anonymizeUser()', () => {
  test('anonymise, commit et release ; email de la forme deleted+{id}+{ts}@anonymized.local', async () => {
    const conn = makeConnection();
    conn.execute.mockImplementation((sql) => {
      if (/SELECT id, email, deleted_at FROM users/.test(sql)) {
        return Promise.resolve([[{ id: 1, email: 'julie@b.ch', deleted_at: null }]]);
      }
      if (/SELECT DISTINCT product_id FROM reviews/.test(sql)) {
        return Promise.resolve([[{ product_id: 3 }]]); // un produit noté
      }
      return Promise.resolve([{ affectedRows: 1 }]);
    });
    pool.getConnection.mockResolvedValue(conn);

    const res = await userRepository.anonymizeUser(1);

    expect(res).toEqual({ anonymized: true, email: 'julie@b.ch' });
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();

    const calls = conn.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((sql) => /UPDATE users SET/.test(sql))).toBe(true);
    expect(calls.some((sql) => /UPDATE orders SET/.test(sql))).toBe(true);
    expect(calls.some((sql) => /DELETE FROM addresses/.test(sql))).toBe(true);
    expect(calls.some((sql) => /DELETE FROM loyalty_accounts/.test(sql))).toBe(true);
    expect(calls.some((sql) => /consent_logs\s+SET user_id = NULL/.test(sql))).toBe(true);

    const usersUpdate = conn.execute.mock.calls.find((c) => /UPDATE users SET/.test(c[0]));
    expect(usersUpdate[1][0]).toMatch(/^deleted\+1\+\d+@anonymized\.local$/);
  });

  test('rollback + { alreadyDeleted } si le compte est déjà supprimé', async () => {
    const conn = makeConnection();
    conn.execute.mockResolvedValueOnce([[{ id: 1, email: 'x@b.ch', deleted_at: new Date() }]]);
    pool.getConnection.mockResolvedValue(conn);

    const res = await userRepository.anonymizeUser(1);
    expect(res).toEqual({ alreadyDeleted: true });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('rollback + { notFound } si le compte n\'existe pas', async () => {
    const conn = makeConnection();
    conn.execute.mockResolvedValueOnce([[]]);
    pool.getConnection.mockResolvedValue(conn);

    const res = await userRepository.anonymizeUser(999);
    expect(res).toEqual({ notFound: true });
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('rollback + rethrow si une requête échoue', async () => {
    const conn = makeConnection();
    conn.execute
      .mockResolvedValueOnce([[{ id: 1, email: 'x@b.ch', deleted_at: null }]])
      .mockRejectedValueOnce(new Error('SQL down'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(userRepository.anonymizeUser(1)).rejects.toThrow('SQL down');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});
