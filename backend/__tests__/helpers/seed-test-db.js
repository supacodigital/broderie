// Seed minimal de produits pour la base broderie_test — certains tests
// d'intégration (ex: orders.test.js) s'appuient sur un catalogue non vide
// (GET /products retourne au moins un article en stock). broderie.sql ne
// seede plus aucun produit de démo (source unique = import catalogue réel),
// donc broderie_test reste vide après import du schéma sans ce script.
const { pool } = require('../../config/db');

const TEST_SKU = 'TEST-SEED-001';

const ensureTestProduct = async () => {
  const [[existing]] = await pool.query(
    'SELECT id FROM products WHERE sku = ?',
    [TEST_SKU]
  );
  if (existing) return existing.id;

  const [result] = await pool.query(
    `INSERT INTO products
       (category_id, slug, price_chf, tax_rate_id, sku, stock, weight_kg, is_active)
     VALUES (101, 'produit-test-jest', 19.90, 1, ?, 100, 0.200, 1)`,
    [TEST_SKU]
  );
  const productId = result.insertId;

  await pool.query(
    `INSERT INTO product_translations (product_id, locale, name, description, slug)
     VALUES (?, 'fr', 'Produit de test Jest', 'Article créé pour les tests d\\'intégration.', 'produit-test-jest')`,
    [productId]
  );

  return productId;
};

module.exports = { ensureTestProduct };
