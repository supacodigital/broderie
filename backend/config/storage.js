const path = require('path');
const fs   = require('fs');

/* Stockage des images produit sur le disque du VPS (dossier uploads/products/),
   servi en statique par Express sous /uploads (voir app.js).
   Choix retenu pour le démarrage (pas d'Object Storage S3) — sauvegarde assurée
   par Swiss Backup côté Infomaniak. Le dossier uploads/ doit être persistant et
   inclus dans la stratégie de backup. */

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');

// Enregistre un buffer WebP sur le disque — retourne l'URL publique relative
const saveBuffer = async (buffer, filename) => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/products/${filename}`;
};

// Supprime un fichier image du disque
const deleteLocal = (url) => {
  if (!url) return;
  const filename = path.basename(url);
  const filepath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
};

module.exports = { saveBuffer, deleteLocal };
