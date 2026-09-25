const { AppError }     = require('../middlewares/errorHandler');
const orderRepository  = require('../repositories/order.repository');
const swissPost        = require('../config/swissPost');
const swissPostClient  = require('../config/swissPostClient');
const env              = require('../config/env');
const lengthUtils      = require('../utils/length.utils');

/* ─────────────────────────────────────────────────────────────────────────────
   Swiss Post — La Poste CH (Digital Commerce API, Barcode v1).
   Deux modes selon la config (config/swissPost.js → isMock) :
     • RÉEL : appel OAuth2 + generateAddressLabel dès que SWISS_POST_CLIENT_ID est défini.
     • MOCK : tracking + étiquette simulés tant que les accès client manquent.

   Format numéro de suivi Swiss Post réel : identCode (18-23 chiffres).
   Le contrat de retour { trackingNumber, labelUrl, labelId } est identique dans les deux modes ;
   le mode réel y ajoute labelPdf (PDF binaire de l'étiquette, stocké dans orders.label_pdf).
───────────────────────────────────────────────────────────────────────────── */

/* ── MOCK ──────────────────────────────────────────────────────────────────── */

/* Génère un numéro de suivi Swiss Post factice mais réaliste */
const mockTrackingNumber = () => {
  const part1 = String(Math.floor(100000 + Math.random() * 900000))
  const part2 = String(Math.floor(10000000 + Math.random() * 90000000))
  return `99.00.${part1}.${part2}`
}

/* Génère un label ID interne factice (préfixe « mock- » reconnu par downloadLabel) */
const mockLabelId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return 'mock-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/* ── Helpers communs ───────────────────────────────────────────────────────── */

/* Poids total de la commande en kg (fallback 0.2 kg/article, 0.5 kg minimum).
   Article à la coupe : `weight_kg` est le poids AU MÈTRE et `quantity` un
   nombre de tronçons — 60 cm pèsent 0.6 m, pas 6 articles (même règle que les
   frais de port de la commande, order.service). */
const totalWeightKg = (order) =>
  order.items?.reduce((s, i) => {
    const unitWeight = parseFloat(i.weight_kg ?? 0.2);
    return s + (lengthUtils.isSoldByLength(i)
      ? unitWeight * lengthUtils.lengthFromQuantity(i, i.quantity) / 100
      : unitWeight * i.quantity);
  }, 0) || 0.5

/* Nom complet du destinataire à partir de l'adresse ou de la commande */
const recipientName = (order, address) =>
  [
    address.first_name ?? order.first_name ?? '',
    address.last_name  ?? order.last_name  ?? '',
  ].join(' ').trim()

/* Produits La Poste proposés à l'expédition (ADM-10 — « PostPac Economy /
   Priority ») : Economy livre en 2 jours ouvrables, Priority le jour ouvrable
   suivant. L'étiquette était toujours émise en Priority, le plus cher. */
const LABEL_PRODUCTS = {
  ECO: 'PostPac Economy',
  PRI: 'PostPac Priority',
}
const DEFAULT_LABEL_PRODUCT = 'PRI' // comportement historique quand rien n'est précisé
const isLabelProduct = (code) => Object.prototype.hasOwnProperty.call(LABEL_PRODUCTS, code)

/* ── RÉEL ──────────────────────────────────────────────────────────────────── */

/* Longueurs maximales de la Barcode API (manuel La Poste) : destinataire — noms,
   complément, rue et localité 35 caractères, numéro 10 ; expéditeur — 25
   caractères par champ. `undefined` retire le champ du JSON. */
const clip = (value, max) => {
  const text = value == null ? '' : String(value).trim()
  return text ? text.slice(0, max) : undefined
}

/* Lien public de suivi d'un envoi La Poste */
const trackingUrl = (identCode) => `https://www.post.ch/fr/outils/suivi-de-colis?track=${identCode}`

/**
 * Construit le corps de la requête generateAddressLabel, calqué sur l'exemple
 * officiel (developer.post.ch/en/digital-commerce-api) : `item` est UN objet —
 * envoyé en tableau, La Poste répondait HTTP 400 sans explication.
 */
