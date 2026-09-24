const { pool } = require('../config/db');
const storage = require('../config/storage');
const { promoActiveSql } = require('../utils/promo.utils');
const { toSearchTerms } = require('../utils/search.utils');
const productCategoryRepository = require('./productCategory.repository');

/* Journalise un changement de prix (ADM-21).
   N'écrit QUE si l'offre a réellement bougé : réenregistrer une fiche sans
   toucher au prix ne doit rien produire, sinon la table grossirait à chaque
   correction de libellé sur 15 000 articles.

   L'offre, c'est le prix, le prix barré ET la période de promotion : c'est
   cette période que l'ordonnance sur l'indication des prix contrôle (un prix
   barré ne s'affiche que pendant une durée limitée). Déplacer seulement les
   dates d'une promotion n'était pas enregistré.

   Les montants viennent de MySQL sous forme de chaînes ('15.50') et du
   formulaire sous forme de nombres : la comparaison passe donc par Number(),
   sinon '15.50' !== 15.5 déclencherait une écriture à chaque enregistrement.
   Les dates viennent de MySQL en Date et du service en 'AAAA-MM-JJ HH:MM:SS' :
   comparées à la minute, en heure locale du serveur.

   `before` à null : création du produit, le prix de départ est enregistré.

   Reçoit la connexion de la transaction en cours : l'historique et le nouveau
   prix doivent être écrits ensemble ou pas du tout. */
