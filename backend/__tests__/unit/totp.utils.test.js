// Tests unitaires totp.utils.js — wrapper otplib/qrcode.
// otplib dépend transitivement de paquets ESM purs (@scure/base) que Jest ne peut pas
// charger sans Babel (absent de ce projet) — otplib et qrcode sont donc mockés ici,
// comme bcrypt/jsonwebtoken le sont déjà ailleurs (voir auth.service.test.js). Le
// round-trip réel (secret → URI → code → vérification) a été validé manuellement en
// dehors de Jest lors du développement de totp.utils.js.

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generate: jest.fn(),
  verify: jest.fn(),
  generateURI: jest.fn(),
}));
jest.mock('@otplib/plugin-crypto-node', () => ({ crypto: {} }));
jest.mock('@otplib/plugin-base32-scure', () => ({ base32: {} }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

const { generateSecret, verify, generateURI } = require('otplib');
const QRCode = require('qrcode');

const {
  generateTotpSecret,
  generateOtpauthUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
} = require('../../utils/totp.utils');

beforeEach(() => jest.clearAllMocks());

describe('totp.utils — generateTotpSecret()', () => {
  test('délègue à otplib.generateSecret() avec les plugins crypto/base32', () => {
    generateSecret.mockReturnValue('MOCKEDSECRET234567');

    const secret = generateTotpSecret();

    expect(secret).toBe('MOCKEDSECRET234567');
    expect(generateSecret).toHaveBeenCalledWith(expect.objectContaining({ crypto: {}, base32: {} }));
  });
});

describe('totp.utils — verifyTotpCode()', () => {
  test('retourne true si otplib.verify() renvoie valid: true', async () => {
    verify.mockResolvedValue({ valid: true, delta: 0 });

    const isValid = await verifyTotpCode('SECRET', '123456');

    expect(isValid).toBe(true);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({
      secret: 'SECRET',
      token: '123456',
      epochTolerance: 30,
    }));
  });

  test('retourne false si otplib.verify() renvoie valid: false', async () => {
    verify.mockResolvedValue({ valid: false });

    const isValid = await verifyTotpCode('SECRET', '000000');

    expect(isValid).toBe(false);
  });
});

describe('totp.utils — generateOtpauthUri()', () => {
  test('délègue à otplib.generateURI() avec issuer, label et secret', () => {
    generateURI.mockReturnValue('otpauth://totp/Au%20Point-Compt%C3%A9:admin%40broderie.ch?secret=SECRET&issuer=Au+Point-Compt%C3%A9');

    const uri = generateOtpauthUri('SECRET', 'admin@broderie.ch', 'Au Point-Compté Admin');

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(generateURI).toHaveBeenCalledWith(expect.objectContaining({
      issuer: 'Au Point-Compté Admin',
      label: 'admin@broderie.ch',
      secret: 'SECRET',
    }));
  });
});

describe('totp.utils — generateQrCodeDataUrl()', () => {
  test('délègue à QRCode.toDataURL() et retourne une data URI PNG', async () => {
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');

    const dataUrl = await generateQrCodeDataUrl('otpauth://totp/test');

    expect(dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('otpauth://totp/test');
  });
});
