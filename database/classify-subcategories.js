#!/usr/bin/env node
/* ============================================================
 * Rangement des articles dans les sous-rayons.
 *
 * L'import a laissé ~12 800 articles dans leur rayon de tête : les sous-rayons
 * (« Mouliné (Art. 117) », « Point de croix compté », « Toiles Aïda »…) restaient
 * vides ou presque. Ce script propose un sous-rayon pour chacun, selon les
 * règles de lib/subcategory-rules.js (gamme, nom, indices de l'export cliente).
 *
 * Deux cas :
 *   - sous-rayon du MÊME rayon : le rattachement au rayon de tête est remplacé
 *     par le sous-rayon. Rien ne disparaît — un rayon affiche aussi le contenu
 *     de ses sous-rayons.
 *   - sous-rayon d'un AUTRE rayon (grille rangée dans « Kits », métier Elbesee…) :
 *     il est AJOUTÉ comme rayon secondaire (ADM-04), sans rien retirer.
 *
 * Un article sans indice fiable reste dans son rayon de tête. Rejouable : un
 * article déjà rangé dans un sous-rayon de son rayon n'est plus concerné.
 *
 * Écrit toujours un rapport Excel (article, sous-rayon proposé, règle) pour
 * relecture par la cliente.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/classify-subcategories.js --dry-run [--report=/chemin.xlsx]
 *   node ../database/classify-subcategories.js
 * ============================================================ */

const path = require('path');
const os = require('os');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));
const ExcelJS = require(path.join(BACKEND, 'node_modules/exceljs'));
const { readSheetObjects } = require('./lib/xlsx-reader');
const { classify, RULES } = require('./lib/subcategory-rules');

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REPORT_PATH = args.find((a) => a.startsWith('--report='))?.slice(9)
  ?? path.join(os.tmpdir(), `rangement-sous-rayons-${new Date().toISOString().slice(0, 10)}.xlsx`);

// Export du logiciel de la cliente : indices de technique (toile, case « point de croix »)
const ARTICLES_PATH = path.join(__dirname, '../donnees-client/V_ArticleC_INT.xlsx');
const BATCH_SIZE = 500;

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Le lecteur XLSX rend les booléens en '0'/'1' et les nombres en chaînes
const loadArticles = () => {
  const byRef = new Map();
  for (const row of readSheetObjects(ARTICLES_PATH, { headerRow: 1 })) {
    if (row.NArticleC == null) continue;
    byRef.set(String(row.NArticleC).trim(), {
      IdTrame: Number(row.IdTrame) || 0,
      pu_pointdecroix: row.pu_pointdecroix === '1' || row.pu_pointdecroix === true,
    });
  }
  return byRef;
};

const writeReport = async (lines) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rangement');
  ws.columns = [
    { header: 'ID',                 key: 'id',      width: 8 },
    { header: 'Réf. article',       key: 'ref',     width: 12 },
    { header: 'Nom',                key: 'name',    width: 60 },
    { header: 'Gamme',              key: 'brand',   width: 24 },
    { header: 'Rayon actuel',       key: 'root',    width: 26 },
    { header: 'Sous-rayon proposé', key: 'target',  width: 40 },
    { header: 'Type',               key: 'kind',    width: 22 },
    { header: 'Règle',              key: 'rule',    width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'H1' };
  lines.forEach((l) => ws.addRow(l));
  await wb.xlsx.writeFile(REPORT_PATH);
};