const recordPriceChange = async (connection, productId, before, after, { source = 'admin', changedBy = null } = {}) => {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const minute = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const oldPrice   = num(before?.price_chf);
  const oldCompare = num(before?.compare_price_chf);
  const newPrice   = num(after?.priceChf);
  const newCompare = num(after?.comparePriceChf);
  // Sans prix barré, des dates de promotion n'ont aucun effet : elles ne comptent pas
  const newStart   = newCompare === null ? null : minute(after?.promoStartsAt);
  const newEnd     = newCompare === null ? null : minute(after?.promoEndsAt);

  if (before
      && oldPrice === newPrice && oldCompare === newCompare
      && (oldCompare === null ? null : minute(before.promo_starts_at)) === newStart
      && (oldCompare === null ? null : minute(before.promo_ends_at)) === newEnd) return;

  await connection.execute(
    `INSERT INTO product_price_history
       (product_id, old_price_chf, old_compare_price_chf, new_price_chf, new_compare_price_chf,
        promo_starts_at, promo_ends_at, source, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, oldPrice, oldCompare, newPrice, newCompare,
     newStart ? `${newStart}:00` : null, newEnd ? `${newEnd}:00` : null, source, changedBy]
  );
};

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
const create = async ({ categoryId, secondaryCategoryIds, supplierId, slug, priceChf, comparePriceChf, promoStartsAt, promoEndsAt, taxRateId, sku, stock, weightKg, lengthCm, widthCm, isFeatured, isMadeToOrder, soldByLength, lengthStepCm, lengthMinCm, badge, brand, translations }, { changedBy = null } = {}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Vente à la coupe (ADM-12) — voir update() pour le détail des valeurs par défaut
    const cut = soldByLength ? 1 : 0;
    const step = cut ? (Number(lengthStepCm) || 10) : 10;
    const minLen = cut ? (Number(lengthMinCm) || 50) : 50;

    const [result] = await connection.execute(
      `INSERT INTO products (category_id, supplier_id, slug, price_chf, compare_price_chf, promo_starts_at, promo_ends_at, tax_rate_id, sku, stock, weight_kg, length_cm, width_cm, is_featured, is_made_to_order, sold_by_length, length_step_cm, length_min_cm, badge, brand, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock || 0, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, cut, step, minLen, badge || null, brand || null]
    );
    const productId = result.insertId;

    // Prix de départ (ADM-21) — premier jalon de l'historique du produit
    await recordPriceChange(connection, productId, null, { priceChf, comparePriceChf, promoStartsAt, promoEndsAt }, { source: 'admin', changedBy });

    // Insertion des traductions
    for (const [locale, trans] of Object.entries(translations)) {
      await connection.execute(
        `INSERT INTO product_translations (product_id, locale, name, description, slug)
         VALUES (?, ?, ?, ?, ?)`,
        [productId, locale, trans.name, trans.description || null, trans.slug || slug]
      );
    }

    /* Rayons du produit (ADM-04) — dans la même transaction : un produit ne doit
       jamais exister sans son rattachement principal. */
    await productCategoryRepository.replaceForProduct(productId, categoryId, secondaryCategoryIds, connection);

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
const update = async (id, { categoryId, secondaryCategoryIds, supplierId, slug, priceChf, comparePriceChf, promoStartsAt, promoEndsAt, taxRateId, sku, stock, weightKg, lengthCm, widthCm, isFeatured, isMadeToOrder, soldByLength, lengthStepCm, lengthMinCm, isActive, badge, brand, translations }, { changedBy = null } = {}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    /* Prix AVANT modification, lu dans la transaction (ADM-21). La lecture doit
       précéder l'UPDATE, sinon l'ancienne valeur est déjà perdue. */
    const [[previous]] = await connection.execute(
      'SELECT price_chf, compare_price_chf, promo_starts_at, promo_ends_at FROM products WHERE id = ?',
      [id]
    );

    /* slug non modifiable en édition — on ne le met à jour que s'il est fourni */
    const slugClause = slug ? 'slug = ?,' : '';
    /* Vente à la coupe (ADM-12) — les valeurs par défaut (10 cm / 50 cm) ne
       s'appliquent que si l'article est bien vendu au mètre : laisser un pas sur
       un article vendu à l'unité n'aurait aucun sens et brouillerait la fiche. */
    const cut = soldByLength ? 1 : 0;
    const step = cut ? (Number(lengthStepCm) || 10) : 10;
    const minLen = cut ? (Number(lengthMinCm) || 50) : 50;

    const baseParams = slug
      ? [categoryId, supplierId || null, slug, priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, cut, step, minLen, badge || null, brand || null, isActive ? 1 : 0, id]
      : [categoryId, supplierId || null,       priceChf, comparePriceChf || null, promoStartsAt || null, promoEndsAt || null, taxRateId, sku || null, stock, weightKg || null, lengthCm || null, widthCm || null, isFeatured ? 1 : 0, isMadeToOrder ? 1 : 0, cut, step, minLen, badge || null, brand || null, isActive ? 1 : 0, id];

    await connection.execute(
      `UPDATE products SET category_id = ?, supplier_id = ?, ${slugClause} price_chf = ?,
       compare_price_chf = ?, promo_starts_at = ?, promo_ends_at = ?,
       tax_rate_id = ?, sku = ?, stock = ?, weight_kg = ?, length_cm = ?, width_cm = ?,
       is_featured = ?, is_made_to_order = ?,
       sold_by_length = ?, length_step_cm = ?, length_min_cm = ?,
       badge = ?, brand = ?, is_active = ? WHERE id = ?`,
      baseParams
    );

    // Historique du prix — dans la même transaction que le changement lui-même
    await recordPriceChange(connection, id, previous, { priceChf, comparePriceChf, promoStartsAt, promoEndsAt }, { source: 'admin', changedBy });

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

    /* Rayons du produit (ADM-04). `secondaryCategoryIds` absent = mise à jour
       partielle qui ne touche pas aux rayons : on se contente alors de garder la
       catégorie principale synchronisée avec products.category_id. Un tableau
       vide, lui, signifie bien « plus aucun rayon secondaire ». */
    const secondaries = Array.isArray(secondaryCategoryIds)
      ? secondaryCategoryIds
      : (await productCategoryRepository.findByProductId(id))
          .filter((row) => !row.is_primary)
          .map((row) => row.category_id);

    await productCategoryRepository.replaceForProduct(id, categoryId, secondaries, connection);

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
            p.weight_kg, p.length_cm, p.width_cm, p.is_featured, p.is_made_to_order, p.is_active, p.badge, p.brand, p.category_id, p.category_needs_review, p.supplier_id,
            -- Vente à la coupe (ADM-12) : sans ces colonnes, l'administration ne
            -- pouvait ni afficher ni régler le pas et le minimum de découpe
            p.sold_by_length, p.length_step_cm, p.length_min_cm,
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

  // Rayons secondaires (ADM-04) — la catégorie principale reste portée par category_id
  const categories = await productCategoryRepository.findByProductId(id, locale);
  const secondaryCategoryIds = categories.filter((row) => !row.is_primary).map((row) => row.category_id);

  return { ...rows[0], description_fr: rows[0].description, images, secondary_category_ids: secondaryCategoryIds };
};

const ALLOWED_SORT_ADMIN = {
  created_at: 'p.created_at',
  price_chf:  'p.price_chf',
  name:       'pt.name',
  stock:      'p.stock',
};

// Exécution d'une passe de recherche admin — rappelée par findAllAdmin() avec
// des termes élargis quand la saisie exacte ne donne aucun résultat.
const runFindAllAdmin = async ({
  page = 1, limit = 20, search = '',
  categoryId = null, supplierId = null, brand = null,
  minPrice = null, maxPrice = null,
  inStock = false, lowStock = false,
  isActive = null, isFeatured = null,
  needsCategoryReview = null,
  sort = 'created_at', order = 'desc',
  imageFirst = false,
  fuzzyTerms = null,
} = {}) => {
  const offset = (page - 1) * limit;
  // Vitrine home bento : même ordre que la boutique (featured_order), pas le tri générique demandé —
  // sinon la bande "Vitrine home" de l'admin et la home affichent deux ordres différents.
  const sortField = isFeatured
    ? 'p.featured_order IS NULL, p.featured_order, p.created_at'
    : (ALLOWED_SORT_ADMIN[sort] || 'p.created_at');
  const sortOrder = isFeatured ? 'ASC' : (order === 'asc' ? 'ASC' : 'DESC');
  /* Produits illustrés en premier — même logique que la boutique (voir
     product.repository.js) : le catalogue photo est incomplet, et un écran de
     vignettes vides est inexploitable quand on choisit un produit pour son image.
     Activé à la demande (sélecteur de la vitrine), pas sur la liste admin où le
     tri demandé par l'utilisatrice doit primer.
     `pi.id IS NULL` vaut 0 (avec image) ou 1 (sans), donc ASC remonte les illustrés. */
  const imageFirstSql = imageFirst ? 'pi.id IS NULL ASC, ' : '';

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
  /* `fuzzyTerms` est fourni par le repli anti-faute de findAllAdmin() : la saisie
     reste la même, seuls les mots sont raccourcis pour élargir le LIKE. */
  const searchTerms = fuzzyTerms ?? toSearchTerms(search);
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      where += ' AND (pt.name LIKE ? OR p.sku LIKE ? OR sup.name LIKE ? OR p.brand LIKE ?)';
      const like = `%${term}%`;
      params.push(like, like, like, like);
    }
  }

  /* Classement par pertinence — signalement cliente du 2026-09-16 : en cherchant
     « 310 » (un coloris de fil DMC), les 4 articles portant ce numéro dans leur
     NOM arrivaient aux rangs 29, 34, 35 et 38, derrière 34 articles qui ne le
     portaient que dans leur référence fournisseur (« PE92-1310 », « RI2310AC »).
     Le tri se faisait uniquement par date de création, sans notion de pertinence.

     Quatre paliers, du plus au moins pertinent :
       0. le nom commence par le terme       — « 310 » → « 310 Noir »
       1. le nom contient le terme           — « DMC mouliné N° 310 »
       2. la référence commence par le terme — « 310-A »
       3. le reste (référence au milieu, fournisseur, gamme)
     Chaque terme de la recherche compte : « DMC 310 » privilégie un article dont
     le nom porte les deux mots. */
  const relevanceSql = searchTerms.length > 0
    ? `(${searchTerms.map(() => `
        CASE
          WHEN pt.name LIKE ? THEN 0
          WHEN pt.name LIKE ? THEN 1
          WHEN p.sku  LIKE ? THEN 2
          ELSE 3
        END`).join(' + ')}) ASC, `
    : '';
  const relevanceParams = searchTerms.flatMap((term) => [`${term}%`, `%${term}%`, `${term}%`]);
  if (brand) {
    where += ' AND p.brand = ?';
    params.push(brand);
  }
  if (categoryId) {
    /* Inclut la catégorie choisie ET toute sa descendance (hiérarchie à 3 niveaux max).
       Rattachement lu sur product_categories (ADM-04) : un article rangé ici en
       rayon secondaire doit apparaître dans la liste de cette catégorie. */
    where += ` AND EXISTS (
      SELECT 1 FROM product_categories pc
      WHERE pc.product_id = p.id
        AND pc.category_id IN (
          SELECT descendant.id
          FROM categories descendant
          LEFT JOIN categories parent ON parent.id = descendant.parent_id
          WHERE descendant.id = ? OR descendant.parent_id = ? OR parent.parent_id = ?
        )
    )`;
    params.push(categoryId, categoryId, categoryId);
  }
  /* Articles dont le classement reste à confirmer par la cliente (ADM-04) —
     14 670 lignes au réimport du 2026-09-16, à reclasser progressivement. */
  if (needsCategoryReview !== null) {
    where += ' AND p.category_needs_review = ?';
    params.push(needsCategoryReview ? 1 : 0);
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
            p.is_active, p.is_featured, p.is_made_to_order, p.badge, p.brand, p.category_id, p.category_needs_review, p.supplier_id, p.tax_rate_id, p.created_at,
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
     ORDER BY ${imageFirstSql}${relevanceSql}${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    /* Les paramètres du ORDER BY viennent APRÈS ceux du WHERE : c'est l'ordre
       d'apparition des « ? » dans la requête qui compte, pas l'ordre des clauses
       dans le code. */
    [...params, ...relevanceParams, limit, offset]
  );

  return { rows, total };
};

