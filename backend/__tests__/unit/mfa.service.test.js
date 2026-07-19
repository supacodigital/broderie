// Tests unitaires mfa.service — tous les repositories et utilitaires externes mockés

jest.mock('../../repositories/mfa.repository');
jest.mock('../../repositories/user.repository');
jest.mock('../../services/email.service');
jest.mock('../../utils/crypto.utils');
// Factory explicite (pas d'auto-mock) : le vrai totp.utils.js importe otplib, une lib
// avec des dépendances ESM pures (@scure/base) que Jest ne peut pas charger sans Babel
// (absent de ce projet) — l'auto-mock devrait charger le vrai module pour en dériver la
// forme, ce qui échouerait avant même que le mock ne prenne effet.
jest.mock('../../utils/totp.utils', () => ({
  generateTotpSecret: jest.fn(),
  generateOtpauthUri: jest.fn(),
  generateQrCodeDataUrl: jest.fn(),
  verifyTotpCode: jest.fn(),
}));
jest.mock('bcrypt');

const mfaRepository  = require('../../repositories/mfa.repository');
const userRepository = require('../../repositories/user.repository');
const emailService   = require('../../services/email.service');
const { encryptSecret, decryptSecret } = require('../../utils/crypto.utils');
const { generateTotpSecret, generateOtpauthUri, generateQrCodeDataUrl, verifyTotpCode } = require('../../utils/totp.utils');
const bcrypt = require('bcrypt');
const mfaService = require('../../services/mfa.service');

beforeEach(() => jest.clearAllMocks());

function makeUser(overrides = {}) {
  return { id: 5, email: 'admin@broderie.ch', first_name: 'Julie', last_name: 'Admin', role: 'admin', ...overrides };
}

function makeMfaRow(overrides = {}) {
  return {
    id: 1, user_id: 5,
    secret_encrypted: Buffer.from('cipher'), secret_iv: Buffer.from('iv'), secret_auth_tag: Buffer.from('tag'),
    enabled_at: new Date(), last_used_at: null, failed_attempts: 0, locked_until: null,
    ...overrides,
  };
}

// ── initSetup() ──────────────────────────────────────────────────────────────

