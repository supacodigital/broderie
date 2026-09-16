#!/usr/bin/env node
/* ============================================================
 * Création des fournisseurs à partir de la colonne « Fournisseur »
 * du fichier catalogue complété par la cliente.
 *
 * La cliente a renseigné les noms de ses fournisseurs directement dans le
 * fichier catalogue (livraison du 2026-09-16), sans fichier dédié : c'est donc
 * la seule source disponible. Seul le NOM est connu — contact, email, téléphone
 * et adresse restent vides, à compléter depuis l'administration.
 *
 * Le script est IDEMPOTENT : un fournisseur déjà présent (comparaison sur le nom,
 * insensible à la casse et aux espaces) n'est jamais dupliqué. Il peut donc être
 * relancé à chaque nouvelle livraison de fichier.
 *
 * Il ne rattache PAS les produits : c'est le rôle d'import-catalog-updates.js,
 * à lancer ensuite, qui apparie par nom de fournisseur.
 *
 * Usage (toujours depuis backend/ — utilise backend/node_modules + .env) :
 *   node ../database/import-suppliers.js --dry-run
 *   node ../database/import-suppliers.js
 *   node ../database/import-suppliers.js --excel=chemin.xlsx
 * ============================================================ */

const path = require('path');

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
const EXCEL_PATH = path.resolve(
  value('excel', path.join(__dirname, '../donnees-client/Catalogue-articles.xlsx'))
);

const COL_SUPPLIER = 'Fournisseur';

const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

async function main() {
  console.log(`\nFichier .......... ${EXCEL_PATH}`);
  if (DRY_RUN) console.log('Mode ............. SIMULATION (aucune écriture)');

  const rows = readSheetObjects(EXCEL_PATH, { sheetName: 'Catalogue', headerRow: 3 });

  /* Noms distincts, dédoublonnés sur une clé normalisée mais CONSERVÉS dans leur
     graphie d'origine : « DMC sas » doit être créé tel que la cliente l'a écrit. */
  const byKey = new Map();
  for (const row of rows) {
    const name = cleanStr(row[COL_SUPPLIER]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name, count: 0 });
    byKey.get(key).count += 1;
  }

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const [existing] = await connection.execute('SELECT id, name FROM suppliers');
    const existingKeys = new Set(existing.map((s) => s.name.trim().toLowerCase()));

    const toCreate = [...byKey.values()]
      .filter((s) => !existingKeys.has(s.name.toLowerCase()))
      .sort((a, b) => b.count - a.count);

    console.log(`\nFournisseurs dans le fichier ... ${byKey.size}`);
    console.log(`Déjà en base .................. ${byKey.size - toCreate.length}`);
    console.log(`À créer ....................... ${toCreate.length}`);

    if (toCreate.length > 0) {
      console.log('');
      toCreate.forEach((s) => {
        console.log(`  ${String(s.count).padStart(6)} article(s)  ${s.name}`);
      });
    }

    if (DRY_RUN) {
      console.log('\nSimulation terminée — relancer sans --dry-run pour appliquer.');
      return;
    }
    if (toCreate.length === 0) {
      console.log('\nRien à créer.');
      return;
    }

    // Insertion groupée dans une transaction — un seul aller-retour SQL
    await connection.beginTransaction();
    try {
      const placeholders = toCreate.map(() => '(?)').join(', ');
      await connection.query(
        `INSERT INTO suppliers (name) VALUES ${placeholders}`,
        toCreate.map((s) => s.name)
      );
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }

    console.log(`\n✓ ${toCreate.length} fournisseur(s) créé(s).`);
    console.log('  Coordonnées (email, téléphone, adresse) à compléter depuis l’administration.');
    console.log('\nÉtape suivante : npm run import:catalog-updates -- --dry-run');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nÉchec de l’import des fournisseurs :', err.message);
  process.exit(1);
});
