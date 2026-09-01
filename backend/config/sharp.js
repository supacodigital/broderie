const sharp   = require('sharp');
const { v4: uuidv4 } = require('uuid');
const storage  = require('./storage');
const { AppError } = require('../middlewares/errorHandler');

// Tailles générées à chaque upload (voir CLAUDE.md section performance)
const SIZES = [
  { name: 'thumbnail', width: 200  },
  { name: 'medium',    width: 600  },
  { name: 'large',     width: 1200 },
];

// Vérifie les magic bytes réels du buffer — le Content-Type multipart est
// contrôlé par le client, on ne s'y fie donc pas seul (défense en profondeur
// en plus du re-décodage sharp).
const isSupportedImage = (buf) => {
  if (!buf || buf.length < 12) return false;
  // JPEG : FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP : "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
};

// Convertit une image en WebP, génère 3 tailles, stocke chacune.
// Retourne { uuid, urls: { thumbnail, medium, large } }
const processImage = async (buffer) => {
  if (!isSupportedImage(buffer)) {
    throw new AppError('Fichier image invalide ou format non pris en charge (jpg, png, webp).', 400);
  }

  const uuid = uuidv4();
  const urls  = {};

  for (const { name, width } of SIZES) {
    const filename = `${uuid}-${name}.webp`;

    const webpBuffer = await sharp(buffer, {
      // Rejette les images « bombe » aux dimensions démesurées (~24 Mpx)
      limitInputPixels: 24_000_000,
      failOn: 'error',
    })
      .rotate()                                       // applique l'orientation EXIF PUIS supprime toutes les métadonnées (géoloc incluse)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    urls[name] = await storage.saveBuffer(webpBuffer, filename);
  }

  return { uuid, urls };
};

module.exports = { processImage, isSupportedImage };
