-- ============================================================
-- Migration : products.brand + suppression du système de tags
-- Date       : 2026-09-10
-- Contexte   : les « tags » mélangeaient deux notions — des thèmes
--              transversaux (Noël, Animaux…) seedés à la main ET la
--              marque/éditeur de chaque produit, injectée en masse par
--              l'import catalogue (un tag par Nom_Gamme, ~80 marques,
--              + ~4000 tags « thème » optionnels). Ce cumul rendait le
--              rangement illisible. La marque devient une simple colonne
--              products.brand ; la fonctionnalité tags est retirée
--              entièrement (page admin, routes, filtres catalogue).
-- Effet      : 1) ajoute products.brand (VARCHAR 120, nullable) + index
--                 composite (is_active, brand) pour le filtre catalogue ;
--              2) reporte l'ancienne marque (tag lié via product_tags,
--                 nom de tag = marque) dans products.brand quand elle
--                 existe encore, AVANT de supprimer les tables ;
--              3) supprime product_tags, tag_translations, tags.
-- Idempotent : gardes information_schema + PREPARE/EXECUTE (colonne,
--              index) ; DROP TABLE IF EXISTS pour les tables.
-- À exécuter : sur staging PUIS production, après backup.
-- Répercuté dans broderie.sql : oui (colonne + index ajoutés à products,
--              CREATE TABLE tags/tag_translations/product_tags retirés,
--              seed des thèmes retiré, DROP TABLE retirés).
-- ============================================================

-- ── products.brand ─────────────────────────────────────────
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'brand'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE products ADD COLUMN brand VARCHAR(120) NULL DEFAULT NULL AFTER ean',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── index (is_active, brand) ───────────────────────────────
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_active_brand'
);
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE products ADD INDEX idx_products_active_brand (is_active, brand)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── report des marques existantes (si les tables tags sont encore là) ──
-- Un produit peut porter plusieurs anciens tags ; on ne reprend que le
-- premier tag (id le plus bas) comme marque — suffisant pour ne pas
-- perdre l'information avant qu'elle soit revalidée en back-office.
SET @has_tags := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tags'
);
SET @ddl := IF(@has_tags > 0,
  'UPDATE products p
     JOIN (
       SELECT pt.product_id, MIN(pt.tag_id) AS tag_id
       FROM product_tags pt
       GROUP BY pt.product_id
     ) first_tag ON first_tag.product_id = p.id
     JOIN tag_translations tt ON tt.tag_id = first_tag.tag_id AND tt.locale = ''fr''
   SET p.brand = tt.name
   WHERE p.brand IS NULL',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── suppression des tables tags (ordre inverse des FK) ─────
DROP TABLE IF EXISTS product_tags;
DROP TABLE IF EXISTS tag_translations;
DROP TABLE IF EXISTS tags;
