-- ============================================================
-- Migration : stock minimum par article — ticket ADM-09
-- Date       : 2026-09-25
-- Contexte   : demande cliente — « Gestion basée uniquement sur la règle du
--              stock minimum (ex. fil DMC rouge : stock mini 10, reste en stock
--              10, commande client 5 => réassort 5) ». Solution attendue :
--              « calibrer la vue réassort uniquement sur le calcul du stock
--              minimum ».
--
-- `stock_min` se compte dans la même unité que `stock` : des pièces, ou des
-- centimètres pour un article vendu à la coupe (ADM-12). NULL = article non
-- suivi : il n'apparaît pas au réassort. À commander = stock_min - stock,
-- dès que le stock passe sous le minimum.
--
-- Idempotente (garde information_schema) : la base de test rejoue toutes les
-- migrations à chaque exécution. Aucun point-virgule dans les commentaires.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'stock_min');
SET @sql := IF(@col = 0,
  'ALTER TABLE products ADD COLUMN stock_min INT UNSIGNED NULL DEFAULT NULL AFTER stock',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
