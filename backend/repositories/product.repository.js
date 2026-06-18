const { pool } = require('../config/db');

// Colonnes produit sélectionnées explicitement — jamais SELECT *
const PRODUCT_COLUMNS = `
  p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock,
  p.weight_kg, p.is_featured, p.is_made_to_order, p.badge, p.category_id, p.supplier_id, p.created_at,
  pt.name, pt.description,
  ct.name AS category_name,
  c.slug AS category_slug,
  pi.url AS image_url, pi.url_medium AS image_url_medium, pi.alt AS image_alt,
  tr.rate AS tax_rate, tr.name AS tax_name,
  COALESCE(ROUND(AVG(r.rating), 1), 0) AS avg_rating,
  COUNT(r.id) AS review_count
`;

// Construction dynamique des filtres WHERE pour la liste produits
const buildFilters = (filters) => {
  const conditions = ['p.is_active = 1', 'p.deleted_at IS NULL'];
  const params = [];

  if (filters.q) {
    conditions.push('MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)');
    params.push(filters.q + '*');
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    conditions.push(`p.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`);
    params.push(...filters.categoryIds);
  } else if (filters.categoryId) {
    conditions.push('p.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.minPrice !== undefined) {
    conditions.push('p.price_chf >= ?');
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push('p.price_chf <= ?');
    params.push(filters.maxPrice);
  }
  if (filters.inStock) {
    conditions.push('p.stock > 0');
  }
  if (filters.madeToOrder) {
    conditions.push('p.is_made_to_order = 1');
  }
  if (filters.featured) {
    conditions.push('p.is_featured = 1');
  }
  if (filters.badge) {
    const VALID_BADGES = ['nouveaute', 'promo', 'coup_de_coeur', 'exclusif'];
    if (VALID_BADGES.includes(filters.badge)) {
      conditions.push('p.badge = ?');
      params.push(filters.badge);
    }
  }
  if (filters.minRating) {
    conditions.push('COALESCE(ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND is_approved = 1), 1), 0) >= ?');
    params.push(parseFloat(filters.minRating));
  }

  return { conditions, params };
};

// Champs autorisés pour le tri — protection contre l'injection
const ALLOWED_SORT_FIELDS = {
  created_at: 'p.created_at',
  updated_at: 'p.updated_at',
  price_chf: 'p.price_chf',
  name: 'pt.name',
  stock: 'p.stock',
  avg_rating: 'avg_rating',
};

// Liste paginée des produits avec filtres
const findAll = async ({ locale = 'fr', page = 1, limit = 20, sort = 'created_at', order = 'desc', ...filters }) => {
  const { conditions, params } = buildFilters(filters);
  const sortField = ALLOWED_SORT_FIELDS[sort] || 'p.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  // Requête de comptage
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     WHERE ${conditions.join(' AND ')}`,
    [locale, ...params]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = 1
     WHERE ${conditions.join(' AND ')}
     GROUP BY p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock, p.weight_kg, p.is_featured, p.is_made_to_order, p.category_id, p.supplier_id, p.created_at, pt.name, pt.description, ct.name, c.slug, pi.url, pi.url_medium, pi.alt, tr.rate, tr.name
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [locale, locale, ...params, limit, offset]
  );

  return { rows, total };
};

// Détail d'un produit par id avec images et variantes
const findById = async (id, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock,
            p.weight_kg, p.is_featured, p.is_made_to_order, p.badge, p.category_id, p.supplier_id, p.created_at,
            pt.name, pt.description,
            ct.name AS category_name,
            c.slug AS category_slug,
            tr.rate AS tax_rate, tr.name AS tax_name,
            COALESCE(ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND is_approved = 1), 1), 0) AS avg_rating,
            (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND is_approved = 1) AS review_count
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE p.id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
     LIMIT 1`,
    [locale, locale, id]
  );

  if (!rows[0]) return null;

  // Images du produit — toutes les tailles (url_medium/url_large pour le srcset front)
  const [images] = await pool.execute(
    `SELECT id, url, url_medium, url_large, alt, sort_order, is_primary
     FROM product_images
     WHERE product_id = ?
     ORDER BY is_primary DESC, sort_order ASC`,
    [id]
  );

  // Variantes du produit
  const [variants] = await pool.execute(
    `SELECT id, name, value, price_modifier, stock, sku
     FROM product_variants
     WHERE product_id = ?`,
    [id]
  );

  return { ...rows[0], images, variants };
};

// Recherche FULLTEXT sur name et description
const search = async ({ q, locale = 'fr', page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const qBoolean = q + '*';
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
       AND MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)`,
    [locale, qBoolean]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS},
            MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE) AS relevance
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = 1
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
       AND MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)
     GROUP BY p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock, p.weight_kg, p.is_featured, p.is_made_to_order, p.category_id, p.supplier_id, p.created_at, pt.name, pt.description, ct.name, c.slug, pi.url, pi.url_medium, pi.alt, tr.rate, tr.name
     ORDER BY relevance DESC
     LIMIT ? OFFSET ?`,
    [qBoolean, locale, locale, qBoolean, limit, offset]
  );

  return { rows, total };
};

// Produits par catégorie (id de la catégorie)
const findByCategoryId = async ({ categoryId, locale = 'fr', page = 1, limit = 20, sort = 'created_at', order = 'desc' }) => {
  const sortField = ALLOWED_SORT_FIELDS[sort] || 'p.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.category_id = ?`,
    [locale, categoryId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = 1
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.category_id = ?
     GROUP BY p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock, p.weight_kg, p.is_featured, p.is_made_to_order, p.category_id, p.supplier_id, p.created_at, pt.name, pt.description, ct.name, c.slug, pi.url, pi.url_medium, pi.alt, tr.rate, tr.name
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [locale, locale, categoryId, limit, offset]
  );

  return { rows, total };
};

// Détail d'un produit par slug avec images et variantes
const findBySlug = async (slug, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock,
            p.weight_kg, p.is_featured, p.is_made_to_order, p.badge, p.category_id, p.supplier_id, p.created_at,
            pt.name, pt.description,
            ct.name AS category_name,
            c.slug AS category_slug,
            tr.rate AS tax_rate, tr.name AS tax_name,
            COALESCE(ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = p.id AND is_approved = 1), 1), 0) AS avg_rating,
            (SELECT COUNT(*) FROM reviews WHERE product_id = p.id AND is_approved = 1) AS review_count
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE p.slug = ? AND p.is_active = 1 AND p.deleted_at IS NULL
     LIMIT 1`,
    [locale, locale, slug]
  );

  if (!rows[0]) return null;
  const id = rows[0].id;

  const [images] = await pool.execute(
    `SELECT id, url, alt, sort_order, is_primary
     FROM product_images
     WHERE product_id = ?
     ORDER BY is_primary DESC, sort_order ASC`,
    [id]
  );

  const [variants] = await pool.execute(
    `SELECT id, name, value, price_modifier, stock, sku
     FROM product_variants
     WHERE product_id = ?`,
    [id]
  );

  return { ...rows[0], images, variants };
};

module.exports = { findAll, findById, findBySlug, search, findByCategoryId };
