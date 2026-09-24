#!/usr/bin/env node
/* ============================================================
 * Mise à jour en masse du prix des cotons moulinés DMC (Art. 117).
 *
 * Demande cliente : « changer les prix des cotons moulinés DMC prix plein
 * 2.00 mettre 25% de rabais ils doivent être 1.50 ».
 *
 * Cible : products.brand = 'DMC Art.117' — 506 articles, tous à 2.00.
 *   ⚠ Ne PAS cibler par catégorie : catalog-category-map.js range cette marque
 *   dans « fils-coton » (niveau 2), et la catégorie « Mouliné Spécial (Art. 117) »
 *   est vide en base. Un filtre par catégorie ne remonterait rien.
 *
 * Effet par article :
 *   price_chf          = 1.50  (prix réellement payé)
 *   compare_price_chf  = 2.00  (ancien prix, barré en boutique)
 * Seuls les articles encore au prix plein attendu sont touchés : relancer le
 * script ne réapplique donc pas de remise sur une remise.
 *
 * ⚠ Un ré-import complet du catalogue (import-catalog.js) écrase price_chf et
 *   compare_price_chf depuis le fichier source : la baisse serait perdue et il
 *   faudrait relancer ce script après coup.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/update-prices-dmc.js --dry-run
 *   node ../database/update-prices-dmc.js
 *   node ../database/update-prices-dmc.js --price=1.30 --from=2.00
 * ============================================================ */

const path = require('path');

const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

// ── CLI ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const value = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};

const DRY_RUN   = has('--dry-run');
const BRAND     = value('brand', 'DMC Art.117');
const NEW_PRICE = parseFloat(value('price', '1.50'));
const OLD_PRICE = parseFloat(value('from', '2.00'));
// Prix barré : l'ancien prix, pour matérialiser la baisse en boutique.
// --no-compare permet une baisse sèche, sans prix barré.
const SHOW_COMPARE = !has('--no-compare');

// Arrondi suisse au 5 centimes — même règle que backend/utils/chf.utils.js
const roundCHF = (amount) => Math.round(amount * 20) / 20;

async function main() {
  if (!(NEW_PRICE > 0) || !(OLD_PRICE > 0)) {
    console.error('Prix invalide : --price et --from doivent être des montants positifs.');
    process.exit(1);
  }
  if (NEW_PRICE >= OLD_PRICE) {
    console.error(`Le nouveau prix (${NEW_PRICE}) doit être inférieur à l'ancien (${OLD_PRICE}).`);
    process.exit(1);
  }

  const price   = roundCHF(NEW_PRICE);
  const compare = SHOW_COMPARE ? roundCHF(OLD_PRICE) : null;
  const discount = Math.round((1 - price / OLD_PRICE) * 100);

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log(`\nMarque ciblée ......... ${BRAND}`);
    console.log(`Prix appliqué ......... CHF ${price.toFixed(2)} (au lieu de CHF ${OLD_PRICE.toFixed(2)} — ${discount} %)`);
    console.log(`Prix barré ............ ${compare === null ? 'aucun' : `CHF ${compare.toFixed(2)}`}`);
    if (DRY_RUN) console.log('Mode .................. SIMULATION (aucune écriture)');

    // État des lieux avant modification
    const [[stats]] = await connection.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(price_chf = ?) AS at_old_price,
         SUM(price_chf = ?) AS already_updated
       FROM products
       WHERE brand = ? AND deleted_at IS NULL`,
      [OLD_PRICE, price, BRAND]
    );

    console.log(`\nArticles de la marque . ${stats.total}`);
    console.log(`  au prix de départ ... ${stats.at_old_price ?? 0}`);
    console.log(`  déjà au nouveau prix  ${stats.already_updated ?? 0}`);

    if (Number(stats.total) === 0) {
      console.log(`\nAucun article pour la marque « ${BRAND} » — rien à faire.`);
      console.log('Vérifiez le libellé exact : SELECT DISTINCT brand FROM products;');
      return;
    }

    // Aperçu de ce qui serait modifié
    const [sample] = await connection.execute(
      `SELECT p.id, p.sku, pt.name, p.price_chf
       FROM products p
       LEFT JOIN product_translations pt ON pt.product_id = p.id AND pt.locale = 'fr'
       WHERE p.brand = ? AND p.deleted_at IS NULL AND p.price_chf = ?
       LIMIT 5`,
      [BRAND, OLD_PRICE]
    );
    if (sample.length) {
      console.log('\nExemples concernés :');
      sample.forEach((r) => console.log(`  #${r.id}  ${String(r.name ?? '').slice(0, 46).padEnd(46)} CHF ${Number(r.price_chf).toFixed(2)}`));
    }

    if (DRY_RUN) {
      console.log(`\n${stats.at_old_price ?? 0} article(s) seraient mis à jour. Relancer sans --dry-run pour appliquer.`);
      return;
    }

    // Transaction : soit toute la grille tarifaire bascule, soit rien.
    await connection.beginTransaction();

    /* Historique des prix (ADM-21) — enregistré AVANT la mise à jour, tant que
       l'ancien prix est encore lisible. Une ligne par article concerné, en une
       seule requête : jamais d'INSERT dans une boucle sur 500 références.
       `changed_by` reste NULL — un script n'a pas d'auteur ; c'est `source` qui
       distingue ce changement d'une décision saisie dans l'administration. */
    await connection.execute(
      `INSERT INTO product_price_history
         (product_id, old_price_chf, old_compare_price_chf, new_price_chf, new_compare_price_chf,
          promo_starts_at, promo_ends_at, source, changed_by)
       SELECT id, price_chf, compare_price_chf, ?, ?,
              -- Période de promotion inchangée par le script, conservée avec l'offre
              IF(? IS NULL, NULL, promo_starts_at), IF(? IS NULL, NULL, promo_ends_at), 'script', NULL
       FROM products
       WHERE brand = ? AND deleted_at IS NULL AND price_chf = ?`,
      [price, compare, compare, compare, BRAND, OLD_PRICE]
    );

    const [result] = await connection.execute(
      `UPDATE products
       SET price_chf = ?, compare_price_chf = ?, updated_at = NOW()
       WHERE brand = ? AND deleted_at IS NULL AND price_chf = ?`,
      [price, compare, BRAND, OLD_PRICE]
    );
    await connection.commit();

    console.log(`\n✓ ${result.affectedRows} article(s) mis à jour.`);
    console.log('\nPensez à vider le cache catalogue (redémarrage du backend) pour que');
    console.log('la boutique affiche immédiatement les nouveaux prix.');
  } catch (err) {
    try { await connection.rollback(); } catch { /* connexion déjà fermée */ }
    throw err;
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec de la mise à jour :', err.message);
  process.exit(1);
});
