import { toShopStyles } from '../../utils/textStyle.js'

/* Aperçu en direct : le brouillon d'une page, mis sous la forme exacte de la
   réponse publique que la boutique lit (backend controllers/legal.controller.js).
   La boutique l'affiche alors comme si c'était enregistré. */

// Accueil, Notre Histoire, textes légaux : { ...textes, styles }
export const pageDraft = (values, styles, fonts) => ({ ...values, styles: toShopStyles(styles, fonts) })

/* Lien du bandeau : une page du site uniquement, même règle que le serveur
   (settings.controller.js, toInternalPath). Sinon le bandeau n'est pas cliquable. */
const PROBE_ORIGIN = 'https://apercu.invalid'
function internalPath(value) {
  const raw = (value ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw, PROBE_ORIGIN)
    return url.origin === PROBE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}

/* Bandeau : { text, link, style } s'il est affiché, null s'il est masqué ou
   vide — comme la boutique le reçoit (GET /legal/banner). */
export function bannerDraft(values, style, fonts) {
  const text = (values.banner_text ?? '').trim()
  if (values.banner_enabled !== '1' || !text) return null
  const shopStyle = style ? toShopStyles({ banner_text: style }, fonts).banner_text : null
  return { text, link: internalPath(values.banner_link), style: shopStyle }
}
