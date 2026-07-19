// Tests unitaires crypto.utils.js — chiffrement AES-256-GCM du secret TOTP.
// Pièce la plus sensible du plan MFA : toute la chaîne de confiance du stockage en dépend.

jest.mock('../../config/env', () => ({
  mfaEncryptionKey: 'a'.repeat(64),
}));

const { encryptSecret, decryptSecret } = require('../../utils/crypto.utils');

describe('crypto.utils — encryptSecret() / decryptSecret()', () => {
  test('round-trip : déchiffrer un secret chiffré retourne la valeur d\'origine exacte', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test('deux chiffrements du même texte produisent des iv différents (jamais de réutilisation de nonce)', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const first  = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);

    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  test('altérer un byte du ciphertext avant déchiffrement lève une erreur (intégrité GCM)', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
    tampered.ciphertext[0] ^= 0xff;

    expect(() => decryptSecret(tampered)).toThrow();
  });

  test('altérer un byte du authTag avant déchiffrement lève une erreur (intégrité GCM)', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const tampered = { ...encrypted, authTag: Buffer.from(encrypted.authTag) };
    tampered.authTag[0] ^= 0xff;

    expect(() => decryptSecret(tampered)).toThrow();
  });

  test('retourne des buffers de la longueur attendue (iv=12, authTag=16)', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');

    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
  });
});

describe('crypto.utils — clé de mauvaise longueur', () => {
  test('lève une erreur explicite si MFA_ENCRYPTION_KEY ne fait pas 32 bytes', () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({ mfaEncryptionKey: 'trop_court' }));
    const { encryptSecret: encryptWithBadKey } = require('../../utils/crypto.utils');

    expect(() => encryptWithBadKey('test')).toThrow(/32 bytes/);
  });
});
