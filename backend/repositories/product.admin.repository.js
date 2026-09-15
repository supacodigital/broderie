const { pool } = require('../config/db');
const storage = require('../config/storage');
const { promoActiveSql } = require('../utils/promo.utils');
const { toSearchTerms } = require('../utils/search.utils');

// Supprime du disque les 3 variantes d'une ligne product_images (best-effort — un
// fichier absent ne doit jamais faire échouer la suppression en base).
const deleteImageFiles = (row) => {
  if (!row) return;
  for (const url of [row.url, row.url_thumbnail, row.url_medium, row.url_large]) {
    try {
      storage.deleteLocal(url);
    } catch (error) {
      console.error('[product.images] suppression fichier échouée', { url, message: error.message });
    }
  }
};

// Création d'un produit avec ses traductions — transaction atomique
const create = async ({ categoryId, supplierId, slug, priceChf, comparePriceChf, promoStartsAt, promoEndsAt, taxRateId, sku, stock, weightKg, lengthCm, widthCm, isFeatured, isMadeToOrder, badge, brand, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO products (category_id, supplier_id, slug, price_chf, compare_price_chf, promo_starts_at, promo_ends_at, tax_rate_id, sku, stock, weight_kg, length_cm, width_cm, is_featured, is_made_to_order, badge, brand, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock || 0, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, badge || null, brand || null]
    );
    const productId = result.insertId;

    // Insertion des traductions
    for (const [locale, trans] of Object.entries(translations)) {
      await connection.execute(
        `INSERT INTO product_translations (product_id, locale, name, description, slug)
         VALUES (?, ?, ?, ?, ?)`,
        [productId, locale, trans.name, trans.description || null, trans.slug || slug]
      );
    }

    await connection.commit();
    return productId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Mise à jour d'un produit avec ses traductions
const update = async (id, { categoryId, supplierId, slug, priceChf, comparePriceChf, promoStartsAt, promoEndsAt, taxRateId, sku, stock, weightKg, lengthCm, widthCm, isFeatured, isMadeToOrder, isActive, badge, brand, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    /* slug non modifiable en édition — on ne le met à jour que s'il est fourni */
    const slugClause = slug ? 'slug = ?,' : '';
    const baseParams = slug
      ? [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, badge || null, brand || null, isActive ? 1 : 0, id]
      : [categoryId, supplierId || null,       priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, badge || null, brand || null, isActive ? 1 : 0, id];

    await connection.execute(
      `UPDATE products SET category_id = ?, supplier_id = ?, ${slugClause} price_chf = ?,
       compare_price_chf = ?, promo_starts_at = ?, promo_ends_at = ?,
       tax_rate_id = ?, sku = ?, stock = ?, weight_kg = ?, length_cm = ?, width_cm = ?,
       is_featured = ?, is_made_to_order = ?, badge = ?, brand = ?, is_active = ? WHERE id = ?`,
      baseParams
    );

    if (translations) {
      for (const [locale, trans] of Object.entries(translations)) {
        await connection.execute(
          `INSERT INTO product_translations (product_id, locale, name, description, slug)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), slug = VALUES(slug)`,
          [id, locale, trans.name, trans.description || null, trans.slug || slug || null]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Soft delete
const softDelete = async (id) => {
  await pool.execute(
    `UPDATE products SET deleted_at = NOW(), is_active = 0 WHERE id = ?`,
    [id]
  );
};

// Ajout d'une image produit avec ses 3 variantes de taille
const addImage = async ({ productId, url, urlThumbnail, urlMedium, urlLarge, alt, sortOrder, isPrimary }) => {
  if (isPrimary) {
    await pool.execute(
      `UPDATE product_images SET is_primary = 0 WHERE product_id = ?`,
      [productId]
    );
  }
  const [result] = await pool.execute(
    `INSERT INTO product_images (product_id, url, url_thumbnail, url_medium, url_large, alt, sort_order, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, url, urlThumbnail || null, urlMedium || null, urlLarge || null, alt || null, sortOrder || 0, isPrimary ? 1 : 0]
  );
  return result.insertId;
};

// Suppression d'une image — retire aussi les fichiers du disque
const removeImage = async (imageId, productId) => {
  const [[row]] = await pool.execute(
    `SELECT url, url_thumbnail, url_medium, url_large FROM product_images WHERE id = ? AND product_id = ?`,
    [imageId, productId]
  );
  if (!row) return false;

  const [result] = await pool.execute(
    `DELETE FROM product_images WHERE id = ? AND product_id = ?`,
    [imageId, productId]
  );
  if (result.affectedRows > 0) deleteImageFiles(row);
  return result.affectedRows > 0;
};

// Définir une image comme principale — reset toutes, puis set celle-ci
const setPrimaryImage = async (imageId, productId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    /* Vérifier que l'image appartient bien au produit */
    const [rows] = await connection.execute(
      `SELECT id FROM product_images WHERE id = ? AND product_id = ?`,
      [imageId, productId]
    );
    if (!rows[0]) { await connection.rollback(); return false; }
    await connection.execute(
      `UPDATE product_images SET is_primary = 0 WHERE product_id = ?`,
      [productId]
    );
    await connection.execute(
      `UPDATE product_images SET is_primary = 1 WHERE id = ?`,
      [imageId]
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Détail d'un produit pour l'admin — sans filtre is_active (produits inactifs visibles)
const findByIdAdmin = async (id, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf,
            p.promo_starts_at, p.promo_ends_at, ${promoActiveSql('p')} AS is_promo_active,
            p.sku, p.stock,
            p.weight_kg, p.length_cm, p.width_cm, p.is_featured, p.is_made_to_order, p.is_active, p.badge, p.brand, p.category_id, p.supplier_id,
            p.tax_rate_id, p.created_at,
            pt.name, pt.description,
            tr.rate AS tax_rate, tr.name AS tax_name
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE p.id = ? AND p.deleted_at IS NULL
     LIMIT 1`,
    [locale, id]
  );

  if (!rows[0]) return null;

  const [images] = await pool.execute(
    `SELECT id, url, alt, sort_order, is_primary
     FROM product_images
     WHERE product_id = ?
     ORDER BY is_primary DESC, sort_order ASC`,
    [id]
  );

  return { ...rows[0], description_fr: rows[0].description, images };
};

const ALLOWED_SORT_ADMIN = {
  created_at: 'p.created_at',
  price_chf:  'p.price_chf',
  name:       'pt.name',
  stock:      'p.stock',
};

// Liste admin — inclut produits inactifs et soft-deleted visibles, filtres étendus
const findAllAdmin = async ({
  page = 1, limit = 20, search = '',
  categoryId = null, supplierId = null, brand = null,
  minPrice = null, maxPrice = null,
  inStock = false, lowStock = false,
  isActive = null, isFeatured = null,
  sort = 'created_at', order = 'desc',
} = {}) => {
  const offset = (page - 1) * limit;
  // Vitrine home bento : même ordre que la boutique (featured_order), pas le tri générique demandé —
  // sinon la bande "Vitrine home" de l'admin et la home affichent deux ordres différents.
  const sortField = isFeatured
    ? 'p.featured_order IS NULL, p.featured_order, p.created_at'
    : (ALLOWED_SORT_ADMIN[sort] || 'p.created_at');
  const sortOrder = isFeatured ? 'ASC' : (order === 'asc' ? 'ASC' : 'DESC');

  const params = ['fr'];
  let where = 'WHERE p.deleted_at IS NULL';

  /* Recherche admin : chaque mot doit être présent, dans n'importe quel ordre et
     réparti sur n'importe lequel des champs (nom, référence, fournisseur, gamme).
     Auparavant la saisie entière servait de motif unique : « DMC 745 » ne trouvait
     rien, car « DMC mouliné N° 745 » ne contient pas cette suite exacte de
     caractères — signalement cliente « le moteur de recherche n'est pas assez
     précis ».
     Les mots passent par toSearchTerms (singulier + plafond), le même découpage
     que la boutique : une recherche qui aboutit là-bas doit aboutir ici. */
  const searchTerms = toSearchTerms(search);
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      where += ' AND (pt.name LIKE ? OR p.sku LIKE ? OR sup.name LIKE ? OR p.brand LIKE ?)';
      const like = `%${term}%`;
      params.push(like, like, like, like);
    }
  }
  if (brand) {
    where += ' AND p.brand = ?';
    params.push(brand);
  }
  if (categoryId) {
    /* Inclut la catégorie choisie ET toute sa descendance (hiérarchie à 3 niveaux max) */
    where += ` AND p.category_id IN (
      SELECT descendant.id
      FROM categories descendant
      LEFT JOIN categories parent ON parent.id = descendant.parent_id
      WHERE descendant.id = ? OR descendant.parent_id = ? OR parent.parent_id = ?
    )`;
    params.push(categoryId, categoryId, categoryId);
  }
  if (supplierId) {
    where += ' AND p.supplier_id = ?';
    params.push(supplierId);
  }
  if (minPrice !== null) {
    where += ' AND p.price_chf >= ?';
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    where += ' AND p.price_chf <= ?';
    params.push(maxPrice);
  }
  if (inStock) {
    where += ' AND p.stock > 0';
  }
  /* Stock bas : sert au réassort, donc uniquement les articles réellement tenus en
     stock. Les articles « sur commande » sont à 0 par nature (commandés chez le
     fournisseur à réception) — les inclure noyait les ~1 750 vrais réassorts sous
     ~12 900 lignes normales, rendant le filtre inutilisable. */
  if (lowStock) {
    where += ' AND p.stock <= 5 AND p.is_active = 1 AND p.is_made_to_order = 0';
  }
  if (isActive !== null) {
    where += ' AND p.is_active = ?';
    params.push(isActive ? 1 : 0);
  }
  if (isFeatured !== null) {
    where += ' AND p.is_featured = ?';
    params.push(isFeatured ? 1 : 0);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN suppliers sup ON sup.id = p.supplier_id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf,
            p.promo_starts_at, p.promo_ends_at, ${promoActiveSql('p')} AS is_promo_active,
            p.sku, p.stock, p.weight_kg, p.length_cm, p.width_cm,
            p.is_active, p.is_featured, p.is_made_to_order, p.badge, p.brand, p.category_id, p.supplier_id, p.tax_rate_id, p.created_at,
            pt.name, pt.description AS description_fr,
            ct.name AS category_name,
            sup.name AS supplier_name,
            pi.url AS image_url
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
     LEFT JOIN suppliers sup ON sup.id = p.supplier_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     ${where}
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

// Vérifie si un slug produit est déjà utilisé (optionnellement en excluant un id)
const slugExists = async (slug, excludeId = null) => {
  const params = [slug];
  let query = `SELECT id FROM products WHERE slug = ?`;
  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(query, params);
  return rows.length > 0;
};

// Vérifie si un SKU produit est déjà utilisé (optionnellement en excluant un id) — sku étant nullable
const skuExists = async (sku, excludeId = null) => {
  if (!sku) return false;
  const params = [sku];
  let query = `SELECT id FROM products WHERE sku = ?`;
  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(query, params);
  return rows.length > 0;
};

// Persiste l'ordre des produits vedettes (bento home), fixé par drag & drop admin.
// productIds[i] reçoit featured_order = i (0 = grande carte). Tout produit featured non listé
// (retiré entre-temps) repasse à NULL — il retombe en fin de liste via le fallback created_at.
const updateFeaturedOrder = async (productIds) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE products SET featured_order = NULL WHERE is_featured = 1 AND id NOT IN (?)`,
      [productIds]
    );

    // Une seule requête pour toutes les positions (CASE WHEN), pas de boucle de UPDATE.
    const caseClause = productIds.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams = productIds.flatMap((id, i) => [id, i]);
    await connection.query(
      `UPDATE products SET featured_order = CASE id ${caseClause} END WHERE id IN (?)`,
      [...caseParams, productIds]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { create, update, softDelete, addImage, removeImage, setPrimaryImage, findAllAdmin, findByIdAdmin, slugExists, skuExists, updateFeaturedOrder };
