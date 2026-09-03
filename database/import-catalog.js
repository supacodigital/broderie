#!/usr/bin/env node
/* ============================================================
 * Import du catalogue de la cliente dans la table products.
 *
 * Source : donnees-client/  (export du logiciel métier de la cliente)
 *   - V_ArticleC_INT.xlsx : articles retenus (déjà filtrés côté cliente)
 *   - Gamme.xlsx          : table des gammes (= marques)
 *   - CRFournisseur.xlsx  : liaison article ↔ fournisseur(s)  [NON UTILISÉ ICI —
 *                            la table des fournisseurs eux-mêmes n'a pas été
 *                            transmise ; supplier_id reste NULL]
 *
 * Principe : on importe ce qui est exploitable ; la cliente complète le reste
 * (traductions DE/EN, poids manquants, images, catégories fines) depuis le
 * back-office. Voir docs/IMPORT-CATALOGUE.md.
 *
 * Anti-doublon : UPSERT sur products.external_ref (= NArticleC). Rejouer
 * l'import met à jour prix / stock / nom FR des articles connus, sans jamais
 * dupliquer ni écraser les champs enrichis à la main (description, poids,
 * DE/EN, images, catégorie, is_featured, badge).
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + backend/.env) :
 *   npm run import:catalog -- --dry-run     # rapport complet, n'écrit rien
 *   npm run import:catalog                  # exécute l'import
 *   npm run import:catalog -- --status      # compte ce qui est déjà importé
 *   npm run import:catalog -- --with-theme-tags   # crée aussi les tags "thème"
 *                                                 # (~4000 tags — désactivé par défaut)
 *
 * Prérequis : migration 2026-09-02_products_import_fields.sql appliquée.
 * ============================================================ */

const path = require('path');
const fs = require('fs');

// Dépendances empruntées à backend/ (même approche que database/migrate.js)
const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const { readSheetObjects } = require('./lib/xlsx-reader');
const { resolveCategorySlug } = require('./catalog-category-map');

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const DRY_RUN = has('--dry-run');
const STATUS_ONLY = has('--status');
const WITH_THEME_TAGS = has('--with-theme-tags');

const DATA_DIR = path.join(__dirname, '../donnees-client');
const BATCH_SIZE = 500; // règle projet : import en batch de 500, jamais ligne par ligne

// ── Helpers de conversion ──────────────────────────────────
const roundCHF = (amount) => Math.round(amount * 20) / 20; // obligation légale suisse

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isTrue = (v) => v === '1' || v === 1 || v === true || v === 'true' || v === 'True';

const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

// slugify identique à celui du formulaire admin (ProductForm.jsx)
const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);

// ── Règles d'inclusion / exclusion ─────────────────────────
// Un article est importé si TOUTES ces conditions sont vraies :
//   - Actif = true
//   - PrixVente numérique et > 0
//   - PourTest = 0 (0 = vrai produit ; 1..5 = fiche de test interne)
//   - sa gamme n'est pas dans EXCLUDED_GAMME_NAMES (rabais, port, divers…)
//   - Stock plausible (garde-fou contre les valeurs aberrantes de l'export :
//     ex. "Catalogues divers" = 3.01e24, "Rabais TVA" = 135600.45)
const STOCK_SANITY_MAX = 100000;
const PRICE_SANITY_MAX = 10000;

const classifyArticle = (a) => {
  const reasons = [];

  if (!isTrue(a.Actif)) reasons.push('inactif (Actif=0)');

  const price = toNumber(a.PrixVente);
  if (price === null || price <= 0) reasons.push('prix absent ou <= 0');
  else if (price > PRICE_SANITY_MAX) reasons.push(`prix aberrant (${price})`);

  const pourTest = toNumber(a.PourTest);
  if (pourTest !== null && pourTest !== 0) reasons.push('fiche de test (PourTest != 0)');

  const stock = toNumber(a.Stock);
  if (stock !== null && stock > STOCK_SANITY_MAX) reasons.push(`stock aberrant (${stock})`);

  const categorySlug = resolveCategorySlug(a.Nom_Gamme);
  if (categorySlug === null) reasons.push(`gamme exclue (${a.Nom_Gamme})`);

  return { keep: reasons.length === 0, reasons, categorySlug };
};

