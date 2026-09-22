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
  /* Le produit existe déjà : on RÉARME son stock. Les tests d'intégration passent
     de vraies commandes, qui décrémentent le stock dans la même transaction. Sans
     cette remise à niveau, le seed finit par tomber à 0 au fil des exécutions et
     les suites panier/commandes échouent sur « Le panier est vide » — un échec
     qui dépend du nombre de fois où les tests ont déjà tourné, donc déroutant. */
  if (existing) {
    await pool.query(
      'UPDATE products SET stock = 100, is_active = 1, deleted_at = NULL WHERE id = ?',
      [existing.id]
    );
    return existing.id;
  }

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
