import { describe, it, expect } from 'vitest'
import { pageDraft, bannerDraft } from './previewDraft.js'
import { toShopStyles } from '../../utils/textStyle.js'

/* Aperçu en direct : le brouillon doit avoir exactement la forme que la
   boutique reçoit du serveur (GET /legal/…), sinon l'aperçu mentirait. */
const FONTS = [
  { key: 'lora', label: 'Lora', family: 'Lora', fallback: 'serif', weights: [400, 700] },
  { key: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', fallback: 'cursive', weights: [400] },
]

describe('toShopStyles', () => {
  it('la clé de police devient la pile CSS, le reste passe tel quel', () => {
    expect(toShopStyles({ hero_title: { font: 'lora', weight: 700, italic: false } }, FONTS))
      .toEqual({ hero_title: { fontFamily: "'Lora', serif", weight: 700, italic: false } })
  })

  it('une police absente du catalogue est ignorée, comme sur le serveur', () => {
    expect(toShopStyles({ hero_title: { font: 'comic-sans', size: 40 } }, FONTS))
      .toEqual({ hero_title: { size: 40 } })
  })

  it('aucune mise en forme : objet vide', () => {
    expect(toShopStyles(undefined, FONTS)).toEqual({})
  })
})

describe('pageDraft', () => {
  it('textes tels quels (vides compris : la boutique garde alors son texte) et styles convertis', () => {
    expect(pageDraft({ hero_title: 'Titre', hero_desc: '' }, { hero_title: { font: 'great-vibes' } }, FONTS))
      .toEqual({ hero_title: 'Titre', hero_desc: '', styles: { hero_title: { fontFamily: "'Great Vibes', cursive" } } })
  })
})

describe('bannerDraft', () => {
  const base = { banner_enabled: '1', banner_text: '  Fermé le 1er août  ', banner_link: '' }

  it('bandeau affiché : texte nettoyé, sans lien ni mise en forme', () => {
    expect(bannerDraft(base, undefined, FONTS)).toEqual({ text: 'Fermé le 1er août', link: null, style: null })
  })

  it('masqué, ou affiché sans texte : rien sur la boutique', () => {
    expect(bannerDraft({ ...base, banner_enabled: '0' }, undefined, FONTS)).toBeNull()
    expect(bannerDraft({ ...base, banner_text: '   ' }, undefined, FONTS)).toBeNull()
  })

  it('mise en forme convertie comme pour les pages', () => {
    expect(bannerDraft(base, { font: 'lora', weight: 700 }, FONTS).style)
      .toEqual({ fontFamily: "'Lora', serif", weight: 700 })
  })

  it('lien : une page du site seulement, sinon bandeau non cliquable', () => {
    expect(bannerDraft({ ...base, banner_link: '/catalogue?sort=price_chf' }, undefined, FONTS).link).toBe('/catalogue?sort=price_chf')
    expect(bannerDraft({ ...base, banner_link: 'https://pirate.example' }, undefined, FONTS).link).toBeNull()
    expect(bannerDraft({ ...base, banner_link: '//pirate.example' }, undefined, FONTS).link).toBeNull()
    expect(bannerDraft({ ...base, banner_link: 'javascript:alert(1)' }, undefined, FONTS).link).toBeNull()
  })
})
