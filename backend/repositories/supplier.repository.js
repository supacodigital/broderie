const { pool } = require('../config/db');

/* Tris autorisés — protège de l'injection, la valeur venant de la query string */
const ALLOWED_SORT = {
  name:          's.name',
  created_at:    's.created_at',
  product_count: 'product_count',
};

const findAll = async ({ page = 1, limit = 20, search = '', isActive = null, sort = 'name', order = 'asc' }) => {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (search) {
    /* Parenthèses obligatoires : sans elles, l'ajout d'une seconde condition
       (is_active) serait combiné en OR avec la dernière alternative de la
       recherche, et le filtre ne s'appliquerait plus. */
    conditions.push('(s.name LIKE ? OR s.contact_name LIKE ? OR s.email LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (isActive !== null) {
    conditions.push('s.is_active = ?');
    params.push(isActive ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortField = ALLOWED_SORT[sort] || 's.name';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM suppliers s ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.contact_name, s.email, s.phone, s.address, s.is_active, s.created_at,
            s.made_to_order_delay_min_weeks, s.made_to_order_delay_max_weeks,
            COUNT(p.id) AS product_count
     FROM suppliers s
     LEFT JOIN products p ON p.supplier_id = s.id AND p.deleted_at IS NULL
     ${where}
     GROUP BY s.id
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, name, contact_name, email, phone, address, street, street_number, zip, city, country, customer_number, website, notes,
            supply_delay_days, payment_terms_days,
            made_to_order_delay_min_weeks, made_to_order_delay_max_weeks, is_active, created_at
     FROM suppliers WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

const create = async ({ name, contactName, email, phone, address, street, streetNumber, zip, city, country, customerNumber, website, notes, supplyDelayDays, paymentTermsDays, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks }) => {
  const [result] = await pool.execute(
    `INSERT INTO suppliers (name, contact_name, email, phone, address, street, street_number, zip, city, country,
       customer_number, website, notes, supply_delay_days, payment_terms_days,
       made_to_order_delay_min_weeks, made_to_order_delay_max_weeks, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [name, contactName || null, email || null, phone || null, address || null,
     street || null, streetNumber || null, zip || null, city || null, country || 'CH',
     customerNumber || null, website || null, notes || null,
     supplyDelayDays ?? null, paymentTermsDays ?? null,
     madeToOrderDelayMinWeeks || null, madeToOrderDelayMaxWeeks || null]
  );
  return result.insertId;
};

const update = async (id, { name, contactName, email, phone, address, street, streetNumber, zip, city, country, customerNumber, website, notes, supplyDelayDays, paymentTermsDays, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks, isActive }) => {
  await pool.execute(
    `UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?,
     address = ?, street = ?, street_number = ?, zip = ?, city = ?, country = ?,
     customer_number = ?, website = ?, notes = ?,
     supply_delay_days = ?, payment_terms_days = ?,
     made_to_order_delay_min_weeks = ?, made_to_order_delay_max_weeks = ?, is_active = ? WHERE id = ?`,
    [name, contactName || null, email || null, phone || null, address || null,
     street || null, streetNumber || null, zip || null, city || null, country || 'CH',
     customerNumber || null, website || null, notes || null,
     supplyDelayDays ?? null, paymentTermsDays ?? null,
     madeToOrderDelayMinWeeks || null, madeToOrderDelayMaxWeeks || null, isActive ? 1 : 0, id]
  );
  return findById(id);
};

// Suppression d'un fournisseur — bloquée si des produits actifs y sont encore rattachés
// (products.supplier_id est en ON DELETE SET NULL : sans ce garde-fou, la suppression
// réussirait silencieusement et détacherait tous ses produits de leur fournisseur)
const remove = async (id) => {
  const [products] = await pool.execute(
    `SELECT COUNT(*) AS total FROM products WHERE supplier_id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (products[0].total > 0) {
    throw new Error(`Impossible de supprimer : ${products[0].total} produit(s) lié(s) à ce fournisseur.`);
  }

  const [result] = await pool.execute(
    `DELETE FROM suppliers WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

/* Fiche complète : coordonnées + produits liés + KPIs */
const findByIdWithProducts = async (id) => {
  const [supRows] = await pool.execute(
    `SELECT id, name, contact_name, email, phone, address, street, street_number, zip, city, country, customer_number, website, notes,
            supply_delay_days, payment_terms_days,
            made_to_order_delay_min_weeks, made_to_order_delay_max_weeks, is_active, created_at
     FROM suppliers WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!supRows[0]) return null;

  const [products] = await pool.execute(
    `SELECT p.id, p.sku, p.price_chf, p.stock, p.is_active,
            COALESCE(pt.name, p.slug) AS name
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
     WHERE p.supplier_id = ? AND p.deleted_at IS NULL
     ORDER BY pt.name ASC`,
    [id]
  );

  /* KPIs calculés côté serveur */
  const totalProducts  = products.length;
  const activeProducts = products.filter(p => p.is_active).length;
  const outOfStock     = products.filter(p => p.stock === 0).length;
  const stockValue     = products.reduce((sum, p) => sum + parseFloat(p.price_chf ?? 0) * (p.stock ?? 0), 0);

  return {
    ...supRows[0],
    products,
    kpis: { totalProducts, activeProducts, outOfStock, stockValue },
  };
};

module.exports = { findAll, findById, create, update, remove, findByIdWithProducts };
