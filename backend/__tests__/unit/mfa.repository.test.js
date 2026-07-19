// Tests unitaires mfa.repository — pool mocké, aucune BDD requise

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool }        = require('../../config/db');
const mfaRepository   = require('../../repositories/mfa.repository');

beforeEach(() => jest.clearAllMocks());

// ── findByUserId() ───────────────────────────────────────────────────────────

describe('mfa.repository — findByUserId()', () => {
  test('retourne la ligne MFA trouvée', async () => {
    const row = { id: 1, user_id: 5, enabled_at: null, failed_attempts: 0, locked_until: null };
    pool.execute.mockResolvedValue([[row]]);

    const result = await mfaRepository.findByUserId(5);

    expect(result).toEqual(row);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), [5]);
  });

  test('retourne null si aucune ligne', async () => {
    pool.execute.mockResolvedValue([[]]);

    const result = await mfaRepository.findByUserId(999);

    expect(result).toBeNull();
  });
});

// ── upsertPendingSecret() ────────────────────────────────────────────────────

describe('mfa.repository — upsertPendingSecret()', () => {
  test('insère avec ON DUPLICATE KEY UPDATE et les 3 parties du secret chiffré', async () => {
    pool.execute.mockResolvedValue([{}]);
    const ciphertext = Buffer.from('cipher');
    const iv = Buffer.from('iv123456789a');
    const authTag = Buffer.from('tag1234567890ab');

    await mfaRepository.upsertPendingSecret(5, { ciphertext, iv, authTag });

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('ON DUPLICATE KEY UPDATE'),
      [5, ciphertext, iv, authTag]
    );
  });
});

// ── markEnabled() / recordSuccess() / recordFailure() ───────────────────────

describe('mfa.repository — markEnabled()', () => {
  test('met à jour enabled_at pour le user donné', async () => {
    pool.execute.mockResolvedValue([{}]);

    await mfaRepository.markEnabled(5);

    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SET enabled_at = NOW()'), [5]);
  });
});

describe('mfa.repository — recordSuccess()', () => {
  test('réinitialise failed_attempts et locked_until', async () => {
    pool.execute.mockResolvedValue([{}]);

    await mfaRepository.recordSuccess(5);

    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('failed_attempts = 0'), [5]);
  });
});

describe('mfa.repository — recordFailure()', () => {
  test('incrémente failed_attempts et pose un verrou conditionnel', async () => {
    pool.execute.mockResolvedValue([{}]);

    await mfaRepository.recordFailure(5);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('failed_attempts = failed_attempts + 1'),
      [5]
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INTERVAL 15 MINUTE'),
      [5]
    );
  });
});

// ── insertRecoveryCodes() ────────────────────────────────────────────────────

describe('mfa.repository — insertRecoveryCodes()', () => {
  test('insère un batch de codes hachés en une seule requête', async () => {
    pool.execute.mockResolvedValue([{}]);
    const hashes = ['hash1', 'hash2', 'hash3'];

    await mfaRepository.insertRecoveryCodes(5, hashes);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [query, values] = pool.execute.mock.calls[0];
    expect(query).toContain('INSERT INTO user_mfa_recovery_codes');
    expect(values).toEqual([5, 'hash1', 5, 'hash2', 5, 'hash3']);
  });

  test('ne fait rien si la liste de codes est vide', async () => {
    await mfaRepository.insertRecoveryCodes(5, []);

    expect(pool.execute).not.toHaveBeenCalled();
  });
});

// ── findUnusedRecoveryCodes() / markRecoveryCodeUsed() ───────────────────────

describe('mfa.repository — findUnusedRecoveryCodes()', () => {
  test('retourne uniquement les codes non utilisés (filtre used_at IS NULL en SQL)', async () => {
    const rows = [{ id: 1, code_hash: 'h1' }, { id: 2, code_hash: 'h2' }];
    pool.execute.mockResolvedValue([rows]);

    const result = await mfaRepository.findUnusedRecoveryCodes(5);

    expect(result).toEqual(rows);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('used_at IS NULL'), [5]);
  });
});

describe('mfa.repository — markRecoveryCodeUsed()', () => {
  test('marque le code précis comme utilisé via son id', async () => {
    pool.execute.mockResolvedValue([{}]);

    await mfaRepository.markRecoveryCodeUsed(42);

    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SET used_at = NOW()'), [42]);
  });
});

// ── countUnusedRecoveryCodes() ───────────────────────────────────────────────

describe('mfa.repository — countUnusedRecoveryCodes()', () => {
  test('retourne le compteur de codes non utilisés', async () => {
    pool.execute.mockResolvedValue([[{ count: 7 }]]);

    const count = await mfaRepository.countUnusedRecoveryCodes(5);

    expect(count).toBe(7);
  });
});

// ── deleteRecoveryCodesByUserId() ────────────────────────────────────────────

describe('mfa.repository — deleteRecoveryCodesByUserId()', () => {
  test('supprime tous les codes du user donné', async () => {
    pool.execute.mockResolvedValue([{}]);

    await mfaRepository.deleteRecoveryCodesByUserId(5);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_mfa_recovery_codes'),
      [5]
    );
  });
});
