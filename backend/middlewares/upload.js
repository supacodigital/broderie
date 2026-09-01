const multer = require('multer');
const { AppError } = require('./errorHandler');

// Formats autorisés (voir CLAUDE.md)
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
// Un upload = un fichier, un seul champ — coupe court à un abus multipart
const MAX_FILES = 1;

// Stockage en mémoire — traitement par sharp avant écriture sur disque
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // 1re barrière : le Content-Type déclaré (contrôlé par le client — la vérif
  // réelle sur les magic bytes est faite par config/sharp avant conversion).
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Format non autorisé. Formats acceptés : jpg, jpeg, png, webp.', 400));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter,
});

module.exports = { upload };
