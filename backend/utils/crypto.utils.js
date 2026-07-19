const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommandé pour GCM

// Clé dérivée une seule fois au chargement du module — échoue au démarrage du serveur
// si MFA_ENCRYPTION_KEY est absente ou mal formée (déjà vérifié dans app.js, ceci est
// une seconde barrière si le module est utilisé hors du flux normal, ex. en test).
const getKey = () => {
  const key = Buffer.from(env.mfaEncryptionKey || '', 'hex');
  if (key.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY invalide — doit faire 32 bytes (64 caractères hex)');
  }
  return key;
};

// Chiffre un secret TOTP en clair — retourne les 3 parties à stocker séparément.
// Contrairement à bcrypt, ce chiffrement est réversible : nécessaire car le serveur
// doit recalculer le code TOTP attendu à partir du secret en clair pour le vérifier.
const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
};

// Déchiffre un secret TOTP — lève une erreur si authTag ou ciphertext ont été altérés
// (intégrité garantie par GCM), plutôt que de retourner silencieusement une valeur corrompue.
const decryptSecret = ({ ciphertext, iv, authTag }) => {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

module.exports = { encryptSecret, decryptSecret };
