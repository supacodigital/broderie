// Applique les migrations SQL à broderie_test avant la suite de tests.
//
// Sans cela, toute migration ajoutant une colonne fait échouer les tests
// d'intégration tant qu'on ne l'a pas appliquée à la main sur la base de test :
// le schéma de test dériverait silencieusement de celui de développement.
//
// Les migrations du projet sont idempotentes (gardes information_schema,
// CREATE TABLE IF NOT EXISTS) — les rejouer quand la base est à jour ne fait rien.
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '../../../database/migrations');

// Découpe un fichier SQL en instructions, commentaires de ligne retirés.
const splitStatements = (sql) => sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const migrateTestDb = async () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) return;

  /* Connexion dédiée, hors du pool applicatif : les migrations utilisent des
     variables de session (SET @… / PREPARE / EXECUTE), qui doivent toutes être
     exécutées sur la MÊME connexion pour avoir un sens. */
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      for (const statement of splitStatements(sql)) {
        try {
          await connection.query(statement);
        } catch (err) {
          // Une migration déjà appliquée peut légitimement échouer (index existant…).
          // On ne casse pas la suite pour autant : les tests vérifient le schéma.
          if (process.env.DEBUG_TEST_MIGRATIONS) {
            console.warn(`[migrations test] ${file} : ${err.sqlMessage || err.message}`);
          }
        }
      }
    }
  } finally {
    await connection.end();
  }
};

module.exports = { migrateTestDb };
