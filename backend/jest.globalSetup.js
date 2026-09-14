// Exécuté une seule fois avant toute la suite (voir "globalSetup" dans
// package.json) — charge .env.test puis .env, et seede le catalogue minimal
// nécessaire aux tests d'intégration contre broderie_test.
require('dotenv').config({ path: __dirname + '/.env.test' });
require('dotenv').config({ path: __dirname + '/.env' });

const { pool } = require('./config/db');
const { ensureTestProduct } = require('./__tests__/helpers/seed-test-db');

module.exports = async () => {
  await ensureTestProduct();
  await pool.end();
};
