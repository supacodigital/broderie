const { pool } = require('../config/db');

/* ── Taux TVA ── */
const findAllTaxRates = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, rate, category, is_default FROM tax_rates ORDER BY id ASC`
  );
  return rows;
};

const updateTaxRate = async (id, { rate }) => {
  await pool.execute(
    `UPDATE tax_rates SET rate = ? WHERE id = ?`,
    [rate, id]
  );
};

/* ── Frais de port ── */
const findAllShippingRates = async () => {
  const [rows] = await pool.query(
    `SELECT sr.id, sr.zone_id, sr.name, sr.min_weight, sr.max_weight,
            sr.price_chf, sr.estimated_days, sz.name AS zone_name, sz.carrier
     FROM shipping_rates sr
     INNER JOIN shipping_zones sz ON sz.id = sr.zone_id
     ORDER BY sr.min_weight ASC`
  );
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
};

/* ── Paramètres boutique (clé/valeur) ── */
const STORE_KEYS = ['store_name', 'store_email', 'store_phone', 'store_address'];
const LEGAL_KEYS = ['cgv', 'mentions_legales', 'politique_retour'];

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

module.exports = {
  findAllTaxRates, updateTaxRate, findAllShippingRates, updateShippingRate,
  findSettings, upsertSettings, STORE_KEYS, LEGAL_KEYS,
};
