// Tests unitaires — catalogue de polices et mise en forme des textes (26.09)
const fs = require('fs');
const path = require('path');
const { FONT_CATALOG, readStyles, toShopStyles } = require('../../utils/contentStyle.utils');

/* Le catalogue (serveur) et les @font-face (boutique) vivent dans deux
   applications : ce test garantit qu'une police proposée dans l'administration
   est réellement servie par broderie.ch, dans chacune des graisses proposées.
   Sans lui, une police absente de fonts.css tomberait silencieusement sur la
   police de secours du navigateur. */
describe('catalogue de polices ↔ frontend/src/fonts.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../frontend/src/fonts.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => ({
    family: body.match(/font-family:\s*'([^']+)'/)[1],
    style: body.match(/font-style:\s*(\w+)/)[1],
    weights: body.match(/font-weight:\s*([\d ]+);/)[1].trim().split(/\s+/).map(Number),
    file: body.match(/url\('\.\/([^']+)'\)/)[1],
  }));
  // Une déclaration « 300 700 » couvre toute la plage (police variable)
  const covers = (face, weight) => face.weights.length === 2
    ? weight >= face.weights[0] && weight <= face.weights[1]
    : face.weights[0] === weight;

  test.each(FONT_CATALOG.map((f) => [f.label, f]))('%s : chaque graisse proposée est déclarée', (_label, font) => {
    for (const weight of font.weights) {
      const face = faces.find((f) => f.family === font.family && f.style === 'normal' && covers(f, weight));
      expect({ weight, declared: Boolean(face) }).toEqual({ weight, declared: true });
    }
  });

  test.each(FONT_CATALOG.filter((f) => f.italic).map((f) => [f.label, f]))('%s : italique dédiée déclarée', (_label, font) => {
    expect(faces.some((f) => f.family === font.family && f.style === 'italic')).toBe(true);
  });

  test('chaque fichier de police référencé existe', () => {
    for (const { file } of faces) {
      expect(fs.existsSync(path.join(__dirname, '../../../frontend/src', file))).toBe(true);
    }
  });
});

describe('readStyles()', () => {
  test('relit le JSON stocké', () => {
    expect(readStyles('{"hero_title":{"size":40}}')).toEqual({ hero_title: { size: 40 } });
  });

  test.each([[null], [''], ['pas du json'], ['[1,2]'], ['"texte"']])('valeur absente ou abîmée (%p) : aucune mise en forme', (json) => {
    expect(readStyles(json)).toEqual({});
  });
});

describe('toShopStyles()', () => {
  test('remplace la clé de police par la pile CSS, garde le reste', () => {
    expect(toShopStyles({ hero_title: { font: 'eb-garamond', size: 40 } }))
      .toEqual({ hero_title: { fontFamily: "'EB Garamond', serif", size: 40 } });
  });

  test('une police retirée du catalogue est ignorée : le texte reprend la police du site', () => {
    expect(toShopStyles({ hero_title: { font: 'ancienne-police', size: 40 } }))
      .toEqual({ hero_title: { size: 40 } });
  });
});
