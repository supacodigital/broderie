/* Jeton de désinscription newsletter — ticket CLI-05.

   La LCD suisse (art. 3 al. 1 let. o) impose un moyen de refus simple et gratuit :
   un clic depuis l'e-mail doit suffire. Mais un lien ne portant que l'adresse
   permettrait de désabonner n'importe qui. Le jeton concilie les deux. */

require('dotenv').config();
const {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  normalizeEmail,
} = require('../../utils/newsletter.utils');

const EMAIL = 'julie@broderie.ch';

describe('jeton de désinscription (CLI-05)', () => {
  test('le même e-mail donne toujours le même jeton', () => {
    expect(buildUnsubscribeToken(EMAIL)).toBe(buildUnsubscribeToken(EMAIL));
  });

  test('deux adresses différentes donnent deux jetons différents', () => {
    expect(buildUnsubscribeToken(EMAIL)).not.toBe(buildUnsubscribeToken('autre@broderie.ch'));
  });

  /* Les logiciels de messagerie capitalisent parfois la première lettre, et une
     cliente peut s'être inscrite avec une casse différente. */
  test('la casse et les espaces ne changent pas le jeton', () => {
    expect(buildUnsubscribeToken('  Julie@Broderie.CH  ')).toBe(buildUnsubscribeToken(EMAIL));
  });

  test('accepte son propre jeton', () => {
    expect(verifyUnsubscribeToken(EMAIL, buildUnsubscribeToken(EMAIL))).toBe(true);
  });

  // Le cas que le jeton existe pour empêcher : désabonner l'adresse d'un tiers
  test("refuse le jeton d'une autre adresse", () => {
    expect(verifyUnsubscribeToken(EMAIL, buildUnsubscribeToken('autre@broderie.ch'))).toBe(false);
  });

  test('refuse un jeton absent, vide ou de mauvaise longueur', () => {
    expect(verifyUnsubscribeToken(EMAIL, undefined)).toBe(false);
    expect(verifyUnsubscribeToken(EMAIL, '')).toBe(false);
    expect(verifyUnsubscribeToken(EMAIL, 'trop-court')).toBe(false);
    expect(verifyUnsubscribeToken(EMAIL, 'a'.repeat(64))).toBe(false);
  });

  /* Un jeton d'un seul caractère faux doit être refusé : la comparaison ne doit
     pas s'arrêter au premier octet identique. */
  test('refuse un jeton presque juste', () => {
    const token = buildUnsubscribeToken(EMAIL);
    const altered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
    expect(verifyUnsubscribeToken(EMAIL, altered)).toBe(false);
  });

  test('le jeton fait 32 caractères hexadécimaux', () => {
    expect(buildUnsubscribeToken(EMAIL)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("lien de désinscription placé dans les e-mails", () => {
  test('porte l\'adresse encodée et son jeton', () => {
    const url = buildUnsubscribeUrl(EMAIL);

    expect(url).toContain('/desinscription?');
    // Le « @ » doit être encodé : il n'est pas valide tel quel dans une query
    expect(url).toContain(`email=${encodeURIComponent(EMAIL)}`);
    expect(url).toContain(`token=${buildUnsubscribeToken(EMAIL)}`);
  });

  test('ne produit jamais de double barre oblique', () => {
    expect(buildUnsubscribeUrl(EMAIL)).not.toMatch(/[^:]\/\//);
  });

  test('normalise l\'adresse dans le lien', () => {
    expect(buildUnsubscribeUrl('  Julie@Broderie.CH ')).toBe(buildUnsubscribeUrl(EMAIL));
  });
});

describe('normalizeEmail', () => {
  test('met en minuscules et retire les espaces', () => {
    expect(normalizeEmail('  Julie@Broderie.CH  ')).toBe(EMAIL);
  });

  test('tolère une valeur absente', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
