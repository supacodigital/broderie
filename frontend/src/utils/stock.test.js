import { describe, it, expect } from 'vitest'
import { maxQuantityOf, stockInSaleUnit, formatStock } from './stock.js'

/* ADM-12 — stock d'un article à la coupe tenu en centimètres */
const bande = { sold_by_length: 1, length_step_cm: 10 }

describe('stock — quantité maximale du panier', () => {
  it('2.15 m en stock permettent 21 tronçons de 10 cm', () => {
    expect(maxQuantityOf({ ...bande, stock: 215 })).toBe(21)
  })

  it('un article à la pièce est borné par son stock', () => {
    expect(maxQuantityOf({ sold_by_length: 0, stock: 4 })).toBe(4)
  })

  it('stock inconnu : aucune borne', () => {
    expect(maxQuantityOf({ sold_by_length: 0 })).toBe(Infinity)
  })
})

describe('stock — affichage', () => {
  it('en mètres pour la coupe, en pièces sinon', () => {
    expect(stockInSaleUnit({ ...bande, stock: 300 })).toBe(3)
    expect(formatStock({ ...bande, stock: 215 })).toBe('2.15 m')
    expect(formatStock({ sold_by_length: 0, stock: 3 })).toBe('3')
  })
})
