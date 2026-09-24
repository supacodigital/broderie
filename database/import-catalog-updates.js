#!/usr/bin/env node
/* ============================================================
 * Réimport du fichier catalogue complété par la cliente
 * (généré par database/export-catalog-excel.js, onglet "Catalogue").
 *
 * Traite les colonnes que la cliente a demandé à pouvoir piloter :
 *   Catégorie ......... rattachement à une catégorie (y compris enfant)
 *   À revoir .......... « Complet » = classement validé, sinon à reclasser
 *   Fournisseur ....... rattachement à un fournisseur
 *   Prix CHF .......... correction du prix de vente
 *   SUPPRIMER (O/N) ... « O » retire l'article de la boutique (soft delete)
 *
 * Le changement de catégorie met aussi à jour product_categories (ADM-04) :
 * la nouvelle catégorie devient le rattachement principal, l'ancienne est
 * conservée en rayon secondaire. Le fichier ne portant qu'une catégorie par
 * article, il ne peut pas exprimer le retrait d'un rayon — ce retrait se fait
 * depuis l'administration.
 *
 * Volontairement NON traité ici : photos, description, poids et dimensions —
 * c'est le rôle de import-catalog-photos.js, qui gère aussi le pipeline image.
 *
 * Clé de correspondance : products.external_ref (colonne « Référence (NArticleC) »),
 * jamais le nom du produit, qui n'est pas unique.
 *
 * Prudence volontaire : une valeur vide ne modifie jamais rien (on ne vide pas un
 * champ par omission), et une catégorie ou un fournisseur non reconnu est signalé
 * puis ignoré, plutôt que d'écrire une valeur fausse en masse.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/import-catalog-updates.js --dry-run
 *   node ../database/import-catalog-updates.js
 *   node ../database/import-catalog-updates.js --excel=chemin.xlsx
 *   node ../database/import-catalog-updates.js --skip-prices   # ignore la colonne Prix
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

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const value = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};

const DRY_RUN = has('--dry-run');
/* --skip-prices : n'applique aucun prix du fichier. Utile quand le fichier a été
   généré avant des changements de prix faits depuis l'administration — un prix
   est du chiffre d'affaires, on ne le réécrit pas sur un doute. */
const SKIP_PRICES = has('--skip-prices');
const EXCEL_PATH = path.resolve(
  value('excel', path.join(__dirname, '../donnees-client/Catalogue-articles.xlsx'))
);
const BATCH_SIZE = 500;

const COL = {
  ref:      'Référence (NArticleC)',
  review:   'À revoir',
  category: 'Catégorie',
  supplier: 'Fournisseur',
  price:    'Prix CHF',
  remove:   'SUPPRIMER (O/N)',
};


// Arrondi suisse au 5 centimes — même règle que backend/utils/chf.utils.js
const roundCHF = (amount) => Math.round(amount * 20) / 20;

const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/* Colonne « À revoir » : « Complet » = classement validé par la cliente, tout
   autre libellé (« Catégorie à affiner ») = rangement automatique encore à
   confirmer. Une cellule vide ne dit rien : on ne touche pas au drapeau. */
const parseReviewFlag = (raw) => {
  const s = cleanStr(raw);
  if (s === null) return null;
  return s.toLowerCase().startsWith('complet') ? 0 : 1;
};

const parsePrice = (v) => {
  const s = cleanStr(v);
  if (s === null) return null;
  // Accepte « 12,50 » comme « 12.50 » — Excel francophone produit les deux
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? roundCHF(n) : null;
};

// Seul « O » (oui) déclenche la suppression : « N », vide ou autre = on ne touche à rien
const parseRemoveFlag = (v) => {
  const s = cleanStr(v);
  if (s === null) return false;
  return ['o', 'oui', 'y', 'yes', 'x', '1'].includes(s.toLowerCase());
};

