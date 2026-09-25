import { describe, it, expect } from 'vitest'
import { maxQuantityOf, minQuantityOf, lineQuantityLabel, lineUnitSuffix, stockInSaleUnit, formatStock } from './stock.js'

/* ADM-12 — stock d'un article à la coupe tenu en centimètres */
const bande = { sold_by_length: 1, length_step_cm: 10 }

describe('stock — quantité maximale du panier', () => {
  it('2.15 m en stock permettent 21 tronçons de 10 cm', () => {
    expect(maxQuantityOf({ ...bande, stock: 215 })).toBe(21)
  })

  it('un article à la pièce est borné par son stock', () => {
    expect(maxQuantityOf({ sold_by_length: 0, stock: 4 })).toBe(4)
  })

  it('article sur commande : le stock nul ne bloque pas le « + » (plafond 999 du serveur)', () => {
    expect(maxQuantityOf({ sold_by_length: 0, is_made_to_order: 1, stock: 0 })).toBe(999)
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

describe('ligne de panier ou de commande — article à la coupe', () => {
  it('« 60 cm » pour 6 tronçons de 10 cm, la quantité seule pour une pièce', () => {
    expect(lineQuantityLabel({ ...bande, quantity: 6 })).toBe('60 cm')
    expect(lineQuantityLabel({ sold_by_length: 0, quantity: 3 })).toBe('3')
  })

  it('prix du tronçon suivi de « / 10 cm »', () => {
    expect(lineUnitSuffix(bande)).toBe(' / 10 cm')
    expect(lineUnitSuffix({ sold_by_length: 0 })).toBe('')
  })

  it('minimum de 50 cm = 5 tronçons ; 1 pour une pièce', () => {
    expect(minQuantityOf({ ...bande, length_min_cm: 50 })).toBe(5)
    expect(minQuantityOf({ sold_by_length: 0 })).toBe(1)
  })
})
