import { describe, test, expect } from 'vitest'
import { effectiveStyle, contrastRatio, minContrast, mobileSize, nearestWeight, summarize } from './textStyle.js'

const FONTS = [
  { key: 'lora', label: 'Lora', family: 'Lora', fallback: 'serif', category: 'serif', weights: [400, 500, 600, 700], italic: true },
  { key: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', fallback: 'cursive', category: 'script', weights: [400], italic: false },
]
const LOOK = {
  fontKey: 'great-vibes', family: "'Great Vibes', cursive", weight: 400, size: 80, color: '#1e1020',
  align: 'left', italic: false, uppercase: false, underline: false, lineHeight: 1.1, letterSpacing: 0,
}

describe('effectiveStyle', () => {
  test('sans réglage : l\'apparence d\'origine du texte', () => {
    expect(effectiveStyle(undefined, LOOK, FONTS)).toMatchObject({ family: "'Great Vibes', cursive", weight: 400, size: 80, font: FONTS[1] })
  })

  test('les réglages passent par-dessus, la police devient sa pile CSS', () => {
    expect(effectiveStyle({ font: 'lora', weight: 700, italic: true }, LOOK, FONTS))
      .toMatchObject({ family: "'Lora', serif", weight: 700, italic: true, size: 80, font: FONTS[0] })
  })

  test('police d\'origine hors catalogue : gardée telle quelle, sans entrée de catalogue', () => {
    const look = { ...LOOK, fontKey: null, family: "'Playfair Display', serif" }
    expect(effectiveStyle({}, look, FONTS)).toMatchObject({ family: "'Playfair Display', serif", font: null })
  })
})

describe('contrastRatio / minContrast', () => {
  test('noir sur blanc : 21:1 ; blanc sur blanc : 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  test('rose de la boutique sur blanc : lisible (4,6:1) ; rose clair : seulement en grand', () => {
    expect(contrastRatio('#db2777', '#ffffff')).toBeGreaterThan(4.5)
    const light = contrastRatio('#ec4899', '#ffffff')
    expect(light).toBeGreaterThan(3)
    expect(light).toBeLessThan(4.5)
    expect(minContrast(32, 400)).toBe(3)
    expect(minContrast(14, 400)).toBe(4.5)
    expect(minContrast(19, 700)).toBe(3)
  })
})

describe('mobileSize', () => {
  test('même règle que la boutique', () => {
    expect(mobileSize(14)).toBe(14)
    expect(mobileSize(80)).toBe(48)
    expect(mobileSize(22)).toBe(16)
  })
})

describe('nearestWeight', () => {
  test('graisse la plus proche parmi celles de la police', () => {
    expect(nearestWeight([400], 700)).toBe(400)
    expect(nearestWeight([300, 400, 500, 600], 700)).toBe(600)
  })
})

describe('summarize', () => {
  test('résumé lisible des seuls réglages modifiés', () => {
    expect(summarize({ font: 'lora', weight: 700, size: 64, align: 'center', uppercase: false, lineHeight: 1.5 }, FONTS))
      .toBe('Lora · Gras · 64 px · centré · sans majuscules · interligne 1,5')
    expect(summarize(undefined, FONTS)).toBe('')
  })
})
