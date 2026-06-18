const { normalizeLocale, localeFromRequest } = require('../../utils/locale.utils');

describe('normalizeLocale', () => {
  test('normalise les variantes régionales vers le code court', () => {
    expect(normalizeLocale('fr-CH')).toBe('fr');
    expect(normalizeLocale('de-CH')).toBe('de');
    expect(normalizeLocale('en-US')).toBe('en');
  });

  test('accepte les codes courts déjà valides', () => {
    expect(normalizeLocale('fr')).toBe('fr');
    expect(normalizeLocale('de')).toBe('de');
    expect(normalizeLocale('en')).toBe('en');
  });

  test('retombe sur « fr » pour une locale absente ou non supportée', () => {
    expect(normalizeLocale(null)).toBe('fr');
    expect(normalizeLocale(undefined)).toBe('fr');
    expect(normalizeLocale('it')).toBe('fr');
    expect(normalizeLocale('')).toBe('fr');
  });
});

describe('localeFromRequest — ordre de priorité', () => {
  test('priorité 1 : locale du compte connecté', () => {
    const req = {
      user: { locale: 'de' },
      query: { locale: 'en' },
      headers: { 'accept-language': 'fr-CH' },
    };
    expect(localeFromRequest(req)).toBe('de');
  });

  test('priorité 2 : query ?locale si pas de user', () => {
    const req = {
      query: { locale: 'en' },
      headers: { 'accept-language': 'fr-CH' },
    };
    expect(localeFromRequest(req)).toBe('en');
  });

  test('priorité 3 : en-tête Accept-Language', () => {
    const req = { headers: { 'accept-language': 'de-CH' } };
    expect(localeFromRequest(req)).toBe('de');
  });

  test('fallback : « fr » si aucune source', () => {
    expect(localeFromRequest({})).toBe('fr');
    expect(localeFromRequest({ headers: {}, query: {} })).toBe('fr');
  });

  test('normalise toujours la valeur retournée', () => {
    expect(localeFromRequest({ user: { locale: 'de-CH' } })).toBe('de');
    expect(localeFromRequest({ query: { locale: 'it' } })).toBe('fr'); // non supporté → fr
  });
});
