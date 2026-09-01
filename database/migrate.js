#!/usr/bin/env node
/* ============================================================
 * Runner de migrations SQL — sans dépendance, sans ORM.
 *
 * Applique dans l'ordre alphabétique les fichiers database/migrations/*.sql
 * qui ne figurent pas encore dans la table schema_migrations.
 * Chaque migration tourne dans sa propre transaction (rollback si erreur).
 *
 * Usage :
 *   node database/migrate.js            # applique les migrations en attente
 *   node database/migrate.js --status   # liste appliquées / en attente, sans rien exécuter
 *   node database/migrate.js --dry-run  # montre ce qui serait appliqué
 *   node database/migrate.js --baseline # marque TOUTES les migrations comme appliquées
 *                                       # (sans les exécuter) — pour une base déjà à jour
 *                                       # à la mise en place du runner
 *
 * Charge .env.production si NODE_ENV=production, sinon .env (même logique que app.js).
 * ============================================================ */

const path = require('path');
const fs   = require('fs');

// Ce runner utilise les dépendances de backend/ (mysql2, dotenv) — il doit être
// lancé via `npm run db:migrate` depuis backend/, jamais directement avec `node`.
const BACKEND = path.join(__dirname, '../backend');
const mysql = require(path.join(BACKEND, 'node_modules/mysql2/promise'));
const dotenv = require(path.join(BACKEND, 'node_modules/dotenv'));

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(BACKEND, '.env.production') });
}
dotenv.config({ path: path.join(BACKEND, '.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

async function main() {
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true, // les fichiers de migration contiennent plusieurs statements
    charset:  'utf8mb4',
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) NOT NULL,
        applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] = await connection.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.map((r) => r.filename));

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (flag('--status')) {
      console.log(`\nMigrations — base « ${process.env.DB_NAME} »\n`);
      for (const f of files) {
        console.log(`  ${applied.has(f) ? '✅' : '⬜'} ${f}`);
      }
      console.log(`\n${applied.size} appliquée(s), ${pending.length} en attente.\n`);
      return;
    }

    if (flag('--baseline')) {
      if (pending.length === 0) {
        console.log('✅ Rien à marquer — toutes les migrations sont déjà suivies.');
        return;
      }
      for (const filename of pending) {
        await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
        console.log(`  📎 ${filename} — marquée appliquée (non exécutée)`);
      }
      console.log(`\n✅ ${pending.length} migration(s) marquée(s). N'utiliser --baseline QUE sur une base déjà à jour.`);
      return;
    }

    if (pending.length === 0) {
      console.log('✅ Aucune migration en attente.');
      return;
    }

    console.log(`${pending.length} migration(s) à appliquer :\n`);

    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');

      if (flag('--dry-run')) {
        console.log(`  ⬜ ${filename} (dry-run — non exécuté)`);
        continue;
      }

      process.stdout.write(`  ⏳ ${filename} ... `);
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
        await connection.commit();
        console.log('✅');
      } catch (err) {
        await connection.rollback();
        console.log('❌');
        console.error(`\n     ${err.message}\n`);
        throw new Error(`Migration ${filename} échouée — rollback effectué, arrêt.`);
      }
    }

    console.log('\n✅ Toutes les migrations en attente ont été appliquées.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
