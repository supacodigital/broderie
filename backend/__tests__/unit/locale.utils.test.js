const { normalizeLocale, localeFromRequest } = require('../../utils/locale.utils');

// Site 100 % francophone (marché Suisse romand) : les deux helpers renvoient
// toujours 'fr', quelle que soit l'entrée. Ils restent en place pour ne pas
// toucher tous leurs appelants et faciliter un futur ajout de langue.

describe('normalizeLocale', () => {
  test('renvoie toujours « fr »', () => {
    expect(normalizeLocale('fr-CH')).toBe('fr');
    expect(normalizeLocale('de-CH')).toBe('fr');
    expect(normalizeLocale('en-US')).toBe('fr');
    expect(normalizeLocale(null)).toBe('fr');
    expect(normalizeLocale(undefined)).toBe('fr');
    expect(normalizeLocale('')).toBe('fr');
  });
});

describe('localeFromRequest', () => {
  test('renvoie toujours « fr », quelles que soient les sources', () => {
    expect(localeFromRequest({})).toBe('fr');
    expect(localeFromRequest({ user: { locale: 'de' }, query: { locale: 'en' } })).toBe('fr');
    expect(localeFromRequest({ headers: { 'accept-language': 'de-CH' } })).toBe('fr');
  });
});
