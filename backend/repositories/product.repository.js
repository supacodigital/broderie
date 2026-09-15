const { pool } = require('../config/db');
const { toSearchTerms } = require('../utils/search.utils');
const { promoPriceColumns, effectivePriceSql } = require('../utils/promo.utils');

// Colonnes produit sélectionnées explicitement — jamais SELECT *
// Fallback FR : COALESCE vers pt_fr/ct_fr si la traduction demandée (locale) est absente
// avg_rating / review_count : colonnes dénormalisées (products.rating_avg/rating_count),
// tenues à jour à l'approbation/suppression d'un avis — pas de jointure reviews ni de GROUP BY.
// price_chf / compare_price_chf sont réécrits par promoPriceColumns() : hors
// fenêtre de promotion, le prix normal reprend la main et plus rien n'est barré.
const PRODUCT_COLUMNS = `
  p.id, p.slug, p.sku, p.stock,
  ${promoPriceColumns('p')},
  ${effectivePriceSql('p')} AS price_chf,
  p.promo_starts_at, p.promo_ends_at,
  p.weight_kg, p.length_cm, p.width_cm, p.is_featured, p.featured_order, p.is_made_to_order, p.badge, p.brand, p.category_id, p.supplier_id, p.created_at,
  COALESCE(pt.name, pt_fr.name) AS name,
  COALESCE(pt.description, pt_fr.description) AS description,
  COALESCE(ct.name, ct_fr.name) AS category_name,
  c.slug AS category_slug,
  pi.url AS image_url, pi.url_medium AS image_url_medium, pi.alt AS image_alt,
  tr.rate AS tax_rate, tr.name AS tax_name,
  p.rating_avg AS avg_rating,
  p.rating_count AS review_count
`;

/* Prépare la requête utilisateur pour un MATCH ... AGAINST en BOOLEAN MODE.
   Chaque mot devient « +mot* » : « + » impose la présence du terme (sinon MySQL
   applique un OU implicite et remonte n'importe quel produit partageant un seul
   mot), « * » autorise le préfixe (« mouline » trouve « moulinés »).
   Auparavant le « * » était collé à la phrase entière (« coton mouliné* »), donc
   seul le dernier mot bénéficiait du préfixe et les termes restaient en OU.
   Les caractères réservés du BOOLEAN MODE sont retirés : saisis tels quels par un
   client (« + », « -», « ~ », « < », « > », « ( ) », « * », « " »), ils changent le
   sens de la requête ou provoquent une erreur SQL. */
