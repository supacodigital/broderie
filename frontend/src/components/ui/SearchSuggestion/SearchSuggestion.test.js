import { describe, test, expect } from 'vitest'
import { highlightMatches } from './highlightMatches.js'

/* Le surlignage recompose le libellé segment par segment : toute erreur d'index
   ferait disparaître ou dupliquer des caractères à l'écran. On vérifie donc
   systématiquement que la concaténation redonne le texte d'origine. */
const rebuild = (segments) => segments.map((s) => s.text).join('')
const matched = (segments) => segments.filter((s) => s.match).map((s) => s.text)

describe('highlightMatches()', () => {
  test('surligne le terme cherché sans altérer le libellé', () => {
    const segments = highlightMatches('DMC mouliné N° 666', 'mouliné')
    expect(rebuild(segments)).toBe('DMC mouliné N° 666')
    expect(matched(segments)).toEqual(['mouliné'])
  })

  test('ignore les accents : « mouline » surligne « mouliné »', () => {
    const segments = highlightMatches('DMC mouliné N° 666', 'mouline')
    expect(rebuild(segments)).toBe('DMC mouliné N° 666')
    // Le texte affiché conserve son accent d'origine
    expect(matched(segments)).toEqual(['mouliné'])
  })

  test('ignore la casse', () => {
    const segments = highlightMatches('Bonheur des Dames', 'BONHEUR')
    expect(matched(segments)).toEqual(['Bonheur'])
  })

  test('surligne chaque mot d\'une recherche multi-termes', () => {
    const segments = highlightMatches('Kit point de croix chat', 'kit chat')
    expect(rebuild(segments)).toBe('Kit point de croix chat')
    expect(matched(segments)).toEqual(['Kit', 'chat'])
  })

  test('surligne toutes les occurrences d\'un même terme', () => {
    const segments = highlightMatches('coton et coton', 'coton')
    expect(rebuild(segments)).toBe('coton et coton')
    expect(matched(segments)).toEqual(['coton', 'coton'])
  })

  test('ignore les termes d\'une seule lettre — sinon presque tout serait surligné', () => {
    const segments = highlightMatches('Aïda blanc', 'a')
    expect(matched(segments)).toEqual([])
    expect(rebuild(segments)).toBe('Aïda blanc')
  })

  test('une recherche vide ne surligne rien et rend le texte intact', () => {
    expect(rebuild(highlightMatches('Zweigart Aïda', ''))).toBe('Zweigart Aïda')
    expect(matched(highlightMatches('Zweigart Aïda', ''))).toEqual([])
  })

  test('un terme absent laisse le libellé entier non surligné', () => {
    const segments = highlightMatches('Zweigart Aïda', 'tronconneuse')
    expect(matched(segments)).toEqual([])
    expect(rebuild(segments)).toBe('Zweigart Aïda')
  })

  test('supporte un libellé vide ou absent sans lever', () => {
    expect(rebuild(highlightMatches('', 'coton'))).toBe('')
    expect(rebuild(highlightMatches(undefined, 'coton'))).toBe('')
  })

  test('les caractères accentués gardent leur position exacte', () => {
    // « Aïda » : le surlignage doit couvrir le mot entier, accent compris
    const segments = highlightMatches('Toile Aïda blanche', 'aida')
    expect(rebuild(segments)).toBe('Toile Aïda blanche')
    expect(matched(segments)).toEqual(['Aïda'])
  })
})
