const path = require('path');
const fs   = require('fs');

// En production : Infomaniak Cloud Storage (compatible S3)
// En développement : dossier local /uploads/products/
const IS_PROD = process.env.NODE_ENV === 'production';

let s3Client = null;

if (IS_PROD) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region:   'us-east-1', // valeur factice requise par le SDK S3
    credentials: {
      accessKeyId:     process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true, // obligatoire pour les endpoints S3-compatibles
  });
}

// Enregistre un buffer WebP — retourne l'URL publique
const saveBuffer = async (buffer, filename) => {
  if (IS_PROD) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new PutObjectCommand({
      Bucket:      process.env.STORAGE_BUCKET,
      Key:         `products/${filename}`,
      Body:        buffer,
      ContentType: 'image/webp',
      ACL:         'public-read',
    }));
    return `${process.env.STORAGE_ENDPOINT}/${process.env.STORAGE_BUCKET}/products/${filename}`;
  }

  // Développement — écriture locale
  const dir = path.join(__dirname, '..', 'uploads', 'products');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/uploads/products/${filename}`;
};

// Supprime un fichier (local uniquement — en prod la suppression S3 est gérée séparément)
const deleteLocal = (url) => {
  if (IS_PROD) return;
  const filename = path.basename(url);
  const filepath = path.join(__dirname, '..', 'uploads', 'products', filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
};

module.exports = { saveBuffer, deleteLocal };