const RESERVED_FT_CHARS = /[+\-~<>()*"@]/g;

/* Le passage au singulier est partagé avec la recherche admin — voir
   utils/search.utils.js pour le détail du cas « cotons moulinés ». */
const toBooleanQuery = (q) =>
  toSearchTerms(String(q).replace(RESERVED_FT_CHARS, ' '))
    .map((token) => `+${token}*`)
    .join(' ');

// Construction dynamique des filtres WHERE pour la liste produits
// `locale` sert uniquement au fallback FR de la recherche FULLTEXT (pt peut être vide si la traduction manque)
const buildFilters = (filters) => {
  const conditions = ['p.is_active = 1', 'p.deleted_at IS NULL'];
  const params = [];
  let booleanQuery = null;

  if (filters.q) {
    // Fallback FR : si la traduction dans la locale demandée est absente, chercher dans pt_fr
    // (même pattern que search() ci-dessous) — sinon aucun produit ne matche en de/en tant qu'il
    // n'existe pas de traduction pour cette langue.
    // La marque est incluse via LIKE : beaucoup de produits ne portent pas leur matière
    // dans le nom (« DMC mouliné N° 745 » ne contient pas « coton »), et l'utilisateur
    // cherche pourtant par marque. La marque n'est pas dans l'index FULLTEXT, d'où le LIKE.
    booleanQuery = toBooleanQuery(filters.q);
    if (booleanQuery) {
      conditions.push(`(
        MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)
        OR MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE)
        OR p.brand LIKE ?
      )`);
      params.push(booleanQuery, booleanQuery, `%${filters.q}%`);
    }
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    conditions.push(`p.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`);
    params.push(...filters.categoryIds);
  } else if (filters.categoryId) {
    conditions.push('p.category_id = ?');
    params.push(filters.categoryId);
  }
  /* Filtres de prix appliqués au prix RÉELLEMENT payé : un produit dont la promo
     est expirée doit être filtré sur son prix normal, pas sur l'ancien prix promo. */
  if (filters.minPrice !== undefined) {
    conditions.push(`${effectivePriceSql('p')} >= ?`);
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(`${effectivePriceSql('p')} <= ?`);
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
    conditions.push('p.rating_avg >= ?');
    params.push(parseFloat(filters.minRating));
  }
  if (filters.brand) {
    // Filtre par marque / éditeur — correspondance exacte (index idx_products_active_brand)
    conditions.push('p.brand = ?');
    params.push(filters.brand);
  }

  return { conditions, params, booleanQuery };
};

// Champs autorisés pour le tri — protection contre l'injection
const ALLOWED_SORT_FIELDS = {
  created_at: 'p.created_at',
  updated_at: 'p.updated_at',
  // Tri sur le prix réellement payé — une promo expirée ne doit plus peser sur l'ordre
  price_chf: effectivePriceSql('p'),
  name: 'COALESCE(pt.name, pt_fr.name)',
  stock: 'p.stock',
  avg_rating: 'p.rating_avg',
};

// Liste paginée des produits avec filtres
const findAll = async ({ locale = 'fr', page = 1, limit = 20, sort = 'created_at', order = 'desc', ...filters }) => {
  const { conditions, params, booleanQuery } = buildFilters(filters);
  // Vitrine home bento : ordre défini manuellement par l'admin (featured_order), pas par sort/order —
  // garantit que l'admin et la home affichent toujours exactement le même ordre pour is_featured = 1.
  // Fallback created_at ASC pour les produits jamais réordonnés (featured_order NULL).
  /* Recherche en cours : on trie par pertinence FULLTEXT, sauf si l'utilisateur a
     explicitement choisi un tri (prix, nom…). Trier des résultats de recherche par date
     de création remontait des articles sans rapport avant les correspondances évidentes :
     chercher « cotons moulinés » affichait des kits récents avant les moulinés eux-mêmes. */
  const relevanceSort = booleanQuery && (!sort || sort === 'created_at');
  const sortField = filters.featured
    ? 'p.featured_order IS NULL, p.featured_order, p.created_at'
    : relevanceSort
      ? 'relevance'
      : (ALLOWED_SORT_FIELDS[sort] || 'p.created_at');
  const sortOrder = filters.featured ? 'ASC' : relevanceSort ? 'DESC' : (order === 'asc' ? 'ASC' : 'DESC');
  /* Produits illustrés en premier : le catalogue photo est incomplet (les lots de
     photos arrivent par vagues), et une page entière de vignettes vides donne une
     mauvaise première impression. `pi.id IS NULL` vaut 0 (avec image) ou 1 (sans),
     donc ASC remonte les produits illustrés — le tri demandé s'applique ensuite.
     Neutralisé pour la home bento (ordre manuel de l'admin) et pour la recherche
     (la pertinence prime : masquer une correspondance exacte parce qu'elle n'a pas
     de photo serait pire).
     À retirer quand tous les lots seront importés : voir database/README.md. */
  const imageFirst = !filters.featured && !relevanceSort ? 'pi.id IS NULL ASC, ' : '';
  const offset = (page - 1) * limit;

  // Requête de comptage. Tout produit a toujours une traduction FR (translations.fr
  // obligatoire à la création), donc pour un COUNT sans recherche on n'a besoin ni de
  // joindre les traductions ni de la garde IS NOT NULL — l'optimiseur utilise
  // directement l'index sur products. La recherche (filters.q) contient un MATCH sur
  // pt/pt_fr → là on garde les deux jointures.
  let total;
  if (filters.q) {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
       LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
       WHERE ${conditions.join(' AND ')} AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)`,
      [locale, ...params]
    );
    total = countRows[0].total;
  } else {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM products p WHERE ${conditions.join(' AND ')}`,
      [...params]
    );
    total = countRows[0].total;
  }

  /* Score de pertinence : le nom pèse double face à la description — un produit dont le
     NOM contient les termes cherchés est une meilleure réponse qu'un produit qui ne les
     mentionne que dans son texte descriptif. */
  const relevanceSelect = relevanceSort
    ? `, (
         2 * COALESCE(MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE), 0)
         + COALESCE(MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE), 0)
       ) AS relevance`
    : '';
  const relevanceParams = relevanceSort ? [booleanQuery, booleanQuery] : [];

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}${relevanceSelect}
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = p.category_id AND ct_fr.locale = 'fr'
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE ${conditions.join(' AND ')} AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
     ORDER BY ${imageFirst}${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...relevanceParams, locale, locale, ...params, limit, offset]
  );

  return { rows, total };
};