const buildLabelPayload = ({ order, address, product = DEFAULT_LABEL_PRODUCT }) => ({
  language: 'FR',
  frankingLicense: swissPost.frankiernummer,
  /* Expéditeur = boutique (config/env.js) — champs limités à 25 caractères */
  customer: {
    name1:   clip(env.shopName, 25),
    street:  clip(env.shopAddress, 25),
    zip:     clip(env.shopZip, 6),
    city:    clip(env.shopCity, 25),
    country: 'CH',
  },
  /* Étiquette A6, PDF. printPreview : « SPECIMEN », hors production */
  labelDefinition: {
    labelLayout:     'A6',
    printAddresses:  'RECIPIENT_AND_CUSTOMER',
    imageFileType:   'PDF',
    imageResolution: 300,
    printPreview:    Boolean(swissPost.printPreview),
  },
  item: {
    itemID:    String(order.id),
    recipient: {
      name1:   clip(recipientName(order, address), 35),
      // Complément (c/o, bâtiment, appartement) : ligne imprimée entre le nom et la rue
      addressSuffix: clip(address.complement, 35),
      street:  clip(address.street, 35),
      houseNo: clip(address.street_number, 10),
      zip:     clip(address.zip, 10),
      city:    clip(address.city, 35),
      country: address.country ?? 'CH',
    },
    attributes: {
      przl:   [product],                               // ECO « PostPac Economy » ou PRI « PostPac Priority »
      weight: Math.round(totalWeightKg(order) * 1000), // grammes
    },
  },
})

/* Motifs de refus renvoyés par La Poste : [{ code: 'E1234', message }] */
const describePostErrors = (errors) => (Array.isArray(errors) ? errors : [])
  .map((e) => [e?.code ?? e?.errorCode, e?.message ?? e?.errorText ?? e?.description].filter(Boolean).join(' '))
  .filter(Boolean)
  .join(' · ')

/* Message affiché dans l'admin quand l'appel à La Poste échoue */
const postFailureMessage = (err) => {
  if (!err.status) return 'Impossible de joindre La Poste pour générer l\'étiquette. Réessayez dans quelques minutes.'
  let body = null
  try { body = JSON.parse(err.detail) } catch { /* corps vide ou texte brut */ }
  const reasons = describePostErrors(body?.errors ?? body?.item?.errors)
  return `La Poste a refusé la demande d'étiquette (HTTP ${err.status})${reasons ? ` : ${reasons}` : ', sans préciser la raison.'}`
}

/**
 * Extrait { trackingNumber, labelPdf, labelUrl, labelId } de la réponse API.
 * L'étiquette (base64) est décodée en PDF binaire, stocké à part (orders.label_pdf) :
 * elle ne tenait pas dans label_url (500 caractères).
 */
const parseLabelResponse = (apiResponse, product = DEFAULT_LABEL_PRODUCT) => {
  const item = Array.isArray(apiResponse?.item) ? apiResponse.item[0] : apiResponse?.item
  if (!item) {
    throw new AppError('Réponse La Poste CH invalide — aucun envoi retourné.', 502)
  }
  if (Array.isArray(item.warnings) && item.warnings.length) {
    console.warn('[La Poste CH] Avertissements étiquette :', describePostErrors(item.warnings))
  }

  /* item.label : pages encodées en base64 — une seule pour une étiquette A6 */
  const base64Label = Array.isArray(item.label) ? item.label[0] : item.label
  if (!item.identCode || !base64Label) {
    const reasons = describePostErrors(item.errors)
    throw new AppError(`La Poste n'a pas généré l'étiquette${reasons ? ` : ${reasons}` : '.'}`, 502)
  }

  return {
    trackingNumber: item.identCode,
    labelPdf:       Buffer.from(base64Label, 'base64'),
    labelUrl:       trackingUrl(item.identCode),
    labelId:        item.itemID ?? item.identCode,
    carrierId:      'swiss-post',
    serviceCode:    product === 'ECO' ? 'economy' : 'priority',
  }
}

/* ── API publique du service ───────────────────────────────────────────────── */

