import { describe, test, expect } from 'vitest'
import { roundCHF, formatCHF } from './chf.js'

describe('roundCHF — arrondi légal au 0.05 CHF', () => {
  test.each([
    [8.11, 8.10],
    [8.13, 8.15],
    [8.125, 8.15],
    [2.59, 2.60],
    [0, 0],
    [100.02, 100.00],
  ])('roundCHF(%s) = %s', (input, expected) => {
    expect(roundCHF(input)).toBe(expected)
  })

  test('accepte une chaîne', () => {
    expect(roundCHF('8.11')).toBe(8.10)
  })
})

describe('formatCHF', () => {
  // Selon l'ICU de l'environnement, fr-CH varie (espace insécable / apostrophe pour
  // les milliers, . ou , pour les décimales) — on vérifie la structure, \s couvre
  // aussi les espaces insécables ( ,  ).
  test('préfixe CHF + 2 décimales', () => {
    expect(formatCHF(8.1)).toMatch(/^CHF\s8[.,]10$/)
  })

  test('sépare les milliers et arrondit au 0.05', () => {
    expect(formatCHF(1289.94)).toMatch(/^CHF\s1\D?289[.,]95$/)
  })
})
