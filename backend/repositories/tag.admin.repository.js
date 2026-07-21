const { pool } = require('../config/db');

// Tous les tags avec traductions et nombre de produits liés (admin)
const findAll = async () => {
  const [tags] = await pool.execute(
    `SELECT t.id, t.slug, t.sort_order,
            COUNT(pt.product_id) AS product_count
     FROM tags t
     LEFT JOIN product_tags pt ON pt.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.sort_order ASC, t.id ASC`
  );

  if (tags.length === 0) return [];

  const ids = tags.map((t) => t.id);
  const [translations] = await pool.query(
    `SELECT tag_id, locale, name FROM tag_translations WHERE tag_id IN (?)`,
    [ids]
  );

  return tags.map((tag) => ({
    ...tag,
    translations: translations
      .filter((t) => t.tag_id === tag.id)
      .reduce((acc, t) => {
        acc[t.locale] = { name: t.name };
        return acc;
      }, {}),
  }));
};

// Détail d'un tag avec toutes ses traductions
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, slug, sort_order FROM tags WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;

  const [translations] = await pool.execute(
    `SELECT locale, name FROM tag_translations WHERE tag_id = ?`,
    [id]
  );

  return {
    ...rows[0],
    translations: translations.reduce((acc, t) => {
      acc[t.locale] = { name: t.name };
      return acc;
    }, {}),
  };
};

// Création d'un tag avec ses traductions — transaction atomique
const create = async ({ slug, sortOrder, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO tags (slug, sort_order) VALUES (?, ?)`,
      [slug, sortOrder || 0]
    );
    const tagId = result.insertId;

    for (const [locale, trans] of Object.entries(translations)) {
      await connection.execute(
        `INSERT INTO tag_translations (tag_id, locale, name) VALUES (?, ?, ?)`,
        [tagId, locale, trans.name]
      );
    }

    await connection.commit();
    return tagId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Mise à jour d'un tag avec ses traductions
const update = async (id, { slug, sortOrder, translations }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE tags SET slug = ?, sort_order = ? WHERE id = ?`,
      [slug, sortOrder ?? 0, id]
    );

    if (translations) {
      for (const [locale, trans] of Object.entries(translations)) {
        await connection.execute(
          `INSERT INTO tag_translations (tag_id, locale, name)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [id, locale, trans.name]
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

// Suppression d'un tag — la liaison product_tags est supprimée en cascade (FK)
const remove = async (id) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`DELETE FROM tag_translations WHERE tag_id = ?`, [id]);
    await connection.execute(`DELETE FROM tags WHERE id = ?`, [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Vérifie si un slug est déjà utilisé (optionnellement en excluant un id)
const slugExists = async (slug, excludeId = null) => {
  const params = [slug];
  let query = `SELECT id FROM tags WHERE slug = ?`;
  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(query, params);
  return rows.length > 0;
};

module.exports = { findAll, findById, create, update, remove, slugExists };
