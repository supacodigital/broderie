const settingsRepository = require('../../repositories/settings.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { cache } = require('../../config/cache');

/* Invalide le cache TVA et frais de port */
const invalidateCache = () => {
  const keysToDelete = cache.keys().filter(k =>
    k.startsWith('tax_rates') || k.startsWith('shipping')
  );
  if (keysToDelete.length) cache.del(keysToDelete);
};

/* ── GET /admin/settings/tax-rates ── */
const getTaxRates = async (req, res, next) => {
  try {
    const rates = await settingsRepository.findAllTaxRates();
    res.json({ success: true, data: rates });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/tax-rates ── */
const updateTaxRates = async (req, res, next) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0) {
      return next(new AppError('Tableau de taux requis.', 400));
    }
    for (const r of rates) {
      if (!r.id || r.rate == null) continue;
      await settingsRepository.updateTaxRate(r.id, { rate: r.rate });
    }
    invalidateCache();
    const updated = await settingsRepository.findAllTaxRates();
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/* ── GET /admin/settings/shipping ── */
const getShippingRates = async (req, res, next) => {
  try {
    const rates = await settingsRepository.findAllShippingRates();
    res.json({ success: true, data: rates });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/shipping ── */
const updateShippingRates = async (req, res, next) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0) {
      return next(new AppError('Tableau de tarifs requis.', 400));
    }
    for (const r of rates) {
      if (!r.id) continue;
      await settingsRepository.updateShippingRate(r.id, {
        priceChf:      r.priceChf,
        estimatedDays: r.estimatedDays,
      });
    }
    invalidateCache();
    const updated = await settingsRepository.findAllShippingRates();
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/* ── GET /admin/settings/store ── */
const getStoreSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.STORE_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/store ── */
const updateStoreSettings = async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of settingsRepository.STORE_KEYS) {
      if (req.body[key] !== undefined) allowed[key] = req.body[key];
    }
    await settingsRepository.upsertSettings(allowed);
    const data = await settingsRepository.findSettings(settingsRepository.STORE_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── GET /admin/settings/legal ── */
const getLegalSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.LEGAL_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/legal ── */
// Textes légaux : borne à 50 000 caractères (colonne TEXT ≈ 65 535 octets) et
// n'accepte que des chaînes. Le rendu front est du texte brut (React échappe) —
// pas de sanitisation HTML nécessaire tant qu'il n'y a pas de dangerouslySetInnerHTML.
const MAX_LEGAL_LENGTH = 50000;

const updateLegalSettings = async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of settingsRepository.LEGAL_KEYS) {
      const raw = req.body[key];
      if (raw === undefined) continue;
      if (typeof raw !== 'string') {
        return res.status(400).json({
          success: false, message: 'Données invalides.',
          errors: [{ field: key, message: 'Le contenu doit être du texte.' }],
        });
      }
      if (raw.length > MAX_LEGAL_LENGTH) {
        return res.status(400).json({
          success: false, message: 'Données invalides.',
          errors: [{ field: key, message: `Contenu trop long (max ${MAX_LEGAL_LENGTH} caractères).` }],
        });
      }
      allowed[key] = raw;
    }
    await settingsRepository.upsertSettings(allowed);
    const data = await settingsRepository.findSettings(settingsRepository.LEGAL_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTaxRates, updateTaxRates,
  getShippingRates, updateShippingRates,
  getStoreSettings, updateStoreSettings,
  getLegalSettings, updateLegalSettings,
};
