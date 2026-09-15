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
    // Transaction : la grille TVA est appliquée en bloc ou pas du tout.
    await settingsRepository.updateTaxRatesBulk(rates);
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
    // Transaction : la grille tarifaire est appliquée en bloc ou pas du tout.
    await settingsRepository.updateShippingRatesBulk(rates);
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

/* ── GET /admin/settings/banner ── */
const getBannerSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.BANNER_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/banner ── */
// Le texte est court par nature (une ligne en haut de page) ; au-delà il déborderait
// sur mobile. Le lien est restreint aux chemins internes (« /catalogue ») : accepter
// une URL externe ferait du bandeau un vecteur de redirection si le compte admin
// était compromis, et le cas d'usage ne le demande pas.
const MAX_BANNER_LENGTH = 200;

/* Valide un lien de bandeau et renvoie le chemin interne, ou null s'il est refusé.
   On analyse l'URL plutôt que de filtrer des caractères : « //evil.com » ne contient
   que des caractères légitimes d'un chemin et commence bien par « / », mais un
   navigateur y lit une URL protocole-relative et quitte le site. Idem pour
   « https://evil.com » ou « javascript:… ».
   La méthode : résoudre contre une origine sentinelle et n'accepter que ce qui y
   reste. Le chemin est ensuite reconstruit depuis l'objet URL, donc jamais repris
   tel quel de la saisie. */
const SENTINEL_ORIGIN = 'http://banner.invalid';

const toInternalPath = (value) => {
  let url;
  try {
    url = new URL(value, SENTINEL_ORIGIN);
  } catch {
    return null;
  }
  // Une saisie qui change d'origine visait un autre domaine (ou un autre protocole)
  if (url.origin !== SENTINEL_ORIGIN) return null;
  return `${url.pathname}${url.search}${url.hash}`;
};

const updateBannerSettings = async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of settingsRepository.BANNER_KEYS) {
      const raw = req.body[key];
      if (raw === undefined) continue;

      if (key === 'banner_enabled') {
        // Accepte booléen ou '1'/'0' — normalisé en texte pour la colonne
        allowed[key] = (raw === true || raw === '1' || raw === 1) ? '1' : '0';
        continue;
      }
      if (typeof raw !== 'string') {
        return res.status(400).json({
          success: false, message: 'Données invalides.',
          errors: [{ field: key, message: 'Le contenu doit être du texte.' }],
        });
      }
      if (raw.length > MAX_BANNER_LENGTH) {
        return res.status(400).json({
          success: false, message: 'Données invalides.',
          errors: [{ field: key, message: `Texte trop long (max ${MAX_BANNER_LENGTH} caractères).` }],
        });
      }
      if (key === 'banner_link' && raw.trim()) {
        const path = toInternalPath(raw.trim());
        if (!path) {
          return res.status(400).json({
            success: false, message: 'Données invalides.',
            errors: [{ field: key, message: 'Le lien doit être une page du site, commençant par « / » (ex. /catalogue).' }],
          });
        }
        // On stocke le chemin reconstruit, jamais la saisie brute
        allowed[key] = path;
        continue;
      }
      allowed[key] = raw.trim();
    }
    await settingsRepository.upsertSettings(allowed);
    const data = await settingsRepository.findSettings(settingsRepository.BANNER_KEYS);
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
  getBannerSettings, updateBannerSettings,
};
