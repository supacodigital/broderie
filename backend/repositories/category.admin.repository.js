const { pool } = require('../config/db');

/* Toutes les catégories avec traductions et comptages de produits (admin).
 *
 * Les totaux sont agrégés sur toute la descendance : « Broderie » compte les
 * produits de tous ses sous-rayons. Cette agrégation se faisait auparavant par
 * une sous-requête corrélée exécutée pour CHAQUE catégorie — 54 balayages de la
 * table produits, 429 ms, et le double une fois le second compteur ajouté.
 * On lit désormais les rattachements en une passe, puis on les propage vers les
 * ancêtres en JS.
 */
const findAll = async () => {
  const [categories] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order
     FROM categories c
     ORDER BY c.sort_order ASC, c.id ASC`
  );

  if (categories.length === 0) return [];

  /* Couples (produit, catégorie) bruts. On ne pré-agrège pas en SQL : un même
     produit peut être rattaché à une catégorie ET à sa parente — l'import
     conserve le rayon d'origine quand la cliente affine un classement — et des
     comptages par catégorie ne pourraient alors plus être additionnés sans
     compter ce produit deux fois dans l'ancêtre commun.
     Rattachement lu sur product_categories (ADM-04) : un produit rangé dans un
     rayon secondaire y compte, comme en boutique — sinon l'administration et le
     site afficheraient deux totaux différents pour la même catégorie. */
  const [links] = await pool.execute(
    `SELECT pc.category_id, pc.product_id, p.category_needs_review
     FROM product_categories pc
     JOIN products p ON p.id = pc.product_id AND p.deleted_at IS NULL`
  );

  const ids = categories.map((c) => c.id);
  const [translations] = await pool.query(
    `SELECT category_id, locale, name, description
     FROM category_translations
     WHERE category_id IN (?)`,
    [ids]
  );

  // Traductions indexées par catégorie — un filter() par ligne serait quadratique
  const translationsById = new Map();
  for (const t of translations) {
    if (!translationsById.has(t.category_id)) translationsById.set(t.category_id, {});
    translationsById.get(t.category_id)[t.locale] = { name: t.name, description: t.description };
  }

  /* Agrégation sur la descendance par ENSEMBLES de produits, et non par somme
     de comptages : un article rangé dans « Kits de Broderie » et dans
     « Kits de Broderie > Point de croix compté » ne doit être compté qu'une fois
     dans « Broderie ». Sur le catalogue réel, 2 897 articles sont dans ce cas et
     une simple addition gonflait le rayon Broderie de 12 928 à 15 825, soit plus
     que le catalogue entier.
     Le coût mémoire reste modeste : environ 19 000 rattachements répartis sur
     54 catégories, chacun inséré dans au plus 3 ensembles (sa catégorie et ses
     deux ancêtres). */
  const parentById = new Map(categories.map((c) => [c.id, c.parent_id]));
  const aggregated = new Map(categories.map((c) => [c.id, { total: new Set(), review: new Set() }]));

  for (const link of links) {
    // La catégorie elle-même, puis chacun de ses ancêtres
    let current = link.category_id;
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current); // garde-fou : une boucle parent/enfant ne doit pas figer la requête
      const bucket = aggregated.get(current);
      if (bucket) {
        bucket.total.add(link.product_id);
        if (link.category_needs_review === 1) bucket.review.add(link.product_id);
      }
      current = parentById.get(current);
    }
  }

  return categories.map((cat) => ({
    ...cat,
    product_count: aggregated.get(cat.id)?.total.size  ?? 0,
    review_count:  aggregated.get(cat.id)?.review.size ?? 0,
    translations:  translationsById.get(cat.id) ?? {},
  }));
};

// Détail d'une catégorie avec toutes ses traductions
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order
     FROM categories c WHERE c.id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;

  const [translations] = await pool.execute(
    `SELECT locale, name, description FROM category_translations WHERE category_id = ?`,
    [id]
  );

  return {
    ...rows[0],
    translations: translations.reduce((acc, t) => {
      acc[t.locale] = { name: t.name, description: t.description };
      return acc;
    }, {}),
  };
};

// Calcule la profondeur d'une catégorie (0 = racine, 1 = enfant, 2 = petit-enfant)
const getDepth = async (categoryId) => {
  let depth = 0;
  let currentId = categoryId;
  while (currentId) {
    const [rows] = await pool.execute(`SELECT parent_id FROM categories WHERE id = ?`, [currentId]);
    if (!rows[0]) break;
    currentId = rows[0].parent_id;
    if (currentId) depth += 1;
  }
  return depth;
};

// Création d'une catégorie avec ses traductions — transaction atomique
const create = async ({ parentId, slug, imageUrl, sortOrder, translations }) => {
  if (parentId) {
    const parentDepth = await getDepth(parentId);
    if (parentDepth >= 2) {
      throw new Error('Profondeur maximale atteinte : la hiérarchie des catégories est limitée à 3 niveaux.');
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO categories (parent_id, slug, image_url, sort_order)
       VALUES (?, ?, ?, ?)`,
      [parentId || null, slug, imageUrl || null, sortOrder || 0]
    );
    const categoryId = result.insertId;

    for (const [locale, trans] of Object.entries(translations)) {
      await connection.execute(
        `INSERT INTO category_translations (category_id, locale, name, description)
         VALUES (?, ?, ?, ?)`,
        [categoryId, locale, trans.name, trans.description || null]
      );
    }

    await connection.commit();
    return categoryId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Vérifie qu'un déplacement (id -> nouveau parentId) ne crée pas de cycle
