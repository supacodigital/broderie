import { describe, test, expect } from 'vitest'
import { cartReducer, mergeOrAdd, INITIAL } from './CartContext.jsx'

describe('cartReducer', () => {
  test('SET_ITEMS remplace les articles et efface loading/error', () => {
    const state = { items: [], loading: true, error: 'x' }
    const next = cartReducer(state, { type: 'SET_ITEMS', payload: [{ id: 1 }] })
    expect(next).toEqual({ items: [{ id: 1 }], loading: false, error: null })
  })

  test('SET_ERROR pose l’erreur et coupe le loading', () => {
    const next = cartReducer(INITIAL, { type: 'SET_ERROR', payload: 'boom' })
    expect(next.error).toBe('boom')
    expect(next.loading).toBe(false)
  })

  test('CLEAR revient à l’état initial', () => {
    const next = cartReducer({ items: [{ id: 1 }], loading: true, error: 'x' }, { type: 'CLEAR' })
    expect(next).toEqual(INITIAL)
  })

  test('action inconnue : état inchangé', () => {
    const state = { items: [{ id: 1 }], loading: false, error: null }
    expect(cartReducer(state, { type: 'NOPE' })).toBe(state)
  })
})

describe('mergeOrAdd', () => {
  test('ajoute un article absent', () => {
    const r = mergeOrAdd([], { product_id: 1, variant_id: null, quantity: 2 })
    expect(r).toHaveLength(1)
    expect(r[0].quantity).toBe(2)
  })

  test('cumule la quantité si le même (produit, variante) existe déjà', () => {
    const items = [{ product_id: 1, variant_id: null, quantity: 1 }]
    const r = mergeOrAdd(items, { product_id: 1, variant_id: null, quantity: 3 })
    expect(r).toHaveLength(1)
    expect(r[0].quantity).toBe(4)
  })

  test('distingue deux variantes du même produit', () => {
    const items = [{ product_id: 1, variant_id: 10, quantity: 1 }]
    const r = mergeOrAdd(items, { product_id: 1, variant_id: 20, quantity: 1 })
    expect(r).toHaveLength(2)
  })
})