async function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Fichier introuvable : ${EXCEL_PATH}`);
    console.error('Générez-le d\'abord avec : node ../database/export-catalog-excel.js');
    process.exit(1);
  }

  const rows = readSheetObjects(EXCEL_PATH, { sheetName: 'Catalogue', headerRow: 3 });
  console.log(`\nFichier .......... ${EXCEL_PATH}`);
  console.log(`Lignes lues ...... ${rows.length}`);
  if (DRY_RUN) console.log('Mode ............. SIMULATION (aucune écriture)');

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Index de correspondance — une requête chacun, jamais dans la boucle
    const [products] = await connection.execute(
      /* Prix barré et période de promotion lus pour l'historique des prix : sans
         eux, chaque ligne d'historique enregistrait un prix barré vide (ADM-21). */
      `SELECT id, external_ref, price_chf, compare_price_chf, promo_starts_at, promo_ends_at,
              category_id, category_needs_review, supplier_id
       FROM products WHERE external_ref IS NOT NULL AND deleted_at IS NULL`
    );
    const productByRef = new Map(products.map((p) => [String(p.external_ref), p]));

    const [categories] = await connection.execute(
      `SELECT c.id, c.parent_id, ct.name, pt.name AS parent_name
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN category_translations pt ON pt.category_id = p.id AND pt.locale = 'fr'`
    );
    /* Deux clés par catégorie : le chemin complet (« Parent > Enfant », ce que produit
       l'export) et le libellé seul, au cas où la cliente saisirait à la main. */
    const categoryIdByLabel = new Map();
    categories.forEach((c) => {
      if (!c.name) return;
      const short = c.name.trim().toLowerCase();
      if (c.parent_name) {
        categoryIdByLabel.set(`${c.parent_name.trim()} > ${c.name.trim()}`.toLowerCase(), c.id);
      }
      if (!categoryIdByLabel.has(short)) categoryIdByLabel.set(short, c.id);
    });

    /* Chaîne des ancêtres de chaque catégorie, pour ne jamais remplacer un
       classement fin par son propre parent (voir plus bas). */
    const parentById = new Map(categories.map((c) => [c.id, c.parent_id]));
    const isAncestorOf = (ancestorId, categoryId) => {
      let current = parentById.get(categoryId);
      while (current) {
        if (current === ancestorId) return true;
        current = parentById.get(current);
      }
      return false;
    };

    const [suppliers] = await connection.execute(`SELECT id, name FROM suppliers`);
    const supplierIdByName = new Map(
      suppliers.filter((s) => s.name).map((s) => [s.name.trim().toLowerCase(), s.id])
    );

    const report = {
      matched: 0, unknownRef: 0, noChange: 0,
      price: 0, category: 0, keptFinerCategory: 0, review: 0, supplier: 0, removed: 0,
      unknownCategories: new Set(), unknownSuppliers: new Set(), invalidPrices: 0,
    };

    const updates = [];

    /* Changements de prix à journaliser (ADM-21) — collectés pendant l'analyse,
       écrits par lots dans la transaction. */
    const priceChanges = []; // { productId, oldPrice, oldCompare, newPrice }
    const removals = [];  // id
    const categoryLinks = []; // { productId, categoryId } — rattachement principal à resynchroniser

    for (const row of rows) {
      const ref = cleanStr(row[COL.ref]);
      if (!ref) continue;

      const product = productByRef.get(ref);
      if (!product) { report.unknownRef++; continue; }
      report.matched++;

      // Suppression : prioritaire, inutile de modifier un article qu'on retire
      if (parseRemoveFlag(row[COL.remove])) {
        removals.push(product.id);
        report.removed++;
        continue;
      }

      const fields = {};

      // --skip-prices : la colonne Prix n'est pas lue du tout (ni appliquée, ni
      // signalée comme illisible)
      const price = SKIP_PRICES ? null : parsePrice(row[COL.price]);
      if (price !== null && price !== Number(product.price_chf)) {
        fields.price_chf = price;
        // Ancien prix retenu pour l'historique (ADM-21) — voir l'écriture par lots
        priceChanges.push({
          productId: product.id,
          oldPrice: product.price_chf,
          oldCompare: product.compare_price_chf ?? null,
          newPrice: price,
          // Période de promotion inchangée par l'import, conservée avec l'offre
          promoStartsAt: product.compare_price_chf === null ? null : product.promo_starts_at,
          promoEndsAt: product.compare_price_chf === null ? null : product.promo_ends_at,
        });
        report.price++;
      } else if (!SKIP_PRICES && price === null && cleanStr(row[COL.price]) !== null) {
        report.invalidPrices++;
      }

      const categoryLabel = cleanStr(row[COL.category]);
      if (categoryLabel) {
        const id = categoryIdByLabel.get(categoryLabel.toLowerCase());
        if (!id) report.unknownCategories.add(categoryLabel);
        /* Le fichier de la cliente ne descend qu'à deux niveaux (« Parent >
           Enfant »). Un article affiné au niveau 3 depuis l'administration
           serait donc silencieusement remonté vers son propre parent à chaque
           réimport : on ignore ce cas, le classement le plus précis gagne. */
        else if (isAncestorOf(id, product.category_id)) {
          report.keptFinerCategory++;
        }
        else if (id !== product.category_id) {
          fields.category_id = id;
          report.category++;
          /* La catégorie principale change : le rattachement principal de
             product_categories doit suivre (ADM-04). Les rayons secondaires
             éventuellement ajoutés depuis l'administration sont conservés — le
             fichier de la cliente ne porte qu'une catégorie par article et ne
             peut donc pas exprimer leur retrait. */
          categoryLinks.push({ productId: product.id, categoryId: id });
        }
      }

      /* Drapeau « À revoir » — la cliente n'a validé le classement que d'une
         partie du catalogue ; l'information doit survivre au réimport. */
      const reviewFlag = parseReviewFlag(row[COL.review]);
      if (reviewFlag !== null && reviewFlag !== product.category_needs_review) {
        fields.category_needs_review = reviewFlag;
        report.review++;
      }

      const supplierLabel = cleanStr(row[COL.supplier]);
      if (supplierLabel) {
        const id = supplierIdByName.get(supplierLabel.toLowerCase());
        if (!id) report.unknownSuppliers.add(supplierLabel);
        else if (id !== product.supplier_id) { fields.supplier_id = id; report.supplier++; }
      }

      if (Object.keys(fields).length === 0) report.noChange++;
      else updates.push({ id: product.id, fields });
    }

    // ── Rapport ──
    console.log(`\nArticles reconnus ....... ${report.matched}`);
    console.log(`Références inconnues .... ${report.unknownRef}`);
    console.log(`Sans changement ......... ${report.noChange}`);
    console.log(`\nÀ modifier :`);
    console.log(`  prix .................. ${report.price}${SKIP_PRICES ? '  (colonne Prix ignorée : --skip-prices)' : ''}`);
    console.log(`  catégorie ............. ${report.category}`);
    console.log(`  drapeau « à revoir » .. ${report.review}`);
    console.log(`  fournisseur ........... ${report.supplier}`);
    console.log(`  à retirer (SUPPRIMER) . ${report.removed}`);

    if (report.keptFinerCategory) {
      console.log(`\nℹ ${report.keptFinerCategory} article(s) déjà classé(s) plus finement que ne le permet le fichier`);
      console.log(`  (catégorie de niveau 3) — classement conservé, le fichier ne les remonte pas au parent.`);
    }

    if (report.invalidPrices) {
      console.log(`\n⚠ ${report.invalidPrices} prix illisible(s) ignoré(s) — vérifiez le format (ex : 12.50).`);
    }
    const listUnknown = (label, set) => {
      if (!set.size) return;
      console.log(`\n⚠ ${label} non reconnu(s) — ignoré(s) :`);
      [...set].slice(0, 15).forEach((v) => console.log(`    « ${v} »`));
      if (set.size > 15) console.log(`    … et ${set.size - 15} autre(s)`);
    };
    listUnknown('Catégories', report.unknownCategories);
    listUnknown('Fournisseurs', report.unknownSuppliers);

    if (DRY_RUN) {
      console.log('\nSimulation terminée — relancer sans --dry-run pour appliquer.');
      return;
    }
    if (!updates.length && !removals.length) {
      console.log('\nRien à appliquer.');
      return;
    }

    // ── Écriture, par lots, dans une transaction ──
    await connection.beginTransaction();
    try {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        for (const u of batch) {
          const keys = Object.keys(u.fields);
          const setClause = keys.map((k) => `${k} = ?`).join(', ');
          await connection.execute(
            `UPDATE products SET ${setClause}, updated_at = NOW() WHERE id = ?`,
            [...keys.map((k) => u.fields[k]), u.id]
          );
        }
      }

      /* Historique des prix (ADM-21). Insertion groupée par lots — jamais un
         INSERT par article : un import touche potentiellement des centaines de
         références. `changed_by` est NULL, un import n'a pas d'auteur ; c'est
         `source` qui le distingue d'une décision saisie dans l'administration. */
      for (let i = 0; i < priceChanges.length; i += BATCH_SIZE) {
        const batch = priceChanges.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NULL)').join(', ');
        await connection.query(
          `INSERT INTO product_price_history
             (product_id, old_price_chf, old_compare_price_chf, new_price_chf, new_compare_price_chf,
              promo_starts_at, promo_ends_at, source, changed_by)
           VALUES ${placeholders}`,
          batch.flatMap((c) => [c.productId, c.oldPrice, c.oldCompare, c.newPrice, c.oldCompare,
            c.promoStartsAt ?? null, c.promoEndsAt ?? null, 'import'])
        );
      }

      /* Rattachement principal dans product_categories (ADM-04).
         L'ancienne principale est d'abord dégradée en rayon secondaire plutôt
         que supprimée : si la cliente reclasse un article, le rayon d'origine
         reste un endroit où ses clientes le trouvaient déjà. */
      for (let i = 0; i < categoryLinks.length; i += BATCH_SIZE) {
        const batch = categoryLinks.slice(i, i + BATCH_SIZE);
        const ids = batch.map((l) => l.productId);

        await connection.execute(
          `UPDATE product_categories SET is_primary = 0
           WHERE product_id IN (${ids.map(() => '?').join(',')})`,
          ids
        );

        // Insertion groupée — la clé primaire (product_id, category_id) absorbe
        // le cas où le produit était déjà rattaché à cette catégorie en secondaire.
        const placeholders = batch.map(() => '(?, ?, 1, 0)').join(', ');
        await connection.query(
          `INSERT INTO product_categories (product_id, category_id, is_primary, sort_order)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE is_primary = 1, sort_order = 0`,
          batch.flatMap((l) => [l.productId, l.categoryId])
        );
      }

      for (let i = 0; i < removals.length; i += BATCH_SIZE) {
        const batch = removals.slice(i, i + BATCH_SIZE);
        await connection.execute(
          `UPDATE products SET deleted_at = NOW(), is_active = 0, updated_at = NOW()
           WHERE id IN (${batch.map(() => '?').join(',')})`,
          batch
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    console.log(`\n✓ ${updates.length} article(s) modifié(s), ${removals.length} retiré(s).`);
    console.log('\nPensez à redémarrer le backend pour vider le cache catalogue.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec du réimport :', err.message);
  process.exit(1);
});
