// Tests unitaires middleware upload.js — fileFilter uniquement
// (multer lui-même est une dépendance externe, on teste la logique de filtrage)

// On extrait fileFilter en réexportant upload pour y accéder via un faux multer
jest.mock('multer', () => {
  const fn = jest.fn().mockImplementation((opts) => {
    // Expose les options pour qu'on puisse tester fileFilter directement
    fn._lastOpts = opts;
    return { single: jest.fn(), array: jest.fn(), fields: jest.fn() };
  });
  fn.memoryStorage = jest.fn().mockReturnValue({});
  return fn;
});

const multer = require('multer');
// Charge le middleware pour que jest.mock intercepte l'appel multer({...})
require('../../middlewares/upload');

describe('middleware — upload fileFilter()', () => {
  let fileFilter;

  beforeAll(() => {
    fileFilter = multer._lastOpts.fileFilter;
  });

  test('accepte image/jpeg', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'image/jpeg' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepte image/png', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'image/png' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepte image/webp', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'image/webp' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('refuse image/gif avec une AppError 400', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'image/gif' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  test('refuse application/pdf avec une AppError 400', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: 'application/pdf' }, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  test('refuse un mimetype vide', () => {
    const cb = jest.fn();
    fileFilter({}, { mimetype: '' }, cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('middleware — upload config', () => {
  test('utilise memoryStorage', () => {
    expect(multer.memoryStorage).toHaveBeenCalled();
  });

  test('limite la taille à 5 MB', () => {
    expect(multer._lastOpts.limits.fileSize).toBe(5 * 1024 * 1024);
  });
});