// et ne dépasse pas 3 niveaux (le sous-arbre le plus profond de id doit tenir)
const assertValidMove = async (id, parentId) => {
  if (!parentId) return;
  if (parentId === id) {
    throw new Error('Une catégorie ne peut pas être son propre parent.');
  }

  const parentDepth = await getDepth(parentId);
  if (parentDepth >= 2) {
    throw new Error('Profondeur maximale atteinte : la hiérarchie des catégories est limitée à 3 niveaux.');
  }

  // Le nouveau parent ne doit pas être un descendant de id (éviterait un cycle)
  let currentId = parentId;
  while (currentId) {
    const [rows] = await pool.execute(`SELECT parent_id FROM categories WHERE id = ?`, [currentId]);
    if (!rows[0]) break;
    currentId = rows[0].parent_id;
    if (currentId === id) {
      throw new Error('Déplacement invalide : cette catégorie deviendrait sa propre descendante.');
    }
  }

  // Si id a déjà des petits-enfants, le déplacer sous parentId (profondeur 1) créerait un niveau 4
  const [grandchildren] = await pool.execute(
    `SELECT COUNT(*) AS total FROM categories child
     INNER JOIN categories grandchild ON grandchild.parent_id = child.id
     WHERE child.parent_id = ?`,
    [id]
  );
  if (grandchildren[0].total > 0) {
    throw new Error('Impossible de déplacer : cette catégorie a des petites-sous-catégories qui dépasseraient 3 niveaux.');
  }
};

// Mise à jour d'une catégorie avec ses traductions
const update = async (id, { parentId, slug, imageUrl, sortOrder, translations }) => {
  await assertValidMove(id, parentId || null);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE categories SET parent_id = ?, slug = ?, image_url = ?, sort_order = ?
       WHERE id = ?`,
      [parentId || null, slug, imageUrl || null, sortOrder ?? 0, id]
    );

    if (translations) {
      for (const [locale, trans] of Object.entries(translations)) {
        await connection.execute(
          `INSERT INTO category_translations (category_id, locale, name, description)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
          [id, locale, trans.name, trans.description || null]
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

// Suppression d'une catégorie — vérifie qu'elle n'a ni sous-catégorie ni produit lié
const remove = async (id) => {
  const [children] = await pool.execute(
    `SELECT COUNT(*) AS total FROM categories WHERE parent_id = ?`,
    [id]
  );
  if (children[0].total > 0) {
    throw new Error(`Impossible de supprimer : ${children[0].total} sous-catégorie(s) rattachée(s) à cette catégorie.`);
  }

  const [products] = await pool.execute(
    `SELECT COUNT(*) AS total FROM products WHERE category_id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (products[0].total > 0) {
    throw new Error(`Impossible de supprimer : ${products[0].total} produit(s) lié(s) à cette catégorie.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`DELETE FROM category_translations WHERE category_id = ?`, [id]);
    await connection.execute(`DELETE FROM categories WHERE id = ?`, [id]);
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
  let query = `SELECT id FROM categories WHERE slug = ?`;
  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await pool.execute(query, params);
  return rows.length > 0;
};

module.exports = { findAll, findById, create, update, remove, slugExists };
