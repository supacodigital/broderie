const { generateSecret, generate, verify, generateURI } = require('otplib');
const { crypto: nodeCrypto } = require('@otplib/plugin-crypto-node');
const { base32 } = require('@otplib/plugin-base32-scure');
const QRCode = require('qrcode');

// Tolérance de 30s de part et d'autre — absorbe la dérive d'horloge du téléphone
// (comportement standard des apps authenticator : accepte le code précédent/suivant).
const EPOCH_TOLERANCE = 30;

// Génère un nouveau secret TOTP (base32) — 20 bytes, conforme RFC 4226.
const generateTotpSecret = () => generateSecret({ crypto: nodeCrypto, base32 });

// Génère l'URI otpauth:// à encoder en QR code pour l'app authenticator.
const generateOtpauthUri = (secret, accountEmail, issuer) =>
  generateURI({
    issuer,
    label: accountEmail,
    secret,
    crypto: nodeCrypto,
    base32,
  });

// Génère le QR code en data URI PNG à partir de l'URI otpauth://.
const generateQrCodeDataUrl = (otpauthUri) => QRCode.toDataURL(otpauthUri);

// Vérifie un code TOTP saisi par l'utilisateur contre le secret déchiffré.
const verifyTotpCode = async (secret, token) => {
  const result = await verify({ secret, token, crypto: nodeCrypto, base32, epochTolerance: EPOCH_TOLERANCE });
  return result.valid;
};

module.exports = { generateTotpSecret, generateOtpauthUri, generateQrCodeDataUrl, verifyTotpCode };
