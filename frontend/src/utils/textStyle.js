/* Mise en forme d'un texte réglée dans l'administration (Contenu du site →
   « Mise en forme » sous chaque texte). Le serveur envoie, par texte, un objet
   dont chaque propriété est facultative : absente, la feuille de style du
   composant s'applique comme avant. `textStyle()` le traduit en attribut style.
   Valeurs déjà validées par le serveur (police du catalogue, couleur #rrggbb,
   tailles bornées) ; la police arrive sous forme de pile CSS. */

// Largeurs de référence : Natel (375 px) et grand écran (1280 px)
const MOBILE_WIDTH = 375
const DESKTOP_WIDTH = 1280

/* Taille fluide. La taille saisie vaut pour un grand écran ; en dessous, un
   grand texte rétrécit progressivement jusqu'à 60 % sur Natel — un titre de
   80 px y couperait les mots. Les textes courants (18 px et moins) gardent
   leur taille, lisible partout. */
export function fluidFontSize(px) {
  if (px <= 18) return `${px}px`
  const min = Math.max(16, Math.round(px * 0.6))
  const slope = (px - min) / (DESKTOP_WIDTH - MOBILE_WIDTH)
  const base = min - slope * MOBILE_WIDTH
  return `clamp(${min}px, calc(${+base.toFixed(2)}px + ${+(slope * 100).toFixed(3)}vw), ${px}px)`
}

// Alignement d'un texte qui est lui-même un conteneur flex (petite ligne décorée d'un trait)
const FLEX_ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'flex-start' }

export function textStyle(style) {
  if (!style || typeof style !== 'object') return undefined
  const css = {}
  if (style.fontFamily) css.fontFamily = style.fontFamily
  if (style.weight) css.fontWeight = style.weight
  if (style.size) css.fontSize = fluidFontSize(style.size)
  if (style.color) css.color = style.color
  if (style.align) {
    css.textAlign = style.align
    /* Dans une colonne flex, un texte ne prend que la largeur de ses mots :
       l'étirer donne à l'alignement toute la largeur du bloc. */
    css.alignSelf = 'stretch'
    css.justifyContent = FLEX_ALIGN[style.align]
  }
  // Booléens : false retire un effet prévu par le site (majuscules d'un sur-titre…)
  if (typeof style.italic === 'boolean') css.fontStyle = style.italic ? 'italic' : 'normal'
  if (typeof style.uppercase === 'boolean') css.textTransform = style.uppercase ? 'uppercase' : 'none'
  if (typeof style.underline === 'boolean') css.textDecoration = style.underline ? 'underline' : 'none'
  if (style.lineHeight) css.lineHeight = style.lineHeight
  if (typeof style.letterSpacing === 'number') css.letterSpacing = `${style.letterSpacing}em`
  return Object.keys(css).length > 0 ? css : undefined
}
