const { pool } = require('../config/db');
const { cache, cacheSet, keys, TTL } = require('../config/cache');

/* ── Taux TVA (cache 24 h — données quasi statiques, sur le chemin critique du checkout) ── */
const findAllTaxRates = async () => {
  const cached = cache.get(keys.taxRates());
  if (cached) return cached;
  const [rows] = await pool.execute(
    `SELECT id, name, rate, category, is_default FROM tax_rates ORDER BY id ASC`
  );
  cacheSet(keys.taxRates(), rows, TTL.TAX_RATES);
  return rows;
};

const updateTaxRate = async (id, { rate }) => {
  await pool.execute(
    `UPDATE tax_rates SET rate = ? WHERE id = ?`,
    [rate, id]
  );
  cache.del(keys.taxRates());
};

/* ── Frais de port (cache 24 h) ── */
const findAllShippingRates = async () => {
  const cached = cache.get(keys.shippingRates());
  if (cached) return cached;
  const [rows] = await pool.query(
    `SELECT sr.id, sr.zone_id, sr.name, sr.min_weight, sr.max_weight,
            sr.price_chf, sr.estimated_days, sz.name AS zone_name, sz.carrier
     FROM shipping_rates sr
     INNER JOIN shipping_zones sz ON sz.id = sr.zone_id
     ORDER BY sr.min_weight ASC`
  );
  cacheSet(keys.shippingRates(), rows, TTL.SHIPPING);
  return rows;
};

const updateShippingRate = async (id, { priceChf, estimatedDays }) => {
  const fields = [];
  const params = [];
  if (priceChf      !== undefined) { fields.push('price_chf = ?');      params.push(priceChf); }
  if (estimatedDays !== undefined) { fields.push('estimated_days = ?'); params.push(estimatedDays); }
  if (fields.length === 0) return;
  params.push(id);
  await pool.execute(`UPDATE shipping_rates SET ${fields.join(', ')} WHERE id = ?`, params);
  cache.del(keys.shippingRates());
};

/* ── Paramètres boutique (clé/valeur) ── */
const STORE_KEYS = ['store_name', 'store_email', 'store_phone', 'store_address'];
const LEGAL_KEYS = ['cgv', 'mentions_legales', 'politique_retour'];

/* Page « Notre Histoire » (ADM-08 — la cliente l'appelle « Qui sommes-nous »).
   Son contenu vivait dans les fichiers de traduction, donc figé au build : le
   modifier imposait une intervention de développement. Un champ par bloc plutôt
   qu'un texte unique, pour que la mise en page (citation, chronologie) survive à
   une correction de paragraphe.
   Toute clé laissée vide retombe sur le texte d'origine côté boutique. */
const ABOUT_KEYS = [
  'about_title',      // titre principal
  'about_subtitle',   // phrase d'accroche sous le titre
  'about_quote',      // citation mise en exergue
  'about_who_title',  // titre de la 1re section
  'about_who',        // corps de la 1re section (paragraphes séparés par un saut de ligne)
  'about_mission_title',
  'about_mission',
  'about_signature',
  'about_year_1',     // chronologie — année puis texte
  'about_year_1_text',
  'about_year_2',
  'about_year_2_text',
];
/* Blocs de la page d'accueil (ADM-08 — « blocs promotionnels »). Même principe
   que « Notre Histoire » : un champ par texte, et toute clé laissée vide retombe
   sur le texte d'origine côté boutique. `hero_stats_enabled` vaut '0' pour
   masquer les deux chiffres clés du bandeau principal. */
const HOME_KEYS = [
  'hero_eyebrow', 'hero_title', 'hero_subtitle', 'hero_desc',
  'hero_cta', 'hero_cta_secondary',
  'hero_stats_enabled',
  'hero_stat1_value', 'hero_stat1_label', 'hero_stat2_value', 'hero_stat2_label',
  'crafts_eyebrow', 'crafts_title', 'crafts_text',
  'crafts_points',   // un engagement par ligne
  'crafts_cta',
  'advantage_1_title', 'advantage_1_desc',
  'advantage_2_title', 'advantage_2_desc',
  'advantage_3_title', 'advantage_3_desc',
];
/* Bandeau d'annonce affiché en haut de la boutique (promotion, fermeture, délais).
   `banner_enabled` vaut '1' ou '0' — la table settings ne stocke que du texte. */
const BANNER_KEYS = ['banner_enabled', 'banner_text', 'banner_link'];

/* Retrait en boutique — ces valeurs partent dans l'email « votre commande est
   prête ». Elles vivaient dans le .env : les corriger imposait un accès SSH au
   serveur pour un simple changement d'horaires. */
const PICKUP_KEYS = ['pickup_name', 'pickup_address', 'pickup_zip', 'pickup_city', 'pickup_hours'];

/* Coordonnées imprimées sur la facture QR et délai de paiement.
   Le QR-IBAN reste volontairement dans le .env : c'est une donnée bancaire, et
   une erreur de saisie enverrait de vrais paiements sur le mauvais compte. */
const INVOICE_KEYS = ['invoice_name', 'invoice_address', 'invoice_zip', 'invoice_city', 'invoice_vat_number', 'invoice_due_days'];

const findSettings = async (keys) => {
  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT \`key\`, \`value\` FROM settings WHERE \`key\` IN (${placeholders})`,
    keys
  );
  return rows.reduce((acc, r) => { acc[r.key] = r.value ?? ''; return acc; }, {});
};

const upsertSettings = async (entries) => {
  const pairs = Object.entries(entries);
  if (pairs.length === 0) return;
  const placeholders = pairs.map(() => '(?, ?)').join(', ');
  const params = pairs.flatMap(([key, value]) => [key, value ?? '']);
  await pool.execute(
    `INSERT INTO settings (\`key\`, \`value\`) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    params
  );
};

// ─────────────────────────────────────────────────────────────
// Mises à jour groupées — transactionnelles
// La TVA et les frais de port forment des GRILLES cohérentes : appliquer les
// lignes une par une hors transaction laisse, en cas d'échec au milieu, une
// grille moitié ancienne moitié nouvelle (taux TVA incohérents en production).
// ─────────────────────────────────────────────────────────────

const updateTaxRatesBulk = async (rates) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const r of rates) {
      if (!r.id || r.rate == null) continue;
      await connection.execute(`UPDATE tax_rates SET rate = ? WHERE id = ?`, [r.rate, r.id]);
    }
    await connection.commit();
    cache.del(keys.taxRates());
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const updateShippingRatesBulk = async (rates) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const r of rates) {
      if (!r.id) continue;
      const fields = [];
      const params = [];
      if (r.priceChf      !== undefined) { fields.push('price_chf = ?');      params.push(r.priceChf); }
      if (r.estimatedDays !== undefined) { fields.push('estimated_days = ?'); params.push(r.estimatedDays); }
      if (fields.length === 0) continue;
      params.push(r.id);
      await connection.execute(`UPDATE shipping_rates SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    await connection.commit();
    cache.del(keys.shippingRates());
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

module.exports = {
  findAllTaxRates, updateTaxRate, findAllShippingRates, updateShippingRate,
  updateTaxRatesBulk, updateShippingRatesBulk,
  findSettings, upsertSettings, STORE_KEYS, LEGAL_KEYS, ABOUT_KEYS, HOME_KEYS, BANNER_KEYS, PICKUP_KEYS, INVOICE_KEYS,
};