// ── Mapping d'un article source → payload products ─────────
const mapArticle = (a, categorySlug, taxRateIdByRate) => {
  const price = roundCHF(toNumber(a.PrixVente));
  const priceFutur = toNumber(a.PrixVenteFutur);
  // PrixVenteFutur > PrixVente  → prix barré (compare_price_chf)
  // sinon (hausse programmée non active, ou égal) → on ignore
  const comparePrice =
    priceFutur !== null && priceFutur > price ? roundCHF(priceFutur) : null;

  // Poids : priorité à PoidsKgVrai (déjà en kg) sinon PoidsG / 1000
  const poidsKg = toNumber(a.PoidsKgVrai);
  const poidsG = toNumber(a.PoidsG);
  let weightKg = null;
  if (poidsKg !== null && poidsKg > 0) weightKg = poidsKg;
  else if (poidsG !== null && poidsG > 0) weightKg = Math.round((poidsG / 1000) * 1000) / 1000;

  const stock = Math.max(0, Math.trunc(toNumber(a.Stock) ?? 0));
  const onInternet = isTrue(a.SurInternet);
  // Commandable sans stock : publié sur le net mais stock à 0
  const isMadeToOrder = onInternet && stock === 0 ? 1 : 0;

  // TVA : 8.1 pour tout le catalogue (le seul "0" de l'export est une ligne de
  // solde qui sera exclue). Fallback = taux normal.
  const rate = toNumber(a.TvaVente);
  const taxRateId =
    (rate !== null && taxRateIdByRate.get(Number(rate.toFixed(1)))) ||
    taxRateIdByRate.get(8.1);

  return {
    external_ref: cleanStr(a.NArticleC),
    sku: cleanStr(a.RefFab),
    ean: cleanStr(a.EAN),
    category_slug: categorySlug,
    price_chf: price,
    compare_price_chf: comparePrice,
    tax_rate_id: taxRateId,
    stock,
    weight_kg: weightKg,
    length_cm: toNumber(a.Longueur),
    width_cm: toNumber(a.Largeur),
    is_made_to_order: isMadeToOrder,
    name_fr: cleanStr(a.LArticle) || `Article ${cleanStr(a.NArticleC)}`,
    description_fr: cleanStr(a.RemarqueFr),
    gamme_name: cleanStr(a.Nom_Gamme),
  };
};

// ── Rapport ────────────────────────────────────────────────
const printReport = (report) => {
  console.log('\n══════════════════════════════════════════════');
  console.log(' RAPPORT D\'IMPORT CATALOGUE' + (DRY_RUN ? '  (DRY-RUN — rien écrit)' : ''));
  console.log('══════════════════════════════════════════════\n');
  console.log(`Articles lus dans V_ArticleC_INT ......... ${report.totalRead}`);
  console.log(`Articles retenus (publiables) ........... ${report.kept}`);
  console.log(`Articles exclus ........................ ${report.excluded}\n`);

  console.log('Motifs d\'exclusion :');
  Object.entries(report.exclusionReasons)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, n]) => console.log(`  ${String(n).padStart(6)}  ${reason}`));

  console.log('\nRépartition par catégorie cible :');
  Object.entries(report.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([slug, n]) => console.log(`  ${String(n).padStart(6)}  ${slug}`));

  console.log('\nComplétude des articles retenus :');
  console.log(`  sans description FR ................... ${report.missingDescription}`);
  console.log(`  sans poids (weight_kg) ............... ${report.missingWeight}   ← à compléter par la cliente`);
  console.log(`  sans EAN ............................. ${report.missingEan}`);
  console.log(`  en stock immédiat ................... ${report.inStock}`);
  console.log(`  « sur commande » (stock 0) .......... ${report.madeToOrder}`);
  console.log(`  avec prix barré (compare_price) .... ${report.withComparePrice}`);

  console.log('\nTags marque à créer / réutiliser ....... ' + report.brandTags);
  if (WITH_THEME_TAGS) console.log('Tags thème à créer / réutiliser ........ ' + report.themeTags);

  if (report.slugCollisions > 0)
    console.log(`\nCollisions de slug résolues (suffixe -2, -3…) : ${report.slugCollisions}`);
  if (report.duplicateEan > 0)
    console.log(`EAN en doublon (2e occurrence mise à NULL) .... ${report.duplicateEan}`);
  if (report.duplicateSkuInExport > 0)
    console.log(`SKU en doublon dans l'export (2e ligne exclue) : ${report.duplicateSkuInExport}`);
  if (report.skuConflictForeign > 0)
    console.log(`SKU déjà pris par une fiche hors import (exclu) : ${report.skuConflictForeign}`);

  if (!DRY_RUN) {
    console.log('\n── Écriture ──');
    console.log(`  produits créés ...................... ${report.inserted}`);
    console.log(`  produits mis à jour ................ ${report.updated}`);
  }
  console.log('');
};

