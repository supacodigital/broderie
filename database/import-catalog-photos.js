#!/usr/bin/env node
/* ============================================================
 * Import du complément catalogue transmis par la cliente via le fichier
 * Excel "Catalogue-a-completer-photos.xlsx" (généré par
 * database/export-catalog-excel.js, onglet "Catalogue").
 *
 * Ce script couvre exactement ce que import-catalog.js NE fait PAS
 * photos, description FR manquante,
 * poids manquant, dimensions manquantes, catégorie affinée par la cliente.
 * Il ne touche jamais aux champs déjà gérés par import-catalog.js
 * (prix, stock, marque, SKU, EAN) — ces colonnes sont en lecture seule
 * dans le fichier Excel remis à la cliente.
 *
 * Clé de correspondance : products.external_ref (= NArticleC), colonne
 * "Référence (NArticleC)" du fichier — jamais le nom produit (non unique).
 *
 * Photos : le pipeline est identique à l'upload admin (voir
 * backend/config/sharp.js + backend/config/storage.js) — conversion WebP,
 * 3 tailles (thumbnail/medium/large), stockage sur disque VPS sous
 * backend/uploads/products/. Le fichier source est cherché dans le dossier
 * de photos fourni par la cliente (nom exact, sensible à la casse).
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   npm run import:catalog-photos -- --dry-run
 *   npm run import:catalog-photos
 *   npm run import:catalog-photos -- --excel=chemin.xlsx --photos=chemin/dossier
 *
 * Par défaut :
 *   --excel  = donnees-client/Catalogue-a-completer-photos.xlsx
 *   --photos = donnees-client/photos/
 * ============================================================ */

const path = require('path');
const fs = require('fs');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const { readSheetObjects } = require('./lib/xlsx-reader');
const sharpConfig = require(path.join(BACKEND, 'config/sharp'));

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const flag = (name, fallback) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const DRY_RUN = has('--dry-run');
const BATCH_SIZE = 500; // règle projet : import en batch de 500, jamais ligne par ligne
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB — même limite que middlewares/upload.js

const EXCEL_PATH = path.resolve(
  __dirname,
  flag('excel', '../donnees-client/Catalogue-a-completer-photos.xlsx')
);
const PHOTOS_DIR = path.resolve(__dirname, flag('photos', '../donnees-client/photos'));

