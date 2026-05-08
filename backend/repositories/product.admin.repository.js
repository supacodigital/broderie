const { pool } = require('../config/db');

// Création d'un produit avec ses traductions — transaction atomique
const create = async ({ categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, badge, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO products (category_id, supplier_id, slug, price_chf, compare_price_chf, tax_rate_id, sku, stock, weight_kg, is_featured, badge, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, taxRateId, sku || null, stock || 0, weightKg || null, isFeatured ? 1 : 0, badge || null]
    );
    const productId = result.insertId;

    // Insertion des traductions FR/DE/EN
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
const update = async (id, { categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isActive, badge, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    /* slug non modifiable en édition — on ne le met à jour que s'il est fourni */
    const slugClause = slug ? 'slug = ?,' : '';
    const baseParams = slug
      ? [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, taxRateId, sku || null, stock, weightKg || null, isFeatured ? 1 : 0, badge || null, isActive ? 1 : 0, id]
      : [categoryId, supplierId || null,       priceChf, comparePriceChf || null, taxRateId, sku || null, stock, weightKg || null, isFeatured ? 1 : 0, badge || null, isActive ? 1 : 0, id];

    await connection.execute(
      `UPDATE products SET category_id = ?, supplier_id = ?, ${slugClause} price_chf = ?,
       compare_price_chf = ?, tax_rate_id = ?, sku = ?, stock = ?, weight_kg = ?,
       is_featured = ?, badge = ?, is_active = ? WHERE id = ?`,
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
    `INSERT INTO product_images (product_id, url, alt, sort_order, is_primary)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, url, alt || null, sortOrder || 0, isPrimary ? 1 : 0]
  );
  return result.insertId;
};

// Suppression d'une image
const removeImage = async (imageId, productId) => {
  const [result] = await pool.execute(
    `DELETE FROM product_images WHERE id = ? AND product_id = ?`,
    [imageId, productId]
  );
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
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock,
            p.weight_kg, p.is_featured, p.is_active, p.badge, p.category_id, p.supplier_id,
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

// Liste admin avec soft-deleted et inactifs
const findAllAdmin = async ({ page = 1, limit = 20, search = '', categoryId = null }) => {
  const offset = (page - 1) * limit;
  const params = ['fr'];
  let where = 'WHERE p.deleted_at IS NULL';

  if (search) {
    where += ' AND pt.name LIKE ?';
    params.push(`%${search}%`);
  }
  if (categoryId) {
    where += ' AND p.category_id = ?';
    params.push(categoryId);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT p.id, p.slug, p.price_chf, p.compare_price_chf, p.sku, p.stock, p.weight_kg,
            p.is_active, p.is_featured, p.badge, p.category_id, p.supplier_id, p.tax_rate_id, p.created_at,
            pt.name, pt.description AS description_fr,
            ct.name AS category_name,
            pi.url AS image_url
     FROM products p
     INNER JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { rows, total };
};

module.exports = { create, update, softDelete, addImage, removeImage, setPrimaryImage, findAllAdmin, findByIdAdmin };
