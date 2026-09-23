import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readSearchHistory, addToSearchHistory, removeFromSearchHistory, clearSearchHistory, SEARCH_HISTORY_MAX,
} from './searchHistory.js'

describe('searchHistory — historique sur l\'appareil', () => {
  beforeEach(() => localStorage.clear())

  it('place la dernière recherche en tête', () => {
    addToSearchHistory('coton mouliné')
    addToSearchHistory('aida 14')
    expect(readSearchHistory()).toEqual(['aida 14', 'coton mouliné'])
  })

  it('remonte une recherche déjà présente au lieu de la dupliquer (casse et espaces ignorés)', () => {
    addToSearchHistory('coton mouliné')
    addToSearchHistory('aida 14')
    addToSearchHistory('  Coton   Mouliné ')
    expect(readSearchHistory()).toEqual(['Coton Mouliné', 'aida 14'])
  })

  it(`ne garde que les ${SEARCH_HISTORY_MAX} dernières`, () => {
    ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].forEach(addToSearchHistory)
    expect(readSearchHistory()).toEqual(['f6', 'e5', 'd4', 'c3', 'b2'])
  })

  it('ignore une saisie vide ou d\'un seul caractère', () => {
    addToSearchHistory('  ')
    addToSearchHistory('a')
    expect(readSearchHistory()).toEqual([])
  })

  it('retire une recherche, ou tout l\'historique', () => {
    addToSearchHistory('coton mouliné')
    addToSearchHistory('aida 14')
    removeFromSearchHistory('COTON MOULINÉ')
    expect(readSearchHistory()).toEqual(['aida 14'])
    clearSearchHistory()
    expect(readSearchHistory()).toEqual([])
  })

  it('reste utilisable si le stockage est inaccessible ou corrompu', () => {
    localStorage.setItem('search_history', '{pas du json')
    expect(readSearchHistory()).toEqual([])

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => addToSearchHistory('perlé 5')).not.toThrow()
    spy.mockRestore()
  })
})
