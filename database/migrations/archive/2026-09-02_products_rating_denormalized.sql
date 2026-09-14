-- ============================================================
-- Migration : products.rating_avg / rating_count (dénormalisation)
-- Date       : 2026-09-02
-- Contexte   : les 3 requêtes de liste catalogue (findAll, findByCategoryId,
--              search) joignaient `reviews` puis GROUP BY sur ~28 colonnes pour
--              calculer AVG(rating) + COUNT — forçant une temporary table + un
--              filesort systématiques. À 14 000 produits, une simple page
--              catalogue dépassait la cible p95 < 200 ms.
-- Effet      : deux colonnes dénormalisées sur products, recalculées à
--              l'approbation / la suppression d'un avis (review.repository).
--              Les listes n'ont plus ni jointure reviews ni GROUP BY.
-- Sûr car    : valeurs initialisées depuis les avis approuvés existants ci-dessous.
--              Une divergence éventuelle se corrige en rejouant l'UPDATE final.
-- Idempotent : gardes information_schema pour les colonnes ; l'UPDATE de
--              réconciliation est rejouable.
-- À exécuter : sur staging PUIS production, après backup.
-- ============================================================

SET @has_avg := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'rating_avg'
);
SET @ddl := IF(@has_avg = 0,
  'ALTER TABLE products ADD COLUMN rating_avg DECIMAL(2,1) NOT NULL DEFAULT 0 AFTER is_featured',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_cnt := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'rating_count'
);
SET @ddl := IF(@has_cnt = 0,
  'ALTER TABLE products ADD COLUMN rating_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating_avg',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- Initialisation / réconciliation depuis les avis approuvés
UPDATE products p
LEFT JOIN (
  SELECT product_id,
         ROUND(AVG(rating), 1) AS avg_r,
         COUNT(*)              AS cnt_r
  FROM reviews
  WHERE is_approved = 1
  GROUP BY product_id
) agg ON agg.product_id = p.id
SET p.rating_avg   = COALESCE(agg.avg_r, 0),
    p.rating_count = COALESCE(agg.cnt_r, 0);

-- Index pour le tri catalogue par note (is_active en premier — règle projet)
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_active_rating'
);
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE products ADD INDEX idx_products_active_rating (is_active, rating_avg)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- Index pour le tri catalogue par défaut (created_at) — supprime le dernier filesort
SET @has_idx2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_active_created'
);
SET @ddl := IF(@has_idx2 = 0,
  'ALTER TABLE products ADD INDEX idx_products_active_created (is_active, created_at)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
