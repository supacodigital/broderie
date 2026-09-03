-- ============================================================
-- Migration : products.external_ref + products.ean
-- Date       : 2026-09-02
-- Contexte   : import du catalogue de la cliente (~15 900 articles) depuis
--              l'export de son logiciel métier (donnéesclient/V_ArticleC_INT.xlsx).
--              Deux besoins non couverts par le schéma actuel :
--                1. Pouvoir REJOUER l'import sans créer de doublon → il faut une
--                   clé stable côté source. C'est NArticleC (identifiant interne
--                   du logiciel de la cliente), stocké dans external_ref.
--                2. Le code-barres EAN (rempli sur ~28 % des articles) n'avait
--                   pas de colonne — utile SEO / scan douchette en boutique.
-- Effet      : deux colonnes nullables sur products.
--                - external_ref : UNIQUE → l'import fait un UPSERT dessus
--                  (INSERT ... ON DUPLICATE KEY UPDATE). Un article déjà importé
--                  est mis à jour, jamais dupliqué.
--                - ean : simple colonne, index non unique (des doublons EAN
--                  existent dans la source — 3 cas — on ne veut pas bloquer).
-- Sûr car    : colonnes nullables, valeur NULL par défaut pour tous les produits
--              existants (les 128 produits seedés n'ont pas de external_ref et
--              ne sont pas concernés par l'import).
-- Idempotent : gardes information_schema + PREPARE/EXECUTE (MySQL 8 n'a pas
--              ADD COLUMN IF NOT EXISTS).
-- À exécuter : sur staging PUIS production, après backup.
-- Répercuté dans broderie.sql : oui (colonnes + index dans CREATE TABLE products).
-- ============================================================

-- ── products.external_ref ──────────────────────────────────
SET @has_ext := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'external_ref'
);
SET @ddl := IF(@has_ext = 0,
  'ALTER TABLE products ADD COLUMN external_ref VARCHAR(32) NULL DEFAULT NULL AFTER sku',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_ext_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'uq_products_external_ref'
);
SET @ddl := IF(@has_ext_idx = 0,
  'ALTER TABLE products ADD UNIQUE KEY uq_products_external_ref (external_ref)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── products.ean ───────────────────────────────────────────
SET @has_ean := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ean'
);
SET @ddl := IF(@has_ean = 0,
  'ALTER TABLE products ADD COLUMN ean VARCHAR(20) NULL DEFAULT NULL AFTER external_ref',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_ean_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_ean'
);
SET @ddl := IF(@has_ean_idx = 0,
  'ALTER TABLE products ADD INDEX idx_products_ean (ean)',
  'DO 0');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
