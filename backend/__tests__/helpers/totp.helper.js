// Calcul TOTP (RFC 6238) autonome pour les tests d'intégration — simule le calcul que
// ferait une app authenticator à partir d'un secret. N'utilise QUE le module natif
// 'crypto' de Node, volontairement SANS dépendre d'otplib : otplib importe des
// dépendances ESM pures (@scure/base) que Jest ne peut pas charger sans Babel (absent
// de ce projet). Vérifié équivalent à l'implémentation réelle d'otplib.utils.js.
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(base32) {
  let bits = '';
  for (const char of base32.toUpperCase().replace(/=+$/, '')) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Calcule le code TOTP à 6 chiffres pour un secret base32 donné, à l'instant courant
// (ou à un epoch explicite pour tester la fenêtre de tolérance).
const computeTotp = (secretBase32, epochSeconds = Math.floor(Date.now() / 1000)) => {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(epochSeconds / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
};

module.exports = { computeTotp };
