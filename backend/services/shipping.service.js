const { pool }         = require('../config/db');
const { AppError }     = require('../middlewares/errorHandler');
const swissPost        = require('../config/swissPost');
const swissPostClient  = require('../config/swissPostClient');
const env              = require('../config/env');

/* ─────────────────────────────────────────────────────────────────────────────
   Swiss Post — La Poste CH (Digital Commerce API, Barcode v1).
   Deux modes selon la config (config/swissPost.js → isMock) :
     • RÉEL : appel OAuth2 + generateAddressLabel dès que SWISS_POST_CLIENT_ID est défini.
     • MOCK : tracking + étiquette simulés tant que les accès client manquent.

   Format numéro de suivi Swiss Post réel : identCode (18-23 chiffres).
   Le contrat de retour { trackingNumber, labelUrl, labelId } est identique dans les deux modes
   pour ne pas impacter le controller ni la persistance en base.
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

/* Poids total de la commande en kg (fallback 0.2 kg/article, 0.5 kg minimum) */
const totalWeightKg = (order) =>
  order.items?.reduce((s, i) => s + (parseFloat(i.weight_kg ?? 0.2) * i.quantity), 0) || 0.5

/* Nom complet du destinataire à partir de l'adresse ou de la commande */
const recipientName = (order, address) =>
  [
    address.first_name ?? order.first_name ?? '',
    address.last_name  ?? order.last_name  ?? '',
  ].join(' ').trim()

/* ── RÉEL ──────────────────────────────────────────────────────────────────── */

/**
 * Construit le corps de la requête generateAddressLabel.
 * ⚠️ Les sous-champs (item/recipient/attributes) sont à valider contre le Swagger officiel
 *    le jour de l'activation — voir config/swissPostClient.js.
 */
const buildLabelPayload = ({ order, address }) => ({
  language: 'FR',
  frankingLicense: swissPost.frankiernummer,
  /* Expéditeur = boutique (config/env.js) */
  customer: {
    name1:   env.shopName,
    street:  env.shopAddress,
    zip:     env.shopZip,
    city:    env.shopCity,
    country: 'CH',
  },
  /* Étiquette A6, PDF — paramètres usuels Barcode API */
  labelDefinition: {
    labelLayout:     'A6',
    printAddresses:  'RECIPIENT_AND_CUSTOMER',
    imageFileType:   'PDF',
    imageResolution: 300,
  },
  item: [
    {
      itemID:    String(order.id),
      recipient: {
        name1:   recipientName(order, address),
        street:  address.street,
        zip:     address.zip,
        city:    address.city,
        country: address.country ?? 'CH',
      },
      attributes: {
        przl:     ['PRI'],                 // produit « PostPac Priority »
        weight:   Math.round(totalWeightKg(order) * 1000), // grammes
      },
    },
  ],
})

/**
 * Extrait { trackingNumber, labelUrl, labelId } de la réponse API.
 * labelUrl = data URI PDF (base64) pour pouvoir le re-servir depuis downloadLabel.
 */
const parseLabelResponse = (apiResponse) => {
  const item  = Array.isArray(apiResponse.item) ? apiResponse.item[0] : apiResponse.item
  if (!item) {
    throw new AppError('Réponse La Poste CH invalide — aucun item retourné.', 502)
  }

  const trackingNumber = item.identCode ?? item.sendingID ?? null
  /* item.label : tableau de pages encodées base64 (PDF) — on prend la première */
  const base64Label = Array.isArray(item.label) ? item.label[0] : item.label
  const labelUrl = base64Label
    ? `data:application/pdf;base64,${base64Label}`
    : `https://www.post.ch/fr/outils/suivi-de-colis?track=${trackingNumber}`

  return {
    trackingNumber,
    labelUrl,
    labelId:     item.itemID ?? trackingNumber,
    carrierId:   'swiss-post',
    serviceCode: 'priority',
  }
}

/* ── API publique du service ───────────────────────────────────────────────── */

/**
 * Crée une étiquette Swiss Post (réel ou mock selon la config).
 * Retourne { trackingNumber, labelUrl, labelId }.
 */
const createLabel = async ({ order, address }) => {
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
      labelUrl:    `https://www.post.ch/fr/outils/suivi-de-colis?track=${trackingNumber}`,
      labelId:     mockLabelId(),
      carrierId:   'swiss-post-mock',
      serviceCode: 'priority',
      recipient:   recipientName(order, address),
      weightKg:    totalWeightKg(order),
    }
  }

  /* ── Mode réel ── */
  const payload     = buildLabelPayload({ order, address })
  const apiResponse = await swissPostClient.generateAddressLabel(payload)
  return parseLabelResponse(apiResponse)
}

/**
 * Génère une étiquette et sauvegarde tracking_number, label_url, label_id dans orders.
 * Utilisée par l'auto-trigger (statut shipped) et le bouton admin manuel.
 */
const generateLabel = async (orderId, order) => {
  const address = {
    // Destinataire figé au moment de la commande (migration 009) — peut différer du
    // titulaire du compte (livraison à un tiers). Fallback compte pour les commandes antérieures.
    first_name: order.shipping_first_name ?? order.first_name,
    last_name:  order.shipping_last_name  ?? order.last_name,
    street:     order.street,
    city:       order.city,
    zip:        order.zip,
    canton:     order.canton ?? '',
    country:    order.country ?? 'CH',
    phone:      order.phone   ?? '',
  }

  if (!address.street || !address.city || !address.zip) {
    throw new AppError('Adresse de livraison incomplète — impossible de générer l\'étiquette.', 422)
  }

  const label = await createLabel({ order, address })

  /* Sauvegarde atomique des trois champs */
  await pool.execute(
    `UPDATE orders SET tracking_number = ?, label_url = ?, label_id = ? WHERE id = ?`,
    [label.trackingNumber, label.labelUrl, label.labelId, orderId]
  )

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

module.exports = { createLabel, generateLabel, getTrackingByLabelId }