/**
 * Crée une étiquette Swiss Post (réel ou mock selon la config).
 * Retourne { trackingNumber, labelUrl, labelId }.
 */
const createLabel = async ({ order, address, product = DEFAULT_LABEL_PRODUCT }) => {
  if (!isLabelProduct(product)) {
    throw new AppError('Produit La Poste inconnu — choisir PostPac Economy ou Priority.', 400)
  }
  /* Validation de l'adresse — comportement identique dans les deux modes */
  if (!address.street || !address.city || !address.zip) {
    throw new AppError('Adresse de livraison incomplète — impossible de générer l\'étiquette.', 422)
  }

  /* ── Mode mock ── */
  if (swissPost.isMock) {
    await new Promise(r => setTimeout(r, 300)) // simulation délai réseau
    const trackingNumber = mockTrackingNumber()
    return {
      trackingNumber,
      labelUrl:    trackingUrl(trackingNumber),
      labelId:     mockLabelId(),
      carrierId:   'swiss-post-mock',
      serviceCode: product === 'ECO' ? 'economy' : 'priority',
      recipient:   recipientName(order, address),
      weightKg:    totalWeightKg(order),
    }
  }

  /* ── Mode réel ── */
  const payload = buildLabelPayload({ order, address, product })
  let apiResponse
  try {
    apiResponse = await swissPostClient.generateAddressLabel(payload)
  } catch (err) {
    console.error('[La Poste CH] Étiquette refusée — commande', order.id, ':', err.message)
    throw new AppError(postFailureMessage(err), 502)
  }
  return parseLabelResponse(apiResponse, product)
}

/**
 * Génère une étiquette et sauvegarde tracking_number, label_url, label_id dans orders.
 * Utilisée par l'auto-trigger (statut shipped) et le bouton admin manuel.
 */
const generateLabel = async (orderId, order, { product = DEFAULT_LABEL_PRODUCT } = {}) => {
  const address = {
    // Destinataire figé au moment de la commande (migration 009) — peut différer du
    // titulaire du compte (livraison à un tiers). Fallback compte pour les commandes antérieures.
    first_name: order.shipping_first_name ?? order.first_name,
    last_name:  order.shipping_last_name  ?? order.last_name,
    complement: order.shipping_complement,
    street:     order.shipping_street,
    street_number: order.shipping_street_number,
    city:       order.shipping_city,
    zip:        order.shipping_zip,
    canton:     order.shipping_canton ?? '',
    country:    order.shipping_country ?? 'CH',
    /* Numéro donné au checkout (`order.phone` n'a jamais existé). Pas transmis à
       La Poste : l'exemple officiel ne comporte pas de téléphone destinataire. */
    phone:      order.shipping_phone ?? '',
  }

  if (!address.street || !address.city || !address.zip) {
    throw new AppError('Adresse de livraison incomplète — impossible de générer l\'étiquette.', 422)
  }

  const label = await createLabel({ order, address, product })

  await orderRepository.saveShippingLabel(orderId, {
    trackingNumber: label.trackingNumber,
    labelUrl:       label.labelUrl,
    labelId:        label.labelId,
    labelPdf:       label.labelPdf ?? null,
  })

  return label
}

/**
 * Suivi d'un colis.
 * MOCK : statut simulé. RÉEL : à brancher sur l'API de suivi La Poste CH le jour de l'activation
 *        (endpoint de tracking distinct de la Barcode API — scope/URL à confirmer au Swagger).
 */
const getTrackingByLabelId = async (labelId) => {
  if (!labelId) throw new AppError('Label ID requis.', 400)

  await new Promise(r => setTimeout(r, 150)) // simulation délai réseau

  return {
    labelId,
    status:      'in_transit',
    description: swissPost.isMock
      ? 'Colis en cours d\'acheminement — Swiss Post (simulé)'
      : 'Colis en cours d\'acheminement — Swiss Post',
    carrierCode: 'swiss-post',
    events:      [],
  }
}

module.exports = { createLabel, generateLabel, getTrackingByLabelId, LABEL_PRODUCTS, isLabelProduct }
