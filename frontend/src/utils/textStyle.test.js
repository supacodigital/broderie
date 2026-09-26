import { describe, test, expect } from 'vitest'
import { textStyle, fluidFontSize } from './textStyle.js'

describe('textStyle', () => {
  test('aucune mise en forme : le composant garde sa feuille de style', () => {
    expect(textStyle(undefined)).toBeUndefined()
    expect(textStyle(null)).toBeUndefined()
    expect(textStyle({})).toBeUndefined()
  })

  test('traduit chaque réglage en propriété CSS', () => {
    expect(textStyle({
      fontFamily: "'Lora', serif", weight: 700, size: 16, color: '#aa3366',
      italic: true, uppercase: true, underline: true, lineHeight: 1.6, letterSpacing: 0.05,
    })).toEqual({
      fontFamily: "'Lora', serif", fontWeight: 700, fontSize: '16px', color: '#aa3366',
      fontStyle: 'italic', textTransform: 'uppercase', textDecoration: 'underline',
      lineHeight: 1.6, letterSpacing: '0.05em',
    })
  })

  test('false retire un effet prévu par le site (sur-titre en majuscules, sous-titre en italique)', () => {
    expect(textStyle({ uppercase: false, italic: false, underline: false, letterSpacing: 0 })).toEqual({
      textTransform: 'none', fontStyle: 'normal', textDecoration: 'none', letterSpacing: '0em',
    })
  })

  test('alignement : le texte s\'étire sur la largeur du bloc pour que l\'alignement se voie', () => {
    expect(textStyle({ align: 'center' })).toEqual({ textAlign: 'center', alignSelf: 'stretch', justifyContent: 'center' })
    expect(textStyle({ align: 'right' }).justifyContent).toBe('flex-end')
  })
})

describe('fluidFontSize', () => {
  test('texte courant (18 px et moins) : taille fixe', () => {
    expect(fluidFontSize(14)).toBe('14px')
    expect(fluidFontSize(18)).toBe('18px')
  })

  test('grand texte : pleine taille sur grand écran, 60 % sur Natel', () => {
    const value = fluidFontSize(80)
    expect(value).toMatch(/^clamp\(48px, calc\(.+px \+ .+vw\), 80px\)$/)
    // La formule vaut exactement 48 px à 375 px de large et 80 px à 1280 px
    const [, base, vw] = value.match(/calc\(([\d.-]+)px \+ ([\d.]+)vw\)/).map(Number)
    expect(base + vw * 3.75).toBeCloseTo(48, 1)
    expect(base + vw * 12.8).toBeCloseTo(80, 1)
  })

  test('jamais sous 16 px, même pour un texte moyen', () => {
    expect(fluidFontSize(22)).toMatch(/^clamp\(16px,/)
  })
})