async function main() {
  if (DRY_RUN) console.log('\nMode ............. SIMULATION (aucune écriture)');

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const [categories] = await connection.query(
      `SELECT c.id, c.slug, c.parent_id, ct.name
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'`
    );
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const byId = new Map(categories.map((c) => [c.id, c]));

    /* Les slugs se modifient depuis l'admin : on vérifie que chaque sous-rayon
       visé par les règles existe AVANT de calculer quoi que ce soit */
    const targets = new Set(Object.values(RULES).flat().map((r) => r.target).filter(Boolean));
    const missing = [...targets].filter((slug) => !bySlug.has(slug));
    if (missing.length) {
      console.log('\n⚠ Sous-rayons introuvables (slug renommé dans l’admin ?) :');
      missing.forEach((slug) => console.log(`    ${slug}`));
      console.log('  Corriger lib/subcategory-rules.js avant de relancer.');
      process.exitCode = 1;
      return;
    }

    // Articles actifs rangés en tête d'un rayon, sans aucun sous-rayon de ce même rayon
    const [products] = await connection.query(
      `SELECT p.id, p.external_ref, p.brand, p.category_id, pt.name, pc.category_id AS root_id
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       JOIN categories root ON root.id = pc.category_id AND root.parent_id IS NULL
       JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
       WHERE p.is_active = 1 AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM product_categories x
           JOIN categories sub ON sub.id = x.category_id
           WHERE x.product_id = p.id AND sub.parent_id = root.id
         )`
    );

    // Rattachements existants : un rayon secondaire déjà ajouté n'est pas reproposé
    const [existing] = await connection.query('SELECT product_id, category_id FROM product_categories');
    const linked = new Set(existing.map((l) => `${l.product_id}:${l.category_id}`));

    const articles = loadArticles();
    console.log(`\nArticles en tête de rayon ... ${products.length}`);
    console.log(`Articles de l'export cliente  ${articles.size}`);

    const moves = [];   // même rayon : { productId, rootId, targetId, primary }
    const links = [];   // autre rayon : { productId, targetId }
    const report = [];
    const summary = new Map();

    for (const p of products) {
      const root = byId.get(p.root_id);
      const { target, rule } = classify({
        name: p.name,
        brand: p.brand ?? '',
        rootSlug: root.slug,
        article: articles.get(String(p.external_ref ?? '').trim()),
      });
      if (!target) continue;

      const sub = bySlug.get(target);
      const sameRoot = sub.parent_id === root.id;
      if (!sameRoot && linked.has(`${p.id}:${sub.id}`)) continue;

      if (sameRoot) moves.push({ productId: p.id, rootId: root.id, targetId: sub.id, primary: p.category_id === root.id });
      else links.push({ productId: p.id, targetId: sub.id });

      const kind = sameRoot ? 'déplacement' : 'rayon secondaire ajouté';
      const parentName = byId.get(sub.parent_id)?.name ?? '';
      report.push({
        id: p.id, ref: p.external_ref, name: p.name, brand: p.brand,
        root: root.name ?? root.slug, target: `${parentName} > ${sub.name ?? sub.slug}`, kind, rule,
      });
      const key = `${root.name ?? root.slug} → ${parentName} > ${sub.name ?? sub.slug}${sameRoot ? '' : ' (secondaire)'}`;
      summary.set(key, (summary.get(key) ?? 0) + 1);
    }

    console.log(`\nDéplacés dans un sous-rayon . ${moves.length}`);
    console.log(`Rayon secondaire ajouté ..... ${links.length}`);
    console.log(`Restent en tête de rayon .... ${products.length - report.length}\n`);
    [...summary.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

    await writeReport(report);
    console.log(`\nRapport ..................... ${REPORT_PATH}`);

    if (DRY_RUN) {
      console.log('\nSimulation terminée — relancer sans --dry-run pour appliquer.');
      return;
    }

    await connection.beginTransaction();
    try {
      // Même rayon : on remplace le rattachement de tête par le sous-rayon
      const groups = new Map();
      for (const m of moves) {
        const key = `${m.rootId}:${m.targetId}`;
        if (!groups.has(key)) groups.set(key, { ...m, ids: [], primaryIds: [] });
        groups.get(key).ids.push(m.productId);
        if (m.primary) groups.get(key).primaryIds.push(m.productId);
      }
      for (const g of groups.values()) {
        for (const ids of chunk(g.ids, BATCH_SIZE)) {
          await connection.query(
            'UPDATE product_categories SET category_id = ? WHERE category_id = ? AND product_id IN (?)',
            [g.targetId, g.rootId, ids]
          );
        }
        for (const ids of chunk(g.primaryIds, BATCH_SIZE)) {
          await connection.query(
            'UPDATE products SET category_id = ? WHERE category_id = ? AND id IN (?)',
            [g.targetId, g.rootId, ids]
          );
        }
      }

      // Autre rayon : ajout en rayon secondaire, sans toucher au rayon principal
      for (const batch of chunk(links, BATCH_SIZE)) {
        await connection.query(
          'INSERT IGNORE INTO product_categories (product_id, category_id, is_primary) VALUES ?',
          [batch.map((l) => [l.productId, l.targetId, 0])]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    console.log('\nRangement appliqué. Redémarrer l’API pour vider le cache catalogue.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
