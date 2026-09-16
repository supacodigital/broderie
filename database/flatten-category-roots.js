#!/usr/bin/env node
/* ============================================================
 * Suppression du niveau racine de l'arborescence des catégories.
 *
 * L'arborescence comptait trois niveaux, dont cinq rayons génériques en tête —
 * « Broderie », « Fils à broder », « Toiles & Supports », « Accessoires &
 * Outils », « Loisirs & Strass ». Sur une boutique de broderie, ce premier
 * niveau n'apporte rien : « Broderie » regroupait à lui seul 12 928 des 15 357
 * articles, et la cliente cherche « Kits de Broderie » ou « Fils Coton »,
 * jamais « Broderie ».
 *
 * Ce script remonte leurs enfants d'un cran (ils deviennent les nouvelles
 * racines) et supprime les cinq catégories devenues vides. L'arborescence passe
 * ainsi de 3 à 2 niveaux, avec 15 rayons de tête.
 *
 * Les rattachements produits ne sont PAS touchés : aucun article n'est rangé
 * directement dans une racine — seules les liaisons n-n pointant vers elles sont
 * retirées, car elles deviendraient orphelines.
 *
 * Réversible : les cinq racines se recréent depuis broderie.sql, et les
 * `parent_id` remontés se réattribuent depuis le fichier catalogue de la cliente.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/flatten-category-roots.js --dry-run
 *   node ../database/flatten-category-roots.js
 * ============================================================ */

const path = require('path');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Les cinq rayons génériques à retirer, ciblés par slug (stable, contrairement au nom)
const ROOT_SLUGS = [
  'broderie',
  'fils-a-broder',
  'toiles-et-supports',
  'accessoires-et-outils',
  'loisirs-et-strass',
];

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
    const placeholders = ROOT_SLUGS.map(() => '?').join(',');
    const [roots] = await connection.query(
      `SELECT c.id, c.slug, ct.name
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
       WHERE c.slug IN (${placeholders}) AND c.parent_id IS NULL`,
      ROOT_SLUGS
    );

    if (roots.length === 0) {
      console.log('\nAucune des cinq racines n’est présente — arborescence déjà aplatie.');
      return;
    }

    const rootIds = roots.map((r) => r.id);
    const idPlaceholders = rootIds.map(() => '?').join(',');

    // Ce qui va être remonté
    const [children] = await connection.query(
      `SELECT c.id, c.slug, ct.name, c.parent_id
       FROM categories c
       LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'fr'
       WHERE c.parent_id IN (${idPlaceholders})
       ORDER BY c.sort_order, c.id`,
      rootIds
    );

    /* Un produit ne doit jamais être rangé DIRECTEMENT dans une racine : ce
       script le vérifie plutôt que de le supposer, car un tel produit perdrait
       sa catégorie (ON DELETE SET NULL) et disparaîtrait des rayons. */
    const [[direct]] = await connection.query(
      `SELECT COUNT(*) AS n FROM products
       WHERE category_id IN (${idPlaceholders}) AND deleted_at IS NULL`,
      rootIds
    );

    // Liaisons n-n pointant vers une racine : elles deviendraient orphelines
    const [[links]] = await connection.query(
      `SELECT COUNT(*) AS n FROM product_categories WHERE category_id IN (${idPlaceholders})`,
      rootIds
    );

    console.log(`\nRacines à supprimer ....... ${roots.length}`);
    roots.forEach((r) => console.log(`    [${r.id}] ${r.name ?? r.slug}`));
    console.log(`\nCatégories remontées en tête ${children.length}`);
    children.forEach((c) => console.log(`    [${c.id}] ${c.name ?? c.slug}`));
    console.log(`\nProduits rangés directement dans une racine : ${direct.n}`);
    console.log(`Liaisons n-n vers une racine (retirées) ..... ${links.n}`);

    if (direct.n > 0) {
      console.log('\n⚠ Des produits sont rangés directement dans une racine : ils perdraient');
      console.log('  leur catégorie. Les reclasser avant de relancer ce script.');
      process.exitCode = 1;
      return;
    }

    if (DRY_RUN) {
      console.log('\nSimulation terminée — relancer sans --dry-run pour appliquer.');
      return;
    }

    await connection.beginTransaction();
    try {
      /* Ordre d'affichage : les enfants d'une même racine gardaient un sort_order
         local (1, 2, 3…) qui se chevauchait d'une racine à l'autre. On le
         renumérote en suivant l'ordre d'origine (racine puis rang), sans quoi la
         boutique afficherait quinze rayons dans un ordre arbitraire. */
      let order = 1;
      for (const child of children) {
        await connection.execute(
          'UPDATE categories SET parent_id = NULL, sort_order = ? WHERE id = ?',
          [order++, child.id]
        );
      }

      // Liaisons n-n devenues sans objet
      await connection.execute(
        `DELETE FROM product_categories WHERE category_id IN (${idPlaceholders})`,
        rootIds
      );

      // Traductions puis catégories (les FK sont en CASCADE, mais l'ordre reste explicite)
      await connection.execute(
        `DELETE FROM category_translations WHERE category_id IN (${idPlaceholders})`,
        rootIds
      );
      await connection.execute(
        `DELETE FROM categories WHERE id IN (${idPlaceholders})`,
        rootIds
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    const [[remaining]] = await connection.query(
      'SELECT COUNT(*) AS n FROM categories WHERE parent_id IS NULL'
    );
    console.log(`\n✓ Arborescence aplatie — ${remaining.n} rayons de tête.`);
    console.log('\nPensez à redémarrer le backend pour vider le cache catalogue.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec de l’aplatissement :', err.message);
  process.exit(1);
});
