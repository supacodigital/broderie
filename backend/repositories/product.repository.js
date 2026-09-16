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

/* Repli sur préfixe tronqué — rattrape les fautes de frappe.
   Le FULLTEXT est strict : « mouliner » ou « moulne » ne trouvent rien alors que le
   catalogue est plein de « mouliné ». Le joker « * » ne joue qu'en fin de terme, il
   ne corrige donc jamais une lettre en trop ou erronée.

   Ce repli raccourcit chaque mot de 2 lettres pour élargir le préfixe :
   « mouliner » → « +moulin* » (1008 résultats), « moulne » → « +moul* » (1013).
   Il n'est utilisé QUE si la recherche normale n'a rien donné — une recherche qui
   aboutit n'est jamais élargie, donc aucune perte de précision au quotidien.

   Les mots de 5 lettres ou moins sont laissés intacts : tronquer « aida » ou « chat »
   produirait un préfixe si court qu'il remonterait n'importe quoi. Pour la même
   raison on ne descend jamais sous 4 lettres conservées.

   Écarté au passage : passer les termes en OU au lieu de ET. Mesuré sur le catalogue,
   « kit chat noir » serait passé de 11 à 10 896 résultats (70 % de la boutique) sans
   rien corriger — les vraies fautes de frappe restaient à 0. */
const MIN_LENGTH_FOR_TRUNCATION = 6;
const MIN_KEPT_CHARS = 4;
const TRUNCATED_CHARS = 2;

const toFuzzyBooleanQuery = (q) => {
  const terms = toSearchTerms(String(q).replace(RESERVED_FT_CHARS, ' '));
  if (terms.length === 0) return null;

  let truncated = false;
  const tokens = terms.map((token) => {
    if (token.length < MIN_LENGTH_FOR_TRUNCATION) return `+${token}*`;
    truncated = true;
    return `+${token.slice(0, Math.max(MIN_KEPT_CHARS, token.length - TRUNCATED_CHARS))}*`;
  });

  // Aucun mot assez long pour être tronqué : le repli serait identique à la requête
  // initiale, inutile de relancer une seconde requête pour le même résultat.
  return truncated ? tokens.join(' ') : null;
};

/* Référence produit (SKU / EAN) saisie par la cliente.
   Les catalogues papier des éditeurs (Permin, Lanarte, Bonheur des Dames…) impriment
   la référence de l'article : elle est donc recopiée telle quelle dans la barre de
   recherche. Aucun de ces codes n'était trouvable — ni le SKU ni l'EAN ne figurent
   dans l'index FULLTEXT, qui ne couvre que le nom et la description.

   Les séparateurs sont retirés des deux côtés de la comparaison : 4709 SKU
   contiennent un tiret (« 1006-5860 »), que la cliente saisit indifféremment
   « 1006-5860 », « 1006 5860 » ou « 10065860 ».
   La casse n'a pas à être traitée : la collation utf8mb4_unicode_ci est déjà
   insensible à la casse. */
const REFERENCE_SEPARATORS = /[\s.\-_/]/g;

const toReference = (q) => String(q ?? '').trim().replace(REFERENCE_SEPARATORS, '');

/* Une saisie n'est traitée comme une référence que si elle contient au moins un
   chiffre et pas d'espace interne une fois nettoyée : sans cette garde, « kit »
   ou « lin » déclencheraient une comparaison de référence inutile sur chaque
   requête. Toutes les références du catalogue comportent des chiffres. */
const looksLikeReference = (q) => {
  const ref = toReference(q);
  return ref.length >= 3 && ref.length <= 20 && /[0-9]/.test(ref);
};