// ── Programme principal ────────────────────────────────────
async function main() {
  // Vérif présence des fichiers
  const articlesPath = path.join(DATA_DIR, 'V_ArticleC_INT.xlsx');
  if (!fs.existsSync(articlesPath)) {
    throw new Error(`Fichier introuvable : ${articlesPath}\nPlacez l'export de la cliente dans donnees-client/`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'broderie',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    // batch : INSERT ... VALUES (...),(...) — query() et non execute()
  });

  try {
    // Garde : la migration doit être appliquée
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
         AND COLUMN_NAME IN ('external_ref', 'ean')`
    );
    if (cols.length < 2) {
      throw new Error(
        'Colonnes products.external_ref / products.ean absentes.\n' +
          'Appliquez d\'abord : npm run db:migrate'
      );
    }

    if (STATUS_ONLY) {
      const [[{ n }]] = await connection.query(
        `SELECT COUNT(*) AS n FROM products WHERE external_ref IS NOT NULL AND deleted_at IS NULL`
      );
      const [[{ total }]] = await connection.query(
        `SELECT COUNT(*) AS total FROM products WHERE deleted_at IS NULL`
      );
      console.log(`\nProduits issus de l'import (external_ref renseigné) : ${n}`);
      console.log(`Produits total en base (hors soft-deleted) .......... ${total}\n`);
      return;
    }

    // ── Chargement des référentiels ──
    const [taxRows] = await connection.query(`SELECT id, rate FROM tax_rates`);
    const taxRateIdByRate = new Map(taxRows.map((r) => [Number(Number(r.rate).toFixed(1)), r.id]));

    const [catRows] = await connection.query(`SELECT id, slug FROM categories`);
    const categoryIdBySlug = new Map(catRows.map((c) => [c.slug, c.id]));

    // Produits déjà en base : on récupère slug ET sku, avec external_ref pour
    // distinguer ceux issus d'un import précédent (qu'on va rejouer) des autres
    // (produits créés à la main dans l'admin). `products` a DEUX contraintes
    // UNIQUE : uq_products_slug et uq_products_sku. L'INSERT ... ON DUPLICATE KEY
    // se déclenche sur N'IMPORTE laquelle — donc un SKU (RefFab) déjà pris par
    // une fiche SANS external_ref ferait un UPDATE de cette fiche au lieu de
    // créer l'article. On protège les deux clés :
    //   - slug : suffixe -2, -3… (déjà géré plus bas)
    //   - sku  : si collision avec une fiche non-import → on EXCLUT la ligne et
    //            on le signale dans le rapport (jamais écraser une fiche à la main)
    const [existingRows] = await connection.query(
      `SELECT slug, sku, external_ref FROM products`
    );
    const reservedSlugs = new Set();
    const ownSlugByRef = new Map();
    const foreignSkus = new Set(); // sku pris par une fiche SANS external_ref
    for (const r of existingRows) {
      if (r.external_ref) {
        ownSlugByRef.set(r.external_ref, r.slug);
      } else {
        reservedSlugs.add(r.slug);
        if (r.sku) foreignSkus.add(r.sku);
      }
    }

    // ── Lecture de l'export ──
    console.log(`Lecture de ${articlesPath} …`);
    const articles = readSheetObjects(articlesPath);
    console.log(`  ${articles.length} lignes lues.`);

    // ── Filtrage + mapping ──
    const report = {
      totalRead: articles.length,
      kept: 0,
      excluded: 0,
      exclusionReasons: {},
      byCategory: {},
      missingDescription: 0,
      missingWeight: 0,
      missingEan: 0,
      inStock: 0,
      madeToOrder: 0,
      withComparePrice: 0,
      slugCollisions: 0,
      duplicateEan: 0,
      skuConflictForeign: 0, // SKU déjà pris par une fiche créée hors import
      duplicateSkuInExport: 0, // même RefFab sur 2 lignes de l'export
      brandTags: 0,
      themeTags: 0,
      inserted: 0,
      updated: 0,
    };

    const mapped = [];
    const usedSlugs = new Set();
    const seenEan = new Set();
    const seenSku = new Set();
    const brandNames = new Set();
    const themeNames = new Set();

    for (const a of articles) {
      const { keep, reasons, categorySlug } = classifyArticle(a);
      if (!keep) {
        report.excluded++;
        for (const r of reasons) {
          // On regroupe les motifs paramétrés
          const key = r.replace(/\(.*\)/, '').trim();
          report.exclusionReasons[key] = (report.exclusionReasons[key] || 0) + 1;
        }
        continue;
      }

      const m = mapArticle(a, categorySlug, taxRateIdByRate);

      if (!categoryIdBySlug.has(m.category_slug)) {
        report.exclusionReasons[`catégorie inconnue: ${m.category_slug}`] =
          (report.exclusionReasons[`catégorie inconnue: ${m.category_slug}`] || 0) + 1;
        report.excluded++;
        continue;
      }
      m.category_id = categoryIdBySlug.get(m.category_slug);

      // SKU (RefFab) — contrainte uq_products_sku. Deux collisions possibles :
      //   a) le SKU appartient déjà à une fiche SANS external_ref (produit créé
      //      dans l'admin, pas par l'import) → on n'y touche pas : ligne exclue.
      //   b) le SKU apparaît sur une 2e ligne de l'export → on garde la 1re,
      //      la 2e est exclue (sinon l'UPSERT écraserait la 1re via le SKU).
      // Note : sur le catalogue actuel, ces deux compteurs sont à 0 (SKU tous
      // uniques, base vierge) — c'est un garde-fou pour les ré-imports.
      if (m.sku && foreignSkus.has(m.sku) && !ownSlugByRef.has(m.external_ref)) {
        report.exclusionReasons['SKU déjà utilisé par une fiche hors import'] =
          (report.exclusionReasons['SKU déjà utilisé par une fiche hors import'] || 0) + 1;
        report.skuConflictForeign++;
        report.excluded++;
        continue;
      }
      if (m.sku && seenSku.has(m.sku)) {
        report.exclusionReasons['SKU en doublon dans l\'export'] =
          (report.exclusionReasons['SKU en doublon dans l\'export'] || 0) + 1;
        report.duplicateSkuInExport++;
        report.excluded++;
        continue;
      }
      if (m.sku) seenSku.add(m.sku);

      // Slug : si l'article a déjà été importé, on garde SON slug (évite de casser
      // une URL déjà indexée / partagée). Sinon on en génère un, unique vis-à-vis
      // des slugs déjà en base ET de ceux attribués dans ce run.
      if (ownSlugByRef.has(m.external_ref)) {
        m.slug = ownSlugByRef.get(m.external_ref);
        usedSlugs.add(m.slug);
      } else {
        const base = slugify(m.name_fr) || `article-${m.external_ref}`;
        let slug = base;
        let suffix = 2;
        while (usedSlugs.has(slug) || reservedSlugs.has(slug)) {
          slug = `${base}-${suffix++}`;
          report.slugCollisions++;
        }
        usedSlugs.add(slug);
        m.slug = slug;
      }

      // EAN : on neutralise la 2e occurrence d'un même code
      if (m.ean) {
        if (seenEan.has(m.ean)) {
          m.ean = null;
          report.duplicateEan++;
        } else {
          seenEan.add(m.ean);
        }
      }

      // Compteurs de complétude
      report.kept++;
      report.byCategory[m.category_slug] = (report.byCategory[m.category_slug] || 0) + 1;
      if (!m.description_fr) report.missingDescription++;
      if (m.weight_kg === null) report.missingWeight++;
      if (!m.ean) report.missingEan++;
      if (m.stock > 0) report.inStock++;
      if (m.is_made_to_order) report.madeToOrder++;
      if (m.compare_price_chf !== null) report.withComparePrice++;

      if (m.gamme_name) brandNames.add(m.gamme_name);
      if (WITH_THEME_TAGS) {
        const themes = cleanStr(a['Thèmes']);
        if (themes) {
          for (let t of themes.split(',')) {
            t = t.trim();
            if (t.length >= 3 && !/^\d+$/.test(t)) themeNames.add(t);
          }
        }
      }

      mapped.push(m);
    }

    report.brandTags = brandNames.size;
    report.themeTags = themeNames.size;

    // ── DRY-RUN : rapport et sortie ──
    if (DRY_RUN) {
      printReport(report);
      console.log('DRY-RUN terminé — aucune écriture. Relancer sans --dry-run pour importer.\n');
      return;
    }

    // ── Écriture ──
    await connection.beginTransaction();

    // 0) Photo des external_ref déjà présents → distinguer créés / mis à jour
    const allRefs = mapped.map((m) => m.external_ref);
    const existingRefs = new Set();
    for (let i = 0; i < allRefs.length; i += BATCH_SIZE) {
      const slice = allRefs.slice(i, i + BATCH_SIZE);
      const [rows] = await connection.query(
        `SELECT external_ref FROM products WHERE external_ref IN (?)`,
        [slice]
      );
      for (const r of rows) existingRefs.add(r.external_ref);
    }

    // 1) Tags marque : créer les manquants, récupérer les ids
    const tagIdByBrand = new Map();
    for (const brand of brandNames) {
      const slug = `marque-${slugify(brand)}`.slice(0, 255);
      const [[existing]] = await connection.query(
        `SELECT id FROM tags WHERE slug = ? LIMIT 1`,
        [slug]
      );
      let tagId;
      if (existing) {
        tagId = existing.id;
      } else {
        const [res] = await connection.query(
          `INSERT INTO tags (slug, sort_order) VALUES (?, 0)`,
          [slug]
        );
        tagId = res.insertId;
        // Traductions : même libellé dans les 3 locales (nom de marque)
        await connection.query(
          `INSERT INTO tag_translations (tag_id, locale, name) VALUES (?, 'fr', ?), (?, 'de', ?), (?, 'en', ?)`,
          [tagId, brand, tagId, brand, tagId, brand]
        );
      }
      tagIdByBrand.set(brand, tagId);
    }

    // 2) Tags thème (optionnel)
    const tagIdByTheme = new Map();
    if (WITH_THEME_TAGS) {
      for (const theme of themeNames) {
        const slug = slugify(theme).slice(0, 255);
        if (!slug) continue;
        const [[existing]] = await connection.query(
          `SELECT id FROM tags WHERE slug = ? LIMIT 1`,
          [slug]
        );
        let tagId;
        if (existing) {
          tagId = existing.id;
        } else {
          const [res] = await connection.query(
            `INSERT INTO tags (slug, sort_order) VALUES (?, 0)`,
            [slug]
          );
          tagId = res.insertId;
          await connection.query(
            `INSERT INTO tag_translations (tag_id, locale, name) VALUES (?, 'fr', ?), (?, 'de', ?), (?, 'en', ?)`,
            [tagId, theme, tagId, theme, tagId, theme]
          );
        }
        tagIdByTheme.set(theme, tagId);
      }
    }

    // 3) Produits : UPSERT par batch sur external_ref
    //    On ne touche QUE aux champs "source" : prix, stock, nom FR, sku, ean,
    //    catégorie, dimensions, is_made_to_order. Les champs enrichis à la main
    //    (is_featured, featured_order, badge, weight_kg s'il a été complété,
    //    supplier_id, images, traductions DE/EN) ne sont PAS dans le ON DUPLICATE.
    //    weight_kg : on l'écrit à la création, mais on ne l'écrase pas si la
    //    cliente l'a renseigné → COALESCE(nouvelle, existante) via VALUES().
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const slice = mapped.slice(i, i + BATCH_SIZE);
      const placeholders = slice
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .join(', ');
      const values = slice.flatMap((m) => [
        m.category_id,
        m.slug,
        m.price_chf,
        m.compare_price_chf,
        m.tax_rate_id,
        m.sku,
        m.external_ref,
        m.ean,
        m.stock,
        m.weight_kg,
        m.length_cm,
        m.width_cm,
        m.is_made_to_order,
      ]);

      // ON DUPLICATE KEY : `products` a 3 clés UNIQUE (external_ref, slug, sku).
      // Le cas nominal est un match sur uq_products_external_ref (ré-import).
      // Les collisions slug/sku sont normalement déjà écartées en amont
      // (suffixe -N pour le slug, exclusion de ligne pour un sku conflictuel).
      // Filet de sécurité si une collision passe quand même : on écrit
      // `external_ref` dans le SET → la fiche touchée devient bien la fiche
      // d'import (pas une fiche "fantôme" sans external_ref, invisible aux
      // ré-imports comme au comptage). VALUES(col) : syntaxe déjà utilisée
      // dans product.admin.repository.js, conservée par cohérence.
      await connection.query(
        `INSERT INTO products
           (category_id, slug, price_chf, compare_price_chf, tax_rate_id, sku,
            external_ref, ean, stock, weight_kg, length_cm, width_cm, is_made_to_order, is_active)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           external_ref      = VALUES(external_ref),
           price_chf         = VALUES(price_chf),
           compare_price_chf = VALUES(compare_price_chf),
           tax_rate_id       = VALUES(tax_rate_id),
           sku               = VALUES(sku),
           ean               = COALESCE(products.ean, VALUES(ean)),
           stock             = VALUES(stock),
           weight_kg         = COALESCE(products.weight_kg, VALUES(weight_kg)),
           length_cm         = COALESCE(products.length_cm, VALUES(length_cm)),
           width_cm          = COALESCE(products.width_cm, VALUES(width_cm)),
           is_made_to_order  = VALUES(is_made_to_order),
           category_id       = VALUES(category_id)`,
        values
      );
    }

    // 4) Récupérer les ids produits par external_ref (pour traductions + tags)
    const refs = mapped.map((m) => m.external_ref);
    const idByRef = new Map();
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const slice = refs.slice(i, i + BATCH_SIZE);
      const [rows] = await connection.query(
        `SELECT id, external_ref FROM products WHERE external_ref IN (?)`,
        [slice]
      );
      for (const r of rows) idByRef.set(r.external_ref, r.id);
    }

    // 5) Traductions FR : INSERT ... ON DUPLICATE (ne crée jamais de ligne DE/EN)
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const slice = mapped.slice(i, i + BATCH_SIZE).filter((m) => idByRef.has(m.external_ref));
      if (slice.length === 0) continue;
      const placeholders = slice.map(() => "(?, 'fr', ?, ?, ?)").join(', ');
      const values = slice.flatMap((m) => [
        idByRef.get(m.external_ref),
        m.name_fr,
        m.description_fr,
        m.slug,
      ]);
      await connection.query(
        `INSERT INTO product_translations (product_id, locale, name, description, slug)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           name        = VALUES(name),
           description = COALESCE(product_translations.description, VALUES(description)),
           slug        = VALUES(slug)`,
        values
      );
    }

    // 6) Liaison product_tags (marque + thèmes) — ajout only (INSERT IGNORE).
    //    Si un article change de gamme entre deux imports, l'ancien tag marque
    //    reste lié — cas rare, la cliente peut le retirer dans le ProductForm.
    const tagLinks = [];
    for (const m of mapped) {
      const productId = idByRef.get(m.external_ref);
      if (!productId) continue;
      if (m.gamme_name && tagIdByBrand.has(m.gamme_name)) {
        tagLinks.push([productId, tagIdByBrand.get(m.gamme_name)]);
      }
    }
    if (WITH_THEME_TAGS) {
      for (const a of articles) {
        const ref = cleanStr(a.NArticleC);
        const productId = idByRef.get(ref);
        if (!productId) continue;
        const themes = cleanStr(a['Thèmes']);
        if (!themes) continue;
        for (let t of themes.split(',')) {
          t = t.trim();
          if (t.length >= 3 && !/^\d+$/.test(t) && tagIdByTheme.has(t)) {
            tagLinks.push([productId, tagIdByTheme.get(t)]);
          }
        }
      }
    }
    // product_tags a PRIMARY KEY (product_id, tag_id) → INSERT IGNORE est idempotent,
    // y compris sur un ré-import. On déduplique quand même en JS pour alléger la requête.
    const seenLink = new Set();
    const uniqueLinks = tagLinks.filter(([p, t]) => {
      const k = `${p}:${t}`;
      if (seenLink.has(k)) return false;
      seenLink.add(k);
      return true;
    });
    for (let i = 0; i < uniqueLinks.length; i += BATCH_SIZE) {
      const slice = uniqueLinks.slice(i, i + BATCH_SIZE);
      const placeholders = slice.map(() => '(?, ?)').join(', ');
      await connection.query(
        `INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES ${placeholders}`,
        slice.flat()
      );
    }

    await connection.commit();

    // Comptage créés / mis à jour à partir de la photo initiale
    report.updated = mapped.filter((m) => existingRefs.has(m.external_ref)).length;
    report.inserted = report.kept - report.updated;

    printReport(report);

    console.log('── ÉTAPES POST-IMPORT (à exécuter une fois) ──');
    console.log('  Sur MySQL :');
    console.log('    ANALYZE TABLE products;');
    console.log('    ANALYZE TABLE product_translations;');
    console.log('    ANALYZE TABLE product_tags;');
    console.log('  Puis vérifier le catalogue et la recherche sur le site.\n');
  } catch (error) {
    try {
      await connection.rollback();
    } catch { /* pas de transaction ouverte */ }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Import échoué :', err.message, '\n');
  process.exit(1);
});
