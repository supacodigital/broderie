const settingsRepository = require('../repositories/settings.repository');
const env = require('../config/env');

/* Réglages boutique modifiables depuis l'administration.

   Ces valeurs vivaient uniquement dans le .env : changer les horaires de retrait
   ou l'adresse de facturation imposait un accès SSH au serveur. Elles sont
   désormais éditables dans l'admin, avec repli sur le .env tant qu'aucune
   valeur n'a été saisie — les déploiements existants continuent donc de
   fonctionner sans intervention.

   Un cache court évite de relire la table à chaque email ou facture, sans
   imposer un redémarrage après une modification depuis l'admin. */

const TTL_MS = 60 * 1000;
const cache = new Map(); // groupe → { at, values }

const readGroup = async (group, keys) => {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;

  let values = {};
  try {
    values = await settingsRepository.findSettings(keys);
  } catch (err) {
    // Base indisponible : on n'empêche pas l'envoi d'un email pour autant,
    // le repli .env ci-dessous reste valable.
    console.error('[Réglages] Lecture impossible, repli sur la configuration :', err.message);
  }
  cache.set(group, { at: Date.now(), values });
  return values;
};

// Une valeur vide en base ne remplace pas le repli : « non renseigné » ≠ « effacé »
const pick = (values, key, fallback) => {
  const v = values?.[key];
  return v !== undefined && v !== null && String(v).trim() !== '' ? v : fallback;
};

const getPickupSettings = async () => {
  const v = await readGroup('pickup', settingsRepository.PICKUP_KEYS);
  return {
    name:    pick(v, 'pickup_name',    env.pickupName),
    address: pick(v, 'pickup_address', env.pickupAddress),
    zip:     pick(v, 'pickup_zip',     env.pickupZip),
    city:    pick(v, 'pickup_city',    env.pickupCity),
    hours:   pick(v, 'pickup_hours',   env.pickupHours),
  };
};

const getInvoiceSettings = async () => {
  const v = await readGroup('invoice', settingsRepository.INVOICE_KEYS);
  const days = parseInt(pick(v, 'invoice_due_days', env.invoiceDueDays), 10);
  return {
    name:      pick(v, 'invoice_name',       env.qrInvoiceName),
    // Titulaire (ADM-13) — sans repli serveur : ligne absente tant que non saisie
    owner:     pick(v, 'invoice_owner',      null),
    address:   pick(v, 'invoice_address',    env.qrInvoiceAddress),
    zip:       pick(v, 'invoice_zip',        env.qrInvoiceZip),
    city:      pick(v, 'invoice_city',       env.qrInvoiceCity),
    vatNumber: pick(v, 'invoice_vat_number', env.qrInvoiceVatNumber),
    dueDays:   Number.isInteger(days) && days > 0 ? days : 30,
  };
};

/* Textes des e-mails d'inscription saisis dans l'admin (CLI-11). null tant que
   le champ est vide : l'e-mail garde alors son texte actuel. */
const getEmailSettings = async () => {
  const v = await readGroup('emails', settingsRepository.EMAIL_KEYS);
  return {
    welcomeText: pick(v, 'email_welcome_text', null),
    verifyText:  pick(v, 'email_verify_text',  null),
  };
};

/* Appelé après un enregistrement depuis l'admin : la prochaine facture ou le
   prochain email reprend les nouvelles valeurs sans attendre l'expiration. */
const invalidate = (group) => {
  if (group) cache.delete(group);
  else cache.clear();
};

module.exports = { getPickupSettings, getInvoiceSettings, getEmailSettings, invalidate };