/* Recherche admin avec repli anti-faute de frappe.

   La boutique rattrape « mouliner » ou « coussn » depuis le correctif du
   2026-09-16 ; l'administration, elle, restait à zéro résultat. C'est
   exactement l'écart que l'on veut éviter : une recherche qui aboutit côté
   boutique doit aboutir ici, sinon la cliente ne comprend pas pourquoi elle
   trouve un article en vitrine et pas dans son back-office.

   Même règle que la boutique (voir product.repository.js) : on ne raccourcit
   les mots que si la saisie exacte n'a rien donné, et jamais les mots de 5
   lettres ou moins — tronquer « aida » ou « chat » remonterait n'importe quoi. */
const MIN_LENGTH_FOR_TRUNCATION = 6;
const MIN_KEPT_CHARS = 4;
const TRUNCATED_CHARS = 2;

const toFuzzyTerms = (search) => {
  const terms = toSearchTerms(search);
  if (terms.length === 0) return null;

  let truncated = false;
  const out = terms.map((term) => {
    if (term.length < MIN_LENGTH_FOR_TRUNCATION) return term;
    truncated = true;
    return term.slice(0, Math.max(MIN_KEPT_CHARS, term.length - TRUNCATED_CHARS));
  });

  // Aucun mot assez long : le repli donnerait le même résultat, inutile de
  // relancer une seconde requête.
  return truncated ? out : null;
};

