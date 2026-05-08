const multer = require('multer');
const { AppError } = require('./errorHandler');

// Formats autorisés (voir CLAUDE.md)
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Stockage en mémoire — traitement par sharp avant écriture sur disque
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Format non autorisé. Formats acceptés : jpg, jpeg, png, webp.', 400));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { upload };
