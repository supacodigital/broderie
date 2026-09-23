// Tests unitaires des règles de rangement en sous-rayons (database/lib/subcategory-rules.js)

const { classify, normalize } = require('../../../database/lib/subcategory-rules');

const target = (rootSlug, name, brand = '', article) =>
  classify({ rootSlug, name, brand, article }).target;

describe('subcategory-rules — normalize()', () => {
  test('ignore accents et majuscules', () => {
    expect(normalize('Étamine Aïda')).toBe('etamine aida');
  });
});

describe('subcategory-rules — Fils Coton', () => {
  test('non-régression : toute la gamme DMC Art.117 va dans Mouliné (et pas un seul article)', () => {
    expect(target('fils-coton', 'DMC mouliné N°  745', 'DMC Art.117')).toBe('mouline-art-117');
    expect(target('fils-coton', 'DMC mouliné N° 3688', 'DMC Art.117')).toBe('mouline-art-117');
  });

  test('un kit DMC rangé en Fils Coton reste en tête de rayon', () => {
    expect(target('fils-coton', 'DMC, kit Cage aux oiseaux', 'DMC (hors Art. 117)')).toBeNull();
  });
});

describe('subcategory-rules — Kits de Broderie', () => {
  test('kit sur toile (indice de l\'export) → point de croix compté', () => {
    expect(target('kits-de-broderie', 'Vervaco, Kit coussin Renards', 'Vervaco', { IdTrame: 5 })).toBe('point-de-croix-compte');
  });

  test('gamme de kits comptés sans indice → point de croix compté', () => {
    expect(target('kits-de-broderie', 'Merejka, kit Stars', 'Merejka')).toBe('point-de-croix-compte');
  });

  test('gamme mixte sans indice → reste en tête (on ne devine pas)', () => {
    expect(target('kits-de-broderie', 'Vervaco, Kit coussin Renards', 'Vervaco')).toBeNull();
  });

  test('l\'imprimé n\'est jamais classé en compté, même sur toile', () => {
    expect(target('kits-de-broderie', 'Permin, kit imprimé nappe Automne', 'Permin of Copenhagen', { IdTrame: 5 })).toBeNull();
  });

  test('techniques spécifiques avant le compté', () => {
    expect(target('kits-de-broderie', 'Artibalta, kit diamant Unicorn', 'Artibalta')).toBe('kits-diamants-adultes');
    expect(target('kits-de-broderie', 'Abris Art, kit perles Moonlight', 'Abris Art')).toBe('kits-de-broderie-perlee');
    expect(target('kits-de-broderie', 'Permin, kit Hardanger 3 anges', 'Permin of Copenhagen')).toBe('broderie-traditionnelle-points-lances');
    expect(target('kits-de-broderie', 'Vervaco, kit enfant Girafe', 'Vervaco')).toBe('points-de-croix-et-broderie-imprimee-enfants');
  });

  test('articles mal rangés dans Kits → leur vrai sous-rayon', () => {
    expect(target('kits-de-broderie', 'Mirabilia Nora Corbett, grille Miss Moon', 'Mirabilia')).toBe('fiches-point-compte');
    expect(target('kits-de-broderie', 'Elbesee, métier à cliper 38x22cm', 'Artibalta')).toBe('tambours-et-metiers-a-broder');
    expect(target('kits-de-broderie', 'Graziano, Linge de cuisine Café rouge', 'Graziano')).toBe('cuisine-et-maison');
  });

  test('« coton perlé » n\'est pas un kit de perles', () => {
    expect(target('kits-de-broderie', 'DMC, kit coton perlé Coeur', 'DMC (hors Art. 117)')).not.toBe('kits-de-broderie-perlee');
  });
});

describe('subcategory-rules — autres rayons', () => {
  test('toiles : Aïda, lin, étamine', () => {
    expect(target('toiles-au-metre-et-coupons', 'Zweigart, Aïda 14, 5,4 points/cm noir', 'Zweigart')).toBe('toiles-aida');
    expect(target('toiles-au-metre-et-coupons', 'Zweigart, Lin Cashel 11 fils/cm Noir', 'Zweigart')).toBe('toiles-de-lin');
    expect(target('toiles-au-metre-et-coupons', 'Zweigart, Etamine Lugana 10 fils/cm', 'Zweigart')).toBe('eglantine-etamine-et-trames-diverses');
  });

  test('bandes : un galon en lin reste un galon', () => {
    expect(target('bandes-et-galons', 'La Stéphanoise, galon Tresse Lin 23mm', 'La Stéphanoise')).toBe('galons-decoratifs-a-motifs');
    expect(target('bandes-et-galons', 'Rico, bande à broder aïda 20cm', 'Rico')).toBe('bandes-aida-a-broder');
  });

  test('broderie diamant : « Magnetic » n\'est pas un magnet', () => {
    expect(target('broderie-diamant', 'Wizardi, kit diamant Magnetic eyes', 'Wizardi')).toBe('kits-diamants-adultes');
  });

  test('rayon sans règle → reste en tête', () => {
    expect(target('autres-fils', 'DMC, pelote coton perlé n°8', 'DMC (hors Art. 117)')).toBeNull();
  });
});
