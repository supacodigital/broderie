const { toSearchTerms } = require('../../utils/search.utils');

/* Non-régression CLI-01 — « je n'arrive pas à trouver Permin, kit calendrier de
   l'Avent Nain ». Toute recherche avec une apostrophe renvoyait 0 résultat. */
describe('search.utils — toSearchTerms()', () => {
  test('l\'apostrophe sépare les mots (droite et typographique de l\'iPhone)', () => {
    expect(toSearchTerms("calendrier de l'Avent")).toEqual(['calendrier', 'de', 'Avent']);
    expect(toSearchTerms('calendrier de l’Avent')).toEqual(['calendrier', 'de', 'Avent']);
    expect(toSearchTerms("boîte d'aiguilles")).toEqual(['boîte', 'aiguille']);
  });

  test('les restes d\'élision ne prennent pas la place d\'un vrai mot', () => {
    // 7 mots saisis, dont « l » : « nain » ne doit pas être coupé par la limite de 6
    expect(toSearchTerms("Permin, kit calendrier de l'Avent Nain"))
      .toEqual(['Permin', 'kit', 'calendrier', 'de', 'Avent', 'Nain']);
  });

  test('un chiffre isolé est conservé', () => {
    expect(toSearchTerms('perlé 5')).toEqual(['perlé', '5']);
  });

  test('la ponctuation sépare les mots, le trait d\'union et le point restent', () => {
    expect(toSearchTerms('Permin, kit')).toEqual(['Permin', 'kit']);
    expect(toSearchTerms('1006-5860')).toEqual(['1006-5860']);
    expect(toSearchTerms('vinyle 2.5')).toEqual(['vinyle', '2.5']);
  });

  test('le pluriel est toujours ramené au singulier', () => {
    expect(toSearchTerms('cotons moulinés')).toEqual(['coton', 'mouliné']);
  });
});