const findAllAdmin = async (options = {}) => {
  const result = await runFindAllAdmin(options);
  if (result.total > 0 || !options.search) return result;

  const fuzzyTerms = toFuzzyTerms(options.search);
  if (!fuzzyTerms) return result;

  const fuzzyResult = await runFindAllAdmin({ ...options, fuzzyTerms });
  // `isFuzzy` permet à l'administration d'annoncer des résultats approchés
  // plutôt que de laisser croire à une correspondance exacte.
  return fuzzyResult.total > 0 ? { ...fuzzyResult, isFuzzy: true } : result;
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

/* Historique des prix d'un produit, du plus récent au plus ancien (ADM-21).
   Jointure sur users pour nommer l'auteur du changement — LEFT JOIN car
   `changed_by` est NULL pour les imports et les scripts en masse, et le compte
   peut avoir été supprimé depuis (ON DELETE SET NULL). */
const findPriceHistory = async (productId, { limit = 50, offset = 0 } = {}) => {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM product_price_history WHERE product_id = ?',
    [productId]
  );

  const [rows] = await pool.query(
    `SELECT h.id, h.old_price_chf, h.old_compare_price_chf,
            h.new_price_chf, h.new_compare_price_chf,
            h.promo_starts_at, h.promo_ends_at,
            h.source, h.changed_at,
            u.first_name AS changed_by_first_name,
            u.last_name  AS changed_by_last_name
     FROM product_price_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.product_id = ?
     ORDER BY h.changed_at DESC, h.id DESC
     LIMIT ? OFFSET ?`,
    [productId, limit, offset]
  );

  return { rows, total };
};

module.exports = { create, update, softDelete, addImage, removeImage, setPrimaryImage, findAllAdmin, findByIdAdmin, slugExists, skuExists, updateFeaturedOrder, findPriceHistory };