// Détail d'un produit par id avec images et variantes
const findById = async (id, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slug, p.sku, p.stock,
            ${promoPriceColumns('p')},
            ${effectivePriceSql('p')} AS price_chf,
            p.promo_starts_at, p.promo_ends_at,
            p.weight_kg, p.length_cm, p.width_cm, p.is_featured, p.is_made_to_order, p.badge, p.brand, p.category_id, p.supplier_id, p.created_at,
            COALESCE(pt.name, pt_fr.name) AS name,
            COALESCE(pt.description, pt_fr.description) AS description,
            COALESCE(ct.name, ct_fr.name) AS category_name,
            COALESCE(ct.description, ct_fr.description) AS category_description,
            c.slug AS category_slug,
            tr.rate AS tax_rate, tr.name AS tax_name,
            sup.made_to_order_delay_min_weeks, sup.made_to_order_delay_max_weeks,
            p.rating_avg AS avg_rating,
            p.rating_count AS review_count
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = p.category_id AND ct_fr.locale = 'fr'
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN suppliers sup ON sup.id = p.supplier_id
     WHERE p.id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
       AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
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

  const qBoolean = toBooleanQuery(q);
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
       AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
       AND (MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)
            OR MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE))`,
    [locale, qBoolean, qBoolean]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS},
            GREATEST(
              COALESCE(MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE), 0),
              COALESCE(MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE), 0)
            ) AS relevance
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = p.category_id AND ct_fr.locale = 'fr'
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
       AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
       AND (MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)
            OR MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE))
     ORDER BY relevance DESC
     LIMIT ? OFFSET ?`,
    [qBoolean, qBoolean, locale, locale, qBoolean, qBoolean, limit, offset]
  );

  return { rows, total };
};

// Produits par catégorie (id de la catégorie)
const findByCategoryId = async ({ categoryId, locale = 'fr', page = 1, limit = 20, sort = 'created_at', order = 'desc' }) => {
  const sortField = ALLOWED_SORT_FIELDS[sort] || 'p.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  // Produits illustrés en premier — même raison que dans findAll()
  const imageFirst = 'pi.id IS NULL ASC, ';
  const offset = (page - 1) * limit;

  // Tout produit a une traduction FR → pas besoin de joindre les traductions pour le COUNT
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM products p
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.category_id = ?`,
    [categoryId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = p.category_id AND ct_fr.locale = 'fr'
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.category_id = ?
       AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
     ORDER BY ${imageFirst}${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [locale, locale, categoryId, limit, offset]
  );

  return { rows, total };
};

// Détail d'un produit par slug avec images et variantes
const findBySlug = async (slug, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slug, p.sku, p.stock,
            ${promoPriceColumns('p')},
            ${effectivePriceSql('p')} AS price_chf,
            p.promo_starts_at, p.promo_ends_at,
            p.weight_kg, p.length_cm, p.width_cm, p.is_featured, p.is_made_to_order, p.badge, p.brand, p.category_id, p.supplier_id, p.created_at,
            COALESCE(pt.name, pt_fr.name) AS name,
            COALESCE(pt.description, pt_fr.description) AS description,
            COALESCE(ct.name, ct_fr.name) AS category_name,
            COALESCE(ct.description, ct_fr.description) AS category_description,
            c.slug AS category_slug,
            tr.rate AS tax_rate, tr.name AS tax_name,
            sup.made_to_order_delay_min_weeks, sup.made_to_order_delay_max_weeks,
            p.rating_avg AS avg_rating,
            p.rating_count AS review_count
     FROM products p
     LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = ?
     LEFT JOIN product_translations pt_fr ON pt_fr.product_id = p.id AND pt_fr.locale = 'fr'
     LEFT JOIN category_translations ct ON ct.category_id = p.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = p.category_id AND ct_fr.locale = 'fr'
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
     LEFT JOIN suppliers sup ON sup.id = p.supplier_id
     WHERE p.slug = ? AND p.is_active = 1 AND p.deleted_at IS NULL
       AND (pt.name IS NOT NULL OR pt_fr.name IS NOT NULL)
     LIMIT 1`,
    [locale, locale, slug]
  );

  if (!rows[0]) return null;
  const id = rows[0].id;

  const [images] = await pool.execute(
    // url_medium / url_large : indispensables au srcset de la galerie (fiche produit)
    `SELECT id, url, url_medium, url_large, alt, sort_order, is_primary
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

// Liste des marques distinctes présentes au catalogue (produits actifs) —
// alimente le filtre « Marque » de la boutique. Triée alphabétiquement.
const findAllBrands = async () => {
  const [rows] = await pool.execute(
    `SELECT DISTINCT brand
     FROM products
     WHERE is_active = 1 AND deleted_at IS NULL AND brand IS NOT NULL AND brand <> ''
     ORDER BY brand ASC`
  );
  return rows.map((r) => r.brand);
};

module.exports = { findAll, findById, findBySlug, search, findByCategoryId, findAllBrands };
