/* Mise en forme des textes du site (Contenu du site → « Mise en forme »).

   Une mise en forme ne stocke que ce qui s'écarte de l'apparence prévue par la
   boutique : { font, weight, size, color, align, italic, uppercase, underline,
   lineHeight, letterSpacing }, chaque propriété facultative. Pour afficher des
   réglages et un aperçu justes, l'administration connaît l'apparence d'origine
   de chaque texte (`look`, voir pages/Content/contentSections.js) : le style
   effectif = l'apparence d'origine, puis les réglages par-dessus. */

export const WEIGHT_LABELS = {
  100: 'Très fin', 200: 'Extra-fin', 300: 'Fin', 400: 'Normal', 500: 'Moyen',
  600: 'Demi-gras', 700: 'Gras', 800: 'Extra-gras', 900: 'Noir',
}

export const CATEGORY_LABELS = { sans: 'Sans empattement', serif: 'Avec empattement', script: 'Manuscrites' }

export const ALIGN_LABELS = { left: 'À gauche', center: 'Centré', right: 'À droite', justify: 'Justifié' }

/* Couleurs de la boutique (frontend/src/index.css), proposées en premier pour
   rester dans la charte ; toute autre couleur reste possible. */
export const PALETTE = [
  { value: '#db2777', label: 'Rose' },
  { value: '#be185d', label: 'Rose foncé' },
  { value: '#831843', label: 'Bordeaux' },
  { value: '#9d6480', label: 'Vieux rose' },
  { value: '#a16207', label: 'Or' },
  { value: '#1e1020', label: 'Prune presque noire' },
  { value: '#374151', label: 'Gris ardoise' },
  { value: '#ffffff', label: 'Blanc' },
]

// Bornes — identiques à la validation du serveur (validators/contentStyle.validator.js)
export const LIMITS = {
  size:          { min: 10,   max: 120, step: 1 },
  lineHeight:    { min: 0.8,  max: 3,   step: 0.05 },
  letterSpacing: { min: -0.1, max: 0.5, step: 0.01 },
}

export const fontStack = (font) => `'${font.family}', ${font.fallback}`

/* Taille sur Natel d'un texte agrandi dans l'administration — même règle que la
   boutique (frontend/src/utils/textStyle.js) : pleine taille sur grand écran,
   60 % sur Natel, jamais sous 16 px ; 18 px et moins ne changent pas. */
export const mobileSize = (px) => (px <= 18 ? px : Math.max(16, Math.round(px * 0.6)))

// Graisse disponible la plus proche (changement de police)
export const nearestWeight = (weights, weight) =>
  weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0])

/* Style effectif : apparence d'origine du texte, puis réglages par-dessus.
   `font` : entrée du catalogue, ou null quand la police d'origine n'y figure
   pas (ex. « Playfair Display », jamais chargée : le navigateur la remplace). */
export function effectiveStyle(value, look, fonts) {
  const v = value ?? {}
  const fontKey = v.font ?? look.fontKey ?? null
  const font = fontKey ? fonts.find(f => f.key === fontKey) ?? null : null
  return {
    fontKey,
    font,
    family: v.font && font ? fontStack(font) : look.family,
    weight: v.weight ?? look.weight,
    size: v.size ?? look.size,
    color: v.color ?? look.color,
    align: v.align ?? look.align,
    italic: v.italic ?? look.italic,
    uppercase: v.uppercase ?? look.uppercase,
    underline: v.underline ?? look.underline,
    lineHeight: v.lineHeight ?? look.lineHeight,
    letterSpacing: v.letterSpacing ?? look.letterSpacing,
  }
}

// Style React de l'aperçu, à la taille grand écran
export function previewCss(eff) {
  return {
    fontFamily: eff.family,
    fontWeight: eff.weight,
    fontSize: `${eff.size}px`,
    color: eff.color,
    textAlign: eff.align,
    fontStyle: eff.italic ? 'italic' : 'normal',
    textTransform: eff.uppercase ? 'uppercase' : 'none',
    textDecoration: eff.underline ? 'underline' : 'none',
    lineHeight: eff.lineHeight,
    letterSpacing: `${eff.letterSpacing}em`,
  }
}

/* Mises en forme d'une page sous la forme que la boutique reçoit du serveur
   (backend utils/contentStyle.utils.js, toShopStyles) : la clé de police
   devient la pile CSS, une police absente du catalogue est ignorée. Sert à
   l'aperçu en direct, qui montre la page avant tout enregistrement. */
export function toShopStyles(styles, fonts) {
  return Object.fromEntries(Object.entries(styles ?? {}).map(([key, { font, ...rest }]) => {
    const known = font ? fonts.find(f => f.key === font) : null
    return [key, known ? { ...rest, fontFamily: fontStack(known) } : rest]
  }))
}

/* Contraste WCAG entre deux couleurs #rrggbb (1 à 21). */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/* Minimum WCAG AA : 4,5:1, ou 3:1 pour un grand texte (24 px, ou 18,66 px en gras). */
export const minContrast = (size, weight) => (size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5)

/* Résumé d'une mise en forme, pour l'afficher replié : « Lora · Gras · 64 px ». */
export function summarize(value, fonts) {
  if (!value) return ''
  const parts = []
  if (value.font) parts.push(fonts.find(f => f.key === value.font)?.label ?? value.font)
  if (value.weight) parts.push(WEIGHT_LABELS[value.weight] ?? value.weight)
  if (value.size) parts.push(`${value.size} px`)
  if (value.color) parts.push(value.color)
  if (value.align) parts.push(ALIGN_LABELS[value.align].toLowerCase())
  if (value.italic !== undefined) parts.push(value.italic ? 'italique' : 'sans italique')
  if (value.uppercase !== undefined) parts.push(value.uppercase ? 'majuscules' : 'sans majuscules')
  if (value.underline !== undefined) parts.push(value.underline ? 'souligné' : 'sans soulignement')
  if (value.lineHeight !== undefined) parts.push(`interligne ${String(value.lineHeight).replace('.', ',')}`)
  if (value.letterSpacing !== undefined) parts.push(`espacement ${String(value.letterSpacing).replace('.', ',')}`)
  return parts.join(' · ')
}