describe('mfa.service — initSetup()', () => {
  test('génère un secret, le chiffre, l\'upsert, et retourne QR code + clé manuelle', async () => {
    userRepository.findById.mockResolvedValue(makeUser());
    generateTotpSecret.mockReturnValue('RAWSECRET234567');
    encryptSecret.mockReturnValue({ ciphertext: Buffer.from('c'), iv: Buffer.from('i'), authTag: Buffer.from('t') });
    mfaRepository.upsertPendingSecret.mockResolvedValue();
    generateOtpauthUri.mockReturnValue('otpauth://totp/test');
    generateQrCodeDataUrl.mockResolvedValue('data:image/png;base64,xyz');

    const result = await mfaService.initSetup(5);

    expect(mfaRepository.upsertPendingSecret).toHaveBeenCalledWith(5, expect.objectContaining({ ciphertext: expect.any(Buffer) }));
    expect(result.qrCodeDataUrl).toBe('data:image/png;base64,xyz');
    expect(result.manualEntryKey).toBe('RAWSECRET234567');
  });

  test('lève 404 si utilisateur introuvable', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(mfaService.initSetup(999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── confirmSetup() ───────────────────────────────────────────────────────────

describe('mfa.service — confirmSetup()', () => {
  test('code valide : active la MFA, génère 10 recovery codes, ne renvoie que le clair', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow({ enabled_at: null }));
    decryptSecret.mockReturnValue('RAWSECRET');
    verifyTotpCode.mockResolvedValue(true);
    mfaRepository.markEnabled.mockResolvedValue();
    mfaRepository.deleteRecoveryCodesByUserId.mockResolvedValue();
    bcrypt.hash.mockResolvedValue('$2b$12$hashedcode');
    mfaRepository.insertRecoveryCodes.mockResolvedValue();

    const result = await mfaService.confirmSetup(5, '123456');

    expect(mfaRepository.markEnabled).toHaveBeenCalledWith(5);
    expect(result.recoveryCodes).toHaveLength(10);
    expect(result.recoveryCodes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  test('code invalide : lève 400, n\'active pas la MFA, ne génère aucun recovery code', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow({ enabled_at: null }));
    decryptSecret.mockReturnValue('RAWSECRET');
    verifyTotpCode.mockResolvedValue(false);

    await expect(mfaService.confirmSetup(5, '000000')).rejects.toMatchObject({ statusCode: 400 });

    expect(mfaRepository.markEnabled).not.toHaveBeenCalled();
    expect(mfaRepository.insertRecoveryCodes).not.toHaveBeenCalled();
  });

  test('lève 400 si aucun setup en cours (pas de ligne user_mfa)', async () => {
    mfaRepository.findByUserId.mockResolvedValue(null);

    await expect(mfaService.confirmSetup(5, '123456')).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── verifyTotp() ─────────────────────────────────────────────────────────────

describe('mfa.service — verifyTotp()', () => {
  test('code valide sur compte activé : succès, met à jour last_used_at, réinitialise failed_attempts', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    decryptSecret.mockReturnValue('RAWSECRET');
    verifyTotpCode.mockResolvedValue(true);
    mfaRepository.recordSuccess.mockResolvedValue();

    await mfaService.verifyTotp(5, '123456');

    expect(mfaRepository.recordSuccess).toHaveBeenCalledWith(5);
    expect(mfaRepository.recordFailure).not.toHaveBeenCalled();
  });

  test('code invalide : lève 401, incrémente failed_attempts', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    decryptSecret.mockReturnValue('RAWSECRET');
    verifyTotpCode.mockResolvedValue(false);
    mfaRepository.recordFailure.mockResolvedValue();

    await expect(mfaService.verifyTotp(5, '000000')).rejects.toMatchObject({ statusCode: 401 });

    expect(mfaRepository.recordFailure).toHaveBeenCalledWith(5);
  });

  test('compte verrouillé (locked_until futur) : lève 401 immédiatement, otplib jamais appelé', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow({ locked_until: future }));

    await expect(mfaService.verifyTotp(5, '123456')).rejects.toMatchObject({ statusCode: 401 });

    expect(verifyTotpCode).not.toHaveBeenCalled();
    expect(mfaRepository.recordFailure).not.toHaveBeenCalled();
  });

  test('lève 401 si MFA non activée sur le compte', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow({ enabled_at: null }));

    await expect(mfaService.verifyTotp(5, '123456')).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── verifyRecoveryCode() ─────────────────────────────────────────────────────

describe('mfa.service — verifyRecoveryCode()', () => {
  test('code valide et non utilisé : marque le code used, succès', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    mfaRepository.findUnusedRecoveryCodes.mockResolvedValue([
      { id: 10, code_hash: 'hashA' },
      { id: 11, code_hash: 'hashB' },
    ]);
    bcrypt.compare.mockImplementation(async (raw, hash) => hash === 'hashB');
    mfaRepository.markRecoveryCodeUsed.mockResolvedValue();
    mfaRepository.recordSuccess.mockResolvedValue();
    mfaRepository.countUnusedRecoveryCodes.mockResolvedValue(1);

    await mfaService.verifyRecoveryCode(5, 'ABCD-EFGH');

    expect(mfaRepository.markRecoveryCodeUsed).toHaveBeenCalledWith(11);
    expect(mfaRepository.recordSuccess).toHaveBeenCalledWith(5);
  });

  test('code déjà utilisé (absent des codes non-utilisés) : lève 401 la seconde fois', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    mfaRepository.findUnusedRecoveryCodes.mockResolvedValue([]); // déjà consommé
    mfaRepository.recordFailure.mockResolvedValue();

    await expect(mfaService.verifyRecoveryCode(5, 'ABCD-EFGH')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('dernier code disponible utilisé : déclenche l\'email d\'alerte stock bas', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    mfaRepository.findUnusedRecoveryCodes.mockResolvedValue([{ id: 10, code_hash: 'hashA' }]);
    bcrypt.compare.mockResolvedValue(true);
    mfaRepository.markRecoveryCodeUsed.mockResolvedValue();
    mfaRepository.recordSuccess.mockResolvedValue();
    mfaRepository.countUnusedRecoveryCodes.mockResolvedValue(0);
    userRepository.findById.mockResolvedValue(makeUser());
    emailService.sendMfaRecoveryCodesLow.mockResolvedValue();

    await mfaService.verifyRecoveryCode(5, 'LAST-CODE');
    await new Promise((r) => setTimeout(r, 10)); // laisse le .catch() non bloquant s'exécuter

    expect(emailService.sendMfaRecoveryCodesLow).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });
});

// ── regenerateRecoveryCodes() ─────────────────────────────────────────────────

describe('mfa.service — regenerateRecoveryCodes()', () => {
  test('supprime les anciens codes, en crée 10 nouveaux, envoie un email de confirmation', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    mfaRepository.deleteRecoveryCodesByUserId.mockResolvedValue();
    bcrypt.hash.mockResolvedValue('$2b$12$hashed');
    mfaRepository.insertRecoveryCodes.mockResolvedValue();
    userRepository.findById.mockResolvedValue(makeUser());
    emailService.sendMfaRecoveryCodesRegenerated.mockResolvedValue();

    const result = await mfaService.regenerateRecoveryCodes(5);
    await new Promise((r) => setTimeout(r, 10));

    expect(mfaRepository.deleteRecoveryCodesByUserId).toHaveBeenCalledWith(5);
    expect(result.recoveryCodes).toHaveLength(10);
    expect(emailService.sendMfaRecoveryCodesRegenerated).toHaveBeenCalled();
  });

  test('lève 400 si MFA non activée sur le compte', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow({ enabled_at: null }));

    await expect(mfaService.regenerateRecoveryCodes(5)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── getStatus() ────────────────────────────────────────────────────────────────

describe('mfa.service — getStatus()', () => {
  test('retourne enabled: true et le nombre de codes restants si MFA activée', async () => {
    mfaRepository.findByUserId.mockResolvedValue(makeMfaRow());
    mfaRepository.countUnusedRecoveryCodes.mockResolvedValue(4);

    const status = await mfaService.getStatus(5);

    expect(status).toEqual({ enabled: true, recoveryCodesRemaining: 4 });
  });

  test('retourne enabled: false si aucune ligne user_mfa', async () => {
    mfaRepository.findByUserId.mockResolvedValue(null);

    const status = await mfaService.getStatus(5);

    expect(status).toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });
});
