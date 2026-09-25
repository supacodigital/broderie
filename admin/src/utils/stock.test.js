import { describe, it, expect } from 'vitest'
import { stockToInput, stockFromInput, stockInSaleUnit, formatStock, formatQuantity, lineQuantityLabel, lineUnitSuffix } from './stock.js'

/* ADM-12 — stock d'un article à la coupe tenu en centimètres, saisi et lu en mètres */
const bande = { sold_by_length: 1, length_step_cm: 10 }
const kit   = { sold_by_length: 0 }

describe('stock — conversion du champ de saisie', () => {
  it('affiche 215 cm comme 2.15 m et renvoie 215', () => {
    expect(stockToInput(215, true)).toBe(2.15)
    expect(stockFromInput('2.15', true)).toBe(215)
  })

  it('arrondit au centimètre malgré les décimales binaires', () => {
    // 0.29 × 100 = 28.999999999999996 en virgule flottante
    expect(stockFromInput('0.29', true)).toBe(29)
    expect(stockFromInput('999999.99', true)).toBe(99999999)
  })

  it('laisse les pièces telles quelles', () => {
    expect(stockToInput(7, false)).toBe(7)
    expect(stockFromInput('7', false)).toBe(7)
  })
})

describe('stock — affichage', () => {
  it('en mètres pour la coupe, en pièces sinon', () => {
    expect(formatStock({ ...bande, stock: 215 })).toBe('2.15 m')
    expect(formatStock({ ...kit, stock: 3 })).toBe('3')
    expect(stockInSaleUnit({ ...bande, stock: 300 })).toBe(3)
  })

  it('quantité commandée : tronçons convertis en mètres', () => {
    expect(formatQuantity(bande, 6)).toBe('0.60 m')
    expect(formatQuantity(kit, 2)).toBe('2')
  })
})

describe('stock — ligne de commande', () => {
  it('« 60 cm » et « / 10 cm » pour la coupe, comme sur la facture', () => {
    expect(lineQuantityLabel({ ...bande, quantity: 6 })).toBe('60 cm')
    expect(lineUnitSuffix(bande)).toBe(' / 10 cm')
    expect(lineQuantityLabel({ ...kit, quantity: 2 })).toBe('2')
    expect(lineUnitSuffix(kit)).toBe('')
  })
})
