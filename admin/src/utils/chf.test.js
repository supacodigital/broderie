import { describe, test, expect } from 'vitest'
import { formatCHF, formatCents } from './chf.js'

/* ADM-14 — la TVA se déclare au centime : elle ne suit pas l'arrondi au 0.05
   des montants à payer, sinon l'admin affichait 1.60 pour une facture à 1.61. */
describe('formatCents — montants au centime (TVA)', () => {
  test('garde le centime', () => {
    // Même présentation que formatCHF (séparateurs de la locale fr-CH)
    expect(formatCents(1.61)).toMatch(/^CHF\s1[.,]61$/)
    expect(formatCents('3.37')).toMatch(/^CHF\s3[.,]37$/)
  })

  test('les montants à payer restent arrondis au 0.05', () => {
    expect(formatCHF(1.61)).toMatch(/^CHF\s1[.,]60$/)
  })
})
