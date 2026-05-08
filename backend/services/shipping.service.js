const shipengine  = require('../config/shipengine');
const { AppError } = require('../middlewares/errorHandler');

/* Identifiant transporteur Swiss Post configuré dans le compte ShipEngine */
const SWISS_POST_CARRIER_ID = process.env.SHIPENGINE_SWISS_POST_CARRIER_ID ?? '';

/* Compte expéditeur de la boutique */
const SENDER = {
  name:        process.env.SHOP_NAME          ?? 'Au Point-Compté',
  phone:       process.env.SHOP_PHONE         ?? '+41000000000',
  addressLine1: process.env.SHOP_ADDRESS      ?? 'Rue de la Boutique 1',
  cityLocality: process.env.SHOP_CITY         ?? 'Genève',
  stateProvince: process.env.SHOP_CANTON      ?? 'GE',
  postalCode:   process.env.SHOP_ZIP          ?? '1200',
  countryCode:  'CH',
};

/**
 * Crée une étiquette Swiss Post pour une commande.
 * Retourne { trackingNumber, labelUrl, labelPdf } ou lève une AppError.
 */
const createLabel = async ({ order, address }) => {
  if (!shipengine) {
    throw new AppError('ShipEngine non configuré — SHIPENGINE_API_KEY manquante.', 503);
  }
  if (!SWISS_POST_CARRIER_ID) {
    throw new AppError('SHIPENGINE_SWISS_POST_CARRIER_ID manquant dans les variables d\'environnement.', 503);
  }

  const weightKg = order.items?.reduce((sum, item) => {
    return sum + (parseFloat(item.weight_kg ?? 0.2) * item.quantity);
  }, 0) ?? 0.5;

  const shipmentParams = {
    shipFrom: SENDER,
    shipTo: {
      name:         `${address.first_name} ${address.last_name}`,
      phone:         address.phone ?? '',
      addressLine1:  address.street,
      cityLocality:  address.city,
      stateProvince: address.canton ?? '',
      postalCode:    address.zip,
      countryCode:   'CH',
    },
    packages: [{
      weight: { value: Math.max(0.1, weightKg), unit: 'kilogram' },
    }],
  };

  const [rate] = await shipengine.getRatesWithShipmentDetails({
    shipmentParams,
    rateOptions: {
      carrierIds: [SWISS_POST_CARRIER_ID],
    },
  }).then(res => res.rateResponse?.rates ?? []);

  if (!rate) {
    throw new AppError('Aucun tarif Swiss Post disponible pour cette expédition.', 502);
  }

  const label = await shipengine.createLabelFromRate({ rateId: rate.rateId });

  return {
    trackingNumber: label.trackingNumber,
    labelUrl:       label.labelDownload?.href ?? null,
    labelPdf:       label.labelDownload?.pdf  ?? null,
    carrierId:      label.carrierId,
    serviceCode:    label.serviceCode,
  };
};

/**
 * Récupère les informations de suivi d'un colis.
 */
const getTracking = async (trackingNumber) => {
  if (!shipengine) {
    throw new AppError('ShipEngine non configuré.', 503);
  }
  return shipengine.trackUsingLabelId(trackingNumber);
};

module.exports = { createLabel, getTracking };