// ── Helpers ─────────────────────────────────────────────────
const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const toNumber = (v) => {
  const s = cleanStr(v);
  if (s === null) return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ── Lecture d'une ligne du fichier remis par la cliente ─────
const mapRow = (row) => {
  const externalRef = cleanStr(row['Référence (NArticleC)']);
  if (!externalRef) return null;

  const photoFilenames = [
    cleanStr(row['NOM DU FICHIER PHOTO']),
    cleanStr(row['Photo 2 (optionnelle)']),
    cleanStr(row['Photo 3 (optionnelle)']),
  ].filter(Boolean);

  return {
    external_ref: externalRef,
    category_label: cleanStr(row['Catégorie']),
    description_fr: cleanStr(row['Description (FR)']),
    weight_kg: toNumber(row['Poids (kg)']),
    length_cm: toNumber(row['Longueur (cm)']),
    width_cm: toNumber(row['Largeur (cm)']),
    photo_filenames: photoFilenames,
  };
};

// ── Rapport ────────────────────────────────────────────────
const printReport = (report) => {
  console.log('\n══════════════════════════════════════════════');
  console.log(' RAPPORT IMPORT PHOTOS / COMPLÉMENT CATALOGUE' + (DRY_RUN ? '  (DRY-RUN — rien écrit)' : ''));
  console.log('══════════════════════════════════════════════\n');
  console.log(`Lignes lues dans le fichier Excel ........ ${report.totalRead}`);
  console.log(`Lignes avec external_ref reconnu ......... ${report.matched}`);
  console.log(`Lignes ignorées (external_ref inconnu) ... ${report.unknownRef}`);
  console.log(`Lignes sans rien à mettre à jour ......... ${report.noop}\n`);

  console.log('Champs mis à jour :');
  console.log(`  description FR ......................... ${report.updatedDescription}`);
  console.log(`  poids (weight_kg) ...................... ${report.updatedWeight}`);
  console.log(`  dimensions (longueur/largeur) .......... ${report.updatedDimensions}`);
  console.log(`  catégorie reclassée ..................... ${report.updatedCategory}\n`);

  console.log('Photos :');
  console.log(`  photos référencées dans le fichier ..... ${report.photosReferenced}`);
  console.log(`  photos traitées et enregistrées ........ ${report.photosProcessed}`);
  console.log(`  photos déjà présentes (ignorées) ....... ${report.photosSkippedExisting}`);
  console.log(`  fichiers introuvables ................... ${report.photosMissing}`);
  console.log(`  fichiers trop volumineux (> 5 Mo) ....... ${report.photosTooLarge}`);
  console.log(`  fichiers invalides (format non supporté) ${report.photosInvalid}\n`);

  if (report.unknownCategoryLabels.size > 0) {
    console.log('Libellés de catégorie non reconnus (ignorés) :');
    for (const label of report.unknownCategoryLabels) console.log(`  - ${label}`);
    console.log('');
  }

  if (report.missingFiles.length > 0) {
    console.log(`Fichiers photo introuvables (${report.missingFiles.length}, 20 premiers) :`);
    for (const f of report.missingFiles.slice(0, 20)) console.log(`  - ${f}`);
    console.log('');
  }
};

// ── Programme principal ────────────────────────────────────
async function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Fichier introuvable : ${EXCEL_PATH}\nPassez --excel=chemin/vers/fichier.xlsx si besoin.`);
  }
  if (!fs.existsSync(PHOTOS_DIR)) {
    throw new Error(`Dossier photos introuvable : ${PHOTOS_DIR}\nPassez --photos=chemin/vers/dossier si besoin.`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'broderie',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
  });

  try {
    // ── Référentiels ──
    const [catRows] = await connection.query(
      `SELECT c.id, ct.name
       FROM categories c
       INNER JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'`
    );
    const categoryIdByLabel = new Map(catRows.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const [productRows] = await connection.query(
      `SELECT id, external_ref FROM products WHERE external_ref IS NOT NULL AND deleted_at IS NULL`
    );
    const productIdByRef = new Map(productRows.map((p) => [p.external_ref, p.id]));

    const [existingImageCounts] = await connection.query(
      `SELECT product_id, COUNT(*) AS n FROM product_images GROUP BY product_id`
    );
    const imageCountByProduct = new Map(existingImageCounts.map((r) => [r.product_id, r.n]));

    // ── Lecture du fichier ──
    console.log(`Lecture de ${EXCEL_PATH} …`);
    const rawRows = readSheetObjects(EXCEL_PATH, { sheetName: 'Catalogue', headerRow: 3 });
    console.log(`  ${rawRows.length} lignes lues.\n`);

    const report = {
      totalRead: rawRows.length,
      matched: 0,
      unknownRef: 0,
      noop: 0,
      updatedDescription: 0,
      updatedWeight: 0,
      updatedDimensions: 0,
      updatedCategory: 0,
      photosReferenced: 0,
      photosProcessed: 0,
      photosSkippedExisting: 0,
      photosMissing: 0,
      photosTooLarge: 0,
      photosInvalid: 0,
      unknownCategoryLabels: new Set(),
      missingFiles: [],
    };

    // ── Mapping + validation, sans écrire ──
    const productUpdates = []; // { productId, description_fr, weight_kg, length_cm, width_cm, category_id }
    const photoJobs = []; // { productId, filename, sortOrder }

    for (const row of rawRows) {
      const mapped = mapRow(row);
      if (!mapped) continue;

      const productId = productIdByRef.get(mapped.external_ref);
      if (!productId) {
        report.unknownRef++;
        continue;
      }
      report.matched++;

      let categoryId = null;
      if (mapped.category_label) {
        const key = mapped.category_label.trim().toLowerCase();
        if (categoryIdByLabel.has(key)) {
          categoryId = categoryIdByLabel.get(key);
        } else {
          report.unknownCategoryLabels.add(mapped.category_label);
        }
      }

      const hasFieldUpdate =
        mapped.description_fr !== null ||
        mapped.weight_kg !== null ||
        mapped.length_cm !== null ||
        mapped.width_cm !== null ||
        categoryId !== null;

      if (hasFieldUpdate) {
        if (mapped.description_fr !== null) report.updatedDescription++;
        if (mapped.weight_kg !== null) report.updatedWeight++;
        if (mapped.length_cm !== null || mapped.width_cm !== null) report.updatedDimensions++;
        if (categoryId !== null) report.updatedCategory++;

        productUpdates.push({
          productId,
          description_fr: mapped.description_fr,
          weight_kg: mapped.weight_kg,
          length_cm: mapped.length_cm,
          width_cm: mapped.width_cm,
          category_id: categoryId,
        });
      }

      const alreadyHasImages = (imageCountByProduct.get(productId) || 0) > 0;
      if (mapped.photo_filenames.length > 0) {
        report.photosReferenced += mapped.photo_filenames.length;
        if (alreadyHasImages) {
          report.photosSkippedExisting += mapped.photo_filenames.length;
        } else {
          mapped.photo_filenames.forEach((filename, i) => {
            photoJobs.push({ productId, filename, sortOrder: i, isPrimary: i === 0 });
          });
        }
      }

      if (!hasFieldUpdate && (mapped.photo_filenames.length === 0 || alreadyHasImages)) {
        report.noop++;
      }
    }

    // ── Vérification des fichiers photo (existence, taille, format) ──
    const validPhotoJobs = [];
    for (const job of photoJobs) {
      const filePath = path.join(PHOTOS_DIR, job.filename);
      if (!fs.existsSync(filePath)) {
        report.photosMissing++;
        report.missingFiles.push(job.filename);
        continue;
      }
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_PHOTO_SIZE) {
        report.photosTooLarge++;
        continue;
      }
      const buffer = fs.readFileSync(filePath);
      if (!sharpConfig.isSupportedImage(buffer)) {
        report.photosInvalid++;
        continue;
      }
      validPhotoJobs.push({ ...job, buffer });
    }

    if (DRY_RUN) {
      printReport(report);
      console.log(`Photos qui seraient traitées avec succès : ${validPhotoJobs.length}`);
      console.log('DRY-RUN terminé — aucune écriture. Relancer sans --dry-run pour importer.\n');
      return;
    }

    // ── Écriture : champs produits (batch 500, transaction) ──
    await connection.beginTransaction();

    for (let i = 0; i < productUpdates.length; i += BATCH_SIZE) {
      const slice = productUpdates.slice(i, i + BATCH_SIZE);
      for (const u of slice) {
        // COALESCE : ne jamais écraser une valeur déjà renseignée par un poids/desc vide
        await connection.execute(
          `UPDATE products SET
             weight_kg   = COALESCE(?, weight_kg),
             length_cm   = COALESCE(?, length_cm),
             width_cm    = COALESCE(?, width_cm),
             category_id = COALESCE(?, category_id)
           WHERE id = ?`,
          [u.weight_kg, u.length_cm, u.width_cm, u.category_id, u.productId]
        );
        if (u.description_fr !== null) {
          await connection.execute(
            `UPDATE product_translations SET description = ?
             WHERE product_id = ? AND locale = 'fr' AND (description IS NULL OR description = '')`,
            [u.description_fr, u.productId]
          );
        }
      }
    }

    await connection.commit();

    // ── Écriture : photos (hors transaction SQL globale — écriture disque par fichier) ──
    for (const job of validPhotoJobs) {
      try {
        const { uuid, urls } = await sharpConfig.processImage(job.buffer);
        await connection.execute(
          `INSERT INTO product_images (product_id, url, url_thumbnail, url_medium, url_large, alt, sort_order, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [job.productId, urls.large, urls.thumbnail, urls.medium, urls.large, null, job.sortOrder, job.isPrimary ? 1 : 0]
        );
        report.photosProcessed++;
      } catch (error) {
        report.photosInvalid++;
        console.error(`  ⚠️  Échec traitement photo "${job.filename}" (produit ${job.productId}) : ${error.message}`);
      }
    }

    printReport(report);
    console.log('── ÉTAPE POST-IMPORT ──');
    console.log('  Vérifier quelques fiches produit dans l\'admin (photos, description, poids).\n');
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
