// Mock du stockage : on ne veut pas écrire de fichiers sur le disque pendant les tests
jest.mock('../../config/storage', () => ({
  saveBuffer: jest.fn(async (_buf, filename) => `/uploads/products/${filename}`),
  deleteLocal: jest.fn(),
}));

const sharp = require('sharp');
const storage = require('../../config/storage');
const { processImage, isSupportedImage } = require('../../config/sharp');

// Génère un vrai PNG 4x4 en mémoire pour les tests d'intégration sharp
const makePng = () =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();

describe('config/sharp — isSupportedImage()', () => {
  test('accepte un buffer JPEG (FF D8 FF)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  test('accepte un buffer PNG (89 50 4E 47)', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  test('accepte un buffer WebP (RIFF....WEBP)', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(isSupportedImage(buf)).toBe(true);
  });

  test('rejette un buffer trop court', () => {
    expect(isSupportedImage(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  test('rejette un buffer null / vide', () => {
    expect(isSupportedImage(null)).toBe(false);
    expect(isSupportedImage(Buffer.alloc(0))).toBe(false);
  });

  test('rejette un exécutable ELF déguisé', () => {
    const buf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(8)]);
    expect(isSupportedImage(buf)).toBe(false);
  });

  test('rejette un SVG (vecteur, XML — vecteur d\'injection)', () => {
    const buf = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">');
    expect(isSupportedImage(buf)).toBe(false);
  });
});

describe('config/sharp — processImage()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejette un buffer non image avant tout traitement', async () => {
    await expect(processImage(Buffer.from('pas une image du tout'))).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.saveBuffer).not.toHaveBeenCalled();
  });

  test('convertit un vrai PNG en 3 tailles WebP', async () => {
    const png = await makePng();
    const { uuid, urls } = await processImage(png);

    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.saveBuffer).toHaveBeenCalledTimes(3);
    expect(urls.thumbnail).toBe(`/uploads/products/${uuid}-thumbnail.webp`);
    expect(urls.medium).toBe(`/uploads/products/${uuid}-medium.webp`);
    expect(urls.large).toBe(`/uploads/products/${uuid}-large.webp`);

    // Les buffers enregistrés sont bien du WebP (RIFF....WEBP)
    for (const [buf] of storage.saveBuffer.mock.calls) {
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });
});
