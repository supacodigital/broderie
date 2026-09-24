const settingsRepository = require('../../repositories/settings.repository');
const { AppError } = require('../../middlewares/errorHandler');
const shopSettingsService = require('../../services/shopSettings.service');
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
/* Grille complète (ADM-10) : tranches { maxWeight, priceChf, estimatedDays }.
   Renvoie les tranches triées et validées, ou une erreur de champ. */
const MAX_SHIPPING_TIERS = 12;
const parseShippingTiers = (rates) => {
  if (rates.length > MAX_SHIPPING_TIERS) {
    return { error: { field: 'rates', message: `${MAX_SHIPPING_TIERS} tranches au maximum.` } };
  }
  const tiers = [];
  for (const [i, r] of rates.entries()) {
    const maxWeight = Number(r.maxWeight);
    // Champ vide ≠ 0 : Number('') vaudrait 0, soit une livraison gratuite
    const priceChf = r.priceChf === '' || r.priceChf == null ? NaN : Number(r.priceChf);
    const estimatedDays = r.estimatedDays == null ? null : String(r.estimatedDays).trim().slice(0, 20);
    if (!Number.isFinite(maxWeight) || maxWeight <= 0 || maxWeight > 1000) {
      return { error: { field: `rates.${i}.maxWeight`, message: 'Poids maximum invalide (entre 0 et 1000 kg).' } };
    }
    // Frais de port toujours payants (règle projet) : pas de tranche à CHF 0
    if (!Number.isFinite(priceChf) || priceChf <= 0 || priceChf > 999) {
      return { error: { field: `rates.${i}.priceChf`, message: 'Tarif invalide : les frais de port sont toujours payants (entre CHF 0.05 et 999).' } };
    }
    tiers.push({ maxWeight: Math.round(maxWeight * 1000) / 1000, priceChf, estimatedDays });
  }
  tiers.sort((a, b) => a.maxWeight - b.maxWeight);
  if (tiers.some((t, i) => i > 0 && t.maxWeight === tiers[i - 1].maxWeight)) {
    return { error: { field: 'rates', message: 'Deux tranches ont le même poids maximum.' } };
  }
  return { tiers };
};

const updateShippingRates = async (req, res, next) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates) || rates.length === 0) {
      return next(new AppError('Tableau de tarifs requis.', 400));
    }
    if (rates.every((r) => r && r.maxWeight !== undefined)) {
      // Grille complète, tranches de poids comprises (ADM-10)
      const { tiers, error } = parseShippingTiers(rates);
      if (error) {
        return res.status(400).json({ success: false, message: 'Données invalides.', errors: [error] });
      }
      await settingsRepository.replaceShippingRates(tiers);
    } else {
      // Ancien format : prix et délai seuls, par identifiant de tranche.
      // Transaction : la grille tarifaire est appliquée en bloc ou pas du tout.
      await settingsRepository.updateShippingRatesBulk(rates);
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

/* Validation commune aux textes éditoriaux (légaux, page « Notre Histoire ») :
   chaînes uniquement, bornées. Retourne un message d'erreur, ou null si tout va bien. */
const collectTextSettings = (body, allowedKeys) => {
  const values = {};
  for (const key of allowedKeys) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      return { error: { field: key, message: 'Le contenu doit être du texte.' } };
    }
    if (raw.length > MAX_LEGAL_LENGTH) {
      return { error: { field: key, message: `Contenu trop long (max ${MAX_LEGAL_LENGTH} caractères).` } };
    }
    values[key] = raw;
  }
  return { values };
};

const updateLegalSettings = async (req, res, next) => {
  try {
    const { values, error } = collectTextSettings(req.body, settingsRepository.LEGAL_KEYS);
    if (error) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [error] });
    }
    await settingsRepository.upsertSettings(values);
    const data = await settingsRepository.findSettings(settingsRepository.LEGAL_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── GET /admin/settings/about ── page « Notre Histoire » (ADM-08) ── */
const getAboutSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.ABOUT_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/about ── */
const updateAboutSettings = async (req, res, next) => {
  try {
    const { values, error } = collectTextSettings(req.body, settingsRepository.ABOUT_KEYS);
    if (error) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [error] });
    }
    await settingsRepository.upsertSettings(values);
    const data = await settingsRepository.findSettings(settingsRepository.ABOUT_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── GET /admin/settings/home ── blocs de la page d'accueil (ADM-08) ── */
const getHomeSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.HOME_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── PUT /admin/settings/home ── */
const updateHomeSettings = async (req, res, next) => {
  try {
    const { values, error } = collectTextSettings(req.body, settingsRepository.HOME_KEYS);
    if (error) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [error] });
    }
    // Interrupteur : seules les valeurs '0' et '1' ont un sens
    if (values.hero_stats_enabled !== undefined && !['0', '1'].includes(values.hero_stats_enabled)) {
      return res.status(400).json({
        success: false, message: 'Données invalides.',
        errors: [{ field: 'hero_stats_enabled', message: 'Valeur attendue : 0 ou 1.' }],
      });
    }
    await settingsRepository.upsertSettings(values);
    const data = await settingsRepository.findSettings(settingsRepository.HOME_KEYS);
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

/* ── Retrait en boutique ── */
const getPickupSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.PICKUP_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updatePickupSettings = async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of settingsRepository.PICKUP_KEYS) {
      if (req.body[key] !== undefined) allowed[key] = req.body[key];
    }
    await settingsRepository.upsertSettings(allowed);
    shopSettingsService.invalidate('pickup');  // le prochain email reprend les nouvelles valeurs
    const data = await settingsRepository.findSettings(settingsRepository.PICKUP_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/* ── Coordonnées de facturation ── */
const getInvoiceSettings = async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.INVOICE_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateInvoiceSettings = async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of settingsRepository.INVOICE_KEYS) {
      if (req.body[key] !== undefined) allowed[key] = req.body[key];
    }
    /* Le délai de paiement figure sur la facture : une valeur non numérique ou
       négative produirait une échéance absurde côté client. */
    if (allowed.invoice_due_days !== undefined) {
      const days = parseInt(allowed.invoice_due_days, 10);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return next(new AppError('Le délai de paiement doit être compris entre 1 et 365 jours.', 400));
      }
      allowed.invoice_due_days = String(days);
    }
    await settingsRepository.upsertSettings(allowed);
    shopSettingsService.invalidate('invoice');  // la prochaine facture reprend les nouvelles valeurs
    const data = await settingsRepository.findSettings(settingsRepository.INVOICE_KEYS);
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
  getAboutSettings, updateAboutSettings,
  getHomeSettings, updateHomeSettings,
  getBannerSettings, updateBannerSettings,
  getPickupSettings, updatePickupSettings,
  getInvoiceSettings, updateInvoiceSettings,
};
