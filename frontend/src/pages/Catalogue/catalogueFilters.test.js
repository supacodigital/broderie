import { describe, it, expect } from 'vitest'
import { readFilters, writeSearch } from './catalogueFilters.js'

const read = (qs, slug) => readFilters(new URLSearchParams(qs), slug)

describe('catalogueFilters', () => {
  it('lit la catégorie dans le chemin, puis dans l\'ancien ?category=', () => {
    expect(read('', 'fils').category).toBe('fils')
    expect(read('category=kits', undefined).category).toBe('kits')
    expect(read('', undefined).category).toBe('')
  })

  it('applique les valeurs par défaut', () => {
    const f = read('', undefined)
    expect(f).toMatchObject({ page: 1, limit: 20, sort: 'created_at', order: 'desc' })
    expect(read('page=abc', undefined).page).toBe(1)
  })

  it('omet catégorie, limite et valeurs par défaut de la query string', () => {
    expect(writeSearch({ page: 1, limit: 20, category: 'fils', sort: 'created_at', order: 'desc', q: undefined })).toBe('')
    expect(writeSearch({ page: 5, q: 'dmc 3831', in_stock: true, made_to_order: false })).toBe('page=5&q=dmc+3831&in_stock=true')
  })

  /* Non-régression de la boucle infinie du 23/09 : relire l'URL écrite doit redonner
     exactement la même URL, sinon lecture et écriture se relancent sans fin */
  it.each([
    '',
    'page=5',
    'q=enfant',
    'q=DMC+moulin%C3%A9+N%C2%B0+3831&page=2',
    'brand=DMC&min_price=10&max_price=50&in_stock=true&made_to_order=true&badge=promo&min_rating=4&sort=price_chf&order=asc&featured=true',
  ])('aller-retour stable : %s', (qs) => {
    const once  = writeSearch(read(qs, 'kits-de-broderie'))
    const twice = writeSearch(read(once, 'kits-de-broderie'))
    expect(twice).toBe(once)
  })
})
