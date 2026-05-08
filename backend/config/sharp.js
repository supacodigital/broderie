const sharp   = require('sharp');
const { v4: uuidv4 } = require('uuid');
const storage  = require('./storage');

// Tailles générées à chaque upload (voir CLAUDE.md section performance)
const SIZES = [
  { name: 'thumbnail', width: 200  },
  { name: 'medium',    width: 600  },
  { name: 'large',     width: 1200 },
];

// Convertit une image en WebP, génère 3 tailles, stocke chacune
// Retourne { uuid, urls: { thumbnail, medium, large } }
const processImage = async (buffer) => {
  const uuid = uuidv4();
  const urls  = {};

  for (const { name, width } of SIZES) {
    const filename = `${uuid}-${name}.webp`;

    const webpBuffer = await sharp(buffer)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    urls[name] = await storage.saveBuffer(webpBuffer, filename);
  }

  return { uuid, urls };
};

module.exports = { processImage };