// Construction dynamique des filtres WHERE pour la liste produits
// `locale` sert uniquement au fallback FR de la recherche FULLTEXT (pt peut être vide si la traduction manque)
const buildFilters = (filters) => {
  const conditions = ['p.is_active = 1', 'p.deleted_at IS NULL'];
  const params = [];
  let booleanQuery = null;
  let referenceQuery = null;

  if (filters.q) {
    // Fallback FR : si la traduction dans la locale demandée est absente, chercher dans pt_fr
    // (même pattern que search() ci-dessous) — sinon aucun produit ne matche en de/en tant qu'il
    // n'existe pas de traduction pour cette langue.
    // La marque est incluse via LIKE : beaucoup de produits ne portent pas leur matière
    // dans le nom (« DMC mouliné N° 745 » ne contient pas « coton »), et l'utilisateur
    // cherche pourtant par marque. La marque n'est pas dans l'index FULLTEXT, d'où le LIKE.
    /* `fuzzyQuery` est fourni par le repli anti-faute de findAll() : la saisie reste
       la même, seuls les préfixes FULLTEXT sont élargis. */
    booleanQuery = filters.fuzzyQuery ?? toBooleanQuery(filters.q);
    /* Comparaison de référence ajoutée en OU : une cliente qui saisit « PE5860 »
       doit trouver l'article, mais « 310 » doit continuer de remonter les
       moulinés N° 310 par le nom — d'où un OU et non un court-circuit. */
    referenceQuery = looksLikeReference(filters.q) ? toReference(filters.q) : null;
    const referenceSql = referenceQuery
      ? ` OR REPLACE(REPLACE(REPLACE(p.sku, '-', ''), ' ', ''), '.', '') = ?
          OR p.ean = ?`
      : '';

    if (booleanQuery) {
      conditions.push(`(
        MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE)
        OR MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE)
        OR p.brand LIKE ?${referenceSql}
      )`);
      params.push(booleanQuery, booleanQuery, `%${filters.q}%`);
      if (referenceQuery) params.push(referenceQuery, referenceQuery);
    } else {
      /* Saisie composée uniquement de caractères réservés au BOOLEAN MODE
         (« +++ », « *** », « " »…) : après nettoyage il ne reste aucun terme.
         Sans cette branche aucune condition n'était ajoutée et la recherche
         renvoyait le catalogue entier, comme si rien n'avait été demandé.
         On se rabat sur la marque, puis le LIKE ne matche rien et la boutique
         affiche « aucun résultat » — ce que l'utilisateur attend. */
      conditions.push('p.brand LIKE ?');
      params.push(`%${filters.q}%`);
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

  return { conditions, params, booleanQuery, referenceQuery };
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
// Exécution d'une passe de recherche — appelée une seconde fois par findAll() avec
// une requête élargie quand la saisie exacte ne donne aucun résultat.
const runFindAll = async ({ locale = 'fr', page = 1, limit = 20, sort = 'created_at', order = 'desc', ...filters }) => {
  const { conditions, params, booleanQuery, referenceQuery } = buildFilters(filters);
  // Vitrine home bento : ordre défini manuellement par l'admin (featured_order), pas par sort/order —
  // garantit que l'admin et la home affichent toujours exactement le même ordre pour is_featured = 1.
  // Fallback created_at ASC pour les produits jamais réordonnés (featured_order NULL).
  /* Recherche en cours : on trie par pertinence FULLTEXT, sauf si l'utilisateur a
     explicitement choisi un tri (prix, nom…). Trier des résultats de recherche par date
     de création remontait des articles sans rapport avant les correspondances évidentes :
     chercher « cotons moulinés » affichait des kits récents avant les moulinés eux-mêmes. */
  /* La pertinence s'applique aussi quand la saisie est une référence : sans cela une
     recherche « PE5860 » retombait sur le tri par date et noyait la correspondance
     exacte au milieu des articles récents. */
  const relevanceSort = (booleanQuery || referenceQuery) && (!sort || sort === 'created_at');
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
  /* Une correspondance exacte de référence vaut 1000 : elle passe devant n'importe quel
     score FULLTEXT (qui dépasse rarement quelques unités). La cliente qui saisit une
     référence de catalogue veut cet article précis, en première position. */
  const referenceScoreSql = referenceQuery
    ? `1000 * (REPLACE(REPLACE(REPLACE(p.sku, '-', ''), ' ', ''), '.', '') = ? OR p.ean = ?) + `
    : '';
  const relevanceSelect = relevanceSort
    ? `, (
         ${referenceScoreSql}2 * COALESCE(MATCH(pt.name, pt.description) AGAINST(? IN BOOLEAN MODE), 0)
         + COALESCE(MATCH(pt_fr.name, pt_fr.description) AGAINST(? IN BOOLEAN MODE), 0)
       ) AS relevance`
    : '';
  /* L'ordre des paramètres suit celui des « ? » dans le SELECT : référence d'abord.
     `booleanQuery` peut être vide si la saisie est une pure référence (« PE5860 ») —
     AGAINST('') renvoie simplement 0, le score de référence fait alors tout le travail. */
  const relevanceParams = relevanceSort
    ? [
        ...(referenceQuery ? [referenceQuery, referenceQuery] : []),
        booleanQuery ?? '',
        booleanQuery ?? '',
      ]
    : [];

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

/* Recherche produit avec repli anti-faute de frappe.
   La saisie exacte est toujours tentée en premier : une recherche qui aboutit n'est
   jamais élargie. Ce n'est qu'en l'absence totale de résultat qu'on relance la même
   requête avec des préfixes raccourcis (voir toFuzzyBooleanQuery).
   Le repli ne s'applique qu'à une vraie recherche texte : filtrer sur une catégorie
   vide doit continuer d'afficher « aucun produit », pas des articles sans rapport. */
const findAll = async (options) => {
  const result = await runFindAll(options);
  if (result.total > 0 || !options.q) return result;

  const fuzzyQuery = toFuzzyBooleanQuery(options.q);
  if (!fuzzyQuery) return result;

  const fuzzyResult = await runFindAll({ ...options, q: options.q, fuzzyQuery });
  // `isFuzzy` permet à la boutique d'annoncer « aucun résultat pour X, voici des
  // suggestions proches » plutôt que de faire croire à une correspondance exacte.
  return fuzzyResult.total > 0 ? { ...fuzzyResult, isFuzzy: true } : result;
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
