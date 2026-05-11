const { pool }     = require('../config/db');
const { AppError } = require('../middlewares/errorHandler');

/* ─────────────────────────────────────────────────────────────────────────────
   MOCK Swiss Post — à remplacer par les vrais appels API Post CH (Barcode API)
   quand le client fournit : CLIENT_ID, CLIENT_SECRET, KUNDENNUMMER, FRANKIERNUMMER

   Format numéro de suivi Swiss Post réel : 99.00.XXXXXX.XXXXXXXX
   Label ID interne : simulé avec un UUID court
───────────────────────────────────────────────────────────────────────────── */

/* Génère un numéro de suivi Swiss Post factice mais réaliste */
const mockTrackingNumber = () => {
  const part1 = String(Math.floor(100000 + Math.random() * 900000))
  const part2 = String(Math.floor(10000000 + Math.random() * 90000000))
  return `99.00.${part1}.${part2}`
}

/* Génère un label ID interne factice */
const mockLabelId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return 'mock-' + Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/**
 * Crée une étiquette Swiss Post (MOCK).
 * Retourne { trackingNumber, labelUrl, labelId }.
 *
 * TODO : remplacer par l'appel réel à la Barcode API La Poste CH :
 *   POST https://wedec.post.ch/WEDECDBarcode/barcode/v1/generateAddressLabel
 *   Headers : Authorization: Bearer <token OAuth2>
 *   Body : { customer, recipient, frankingLicense, printingTemplate, ... }
 */
const createLabel = async ({ order, address }) => {
  /* Validation de l'adresse — comportement identique à la vraie API */
  const recipientName = [
    address.first_name ?? order.first_name ?? '',
    address.last_name  ?? order.last_name  ?? '',
  ].join(' ').trim()

  if (!address.street || !address.city || !address.zip) {
    throw new AppError('Adresse de livraison incomplète — impossible de générer l\'étiquette.', 422)
  }

  /* Simulation d'un délai réseau (~300ms) */
  await new Promise(r => setTimeout(r, 300))

  const trackingNumber = mockTrackingNumber()
  const labelId        = mockLabelId()

  /* URL factice — pointe vers post.ch avec le numéro de suivi */
  const labelUrl = `https://www.post.ch/fr/outils/suivi-de-colis?track=${trackingNumber}`

  return {
    trackingNumber,
    labelUrl,
    labelId,
    carrierId:   'swiss-post-mock',
    serviceCode: 'priority',
    recipient:   recipientName,
    weightKg:    order.items?.reduce((s, i) => s + (parseFloat(i.weight_kg ?? 0.2) * i.quantity), 0) ?? 0.5,
  }
}

/**
 * Génère une étiquette et sauvegarde tracking_number, label_url, label_id dans orders.
 * Utilisée par l'auto-trigger (statut shipped) et le bouton admin manuel.
 */
const generateLabel = async (orderId, order) => {
  const address = {
    first_name: order.first_name,
    last_name:  order.last_name,
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
 * Suivi d'un colis (MOCK).
 * Retourne un statut simulé basé sur le labelId.
 *
 * TODO : remplacer par GET https://wedec.post.ch/api/track/v1/events/<trackingNumber>
 */
const getTrackingByLabelId = async (labelId) => {
  if (!labelId) throw new AppError('Label ID requis.', 400)

  /* Simulation d'un délai réseau */
  await new Promise(r => setTimeout(r, 150))

  return {
    labelId,
    status:      'in_transit',
    description: 'Colis en cours d\'acheminement — Swiss Post (simulé)',
    carrierCode: 'swiss-post',
    events:      [],
  }
}

module.exports = { createLabel, generateLabel, getTrackingByLabelId }
