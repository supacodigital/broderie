// Chargé par Jest avant chaque suite (voir "setupFiles" dans package.json).
// .env.test est chargé EN PREMIER : dotenv ne réécrit jamais une variable déjà
// définie, donc DB_NAME=broderie_test (et les autres overrides de .env.test)
// priment sur .env, qui complète ensuite les secrets partagés (JWT, MFA...).
require('dotenv').config({ path: __dirname + '/.env.test' });
require('dotenv').config({ path: __dirname + '/.env' });
